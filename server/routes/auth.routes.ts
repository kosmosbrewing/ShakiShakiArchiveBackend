// server/routes/auth.routes.ts
// 인증 관련 라우트 (/api/auth/*)

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  isAuthenticated,
  isAdmin,
  invalidateUserCache,
} from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { regenerateSession, saveSession } from "../utils/session";
import { authRateLimiter, emailSendRateLimiter } from "../config/security";
import {
  signupSchema,
  loginSchema,
  sendVerificationCodeSchema,
  verifyEmailCodeSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateUserSchema,
} from "@shared/schema";
import {
  generateVerificationCode,
  getCodeExpiryTime,
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../services/email.service";
import { notifyAdminLogin2FA } from "../services/telegram.service";
import { config } from "../config";
import { createLogger } from "../utils/logger";
import {
  AUTH_MESSAGES,
  SUCCESS_MESSAGES,
} from "@shared/constants/messages";

const router = Router();
const logger = createLogger("Auth");

const ADMIN_2FA_TTL_MS = 5 * 60 * 1000;
const ADMIN_2FA_EXPIRES_IN_MINUTES = ADMIN_2FA_TTL_MS / 60_000;
const ADMIN_2FA_MAX_ATTEMPTS = 5;

const admin2FAVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^(?:\d{4}|\d{6})$/),
});

function generateAdmin2FACode(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

function hashAdmin2FACode(challengeId: string, code: string): string {
  return createHmac("sha256", config.sessionSecret)
    .update(`${challengeId}:${code}`)
    .digest("hex");
}

function hashAdmin2FARecoveryCode(code: string): string {
  return createHmac("sha256", config.sessionSecret)
    .update(`admin-2fa-recovery:${code}`)
    .digest("hex");
}

function isSameHash(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isRecoveryCodeEnabled(): boolean {
  return /^\d{6}$/.test(config.admin2fa.recoveryCode);
}

function isRecoveryCodeValid(code: string): boolean {
  if (!isRecoveryCodeEnabled()) return false;

  return isSameHash(
    hashAdmin2FARecoveryCode(config.admin2fa.recoveryCode),
    hashAdmin2FARecoveryCode(code)
  );
}

function clearAdmin2FAChallenge(req: Request): void {
  delete req.session.pendingAdminUserId;
  delete req.session.admin2faChallengeId;
  delete req.session.admin2faCodeHash;
  delete req.session.admin2faExpiresAt;
  delete req.session.admin2faAttemptCount;
  delete req.session.admin2faRecoveryAllowed;
}

// ------------------------------------------------------------------
// 유틸리티 함수: 이메일 마스킹 (개인정보 보호)
// ------------------------------------------------------------------
/**
 * 로그에서 이메일 주소를 마스킹 처리
 * 예: test@example.com → t**t@example.com
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***"; // 유효하지 않은 이메일

  const maskedLocal =
    local.length > 2
      ? local[0] + "*".repeat(local.length - 2) + local[local.length - 1]
      : local[0] + "*";

  return `${maskedLocal}@${domain}`;
}

// 인증 관련 엔드포인트에 Rate Limiting 적용 (Brute Force 방지)

// 회원가입
router.post("/signup", authRateLimiter, asyncHandler(async (req, res) => {
  const validatedData = signupSchema.parse(req.body);

  // 이메일 인증 완료 여부 확인
  const isVerified = await storage.isEmailVerified(
    validatedData.email,
    "signup"
  );
  if (!isVerified) {
    logger.warn(`Signup failed: Email not verified - email=${maskEmail(validatedData.email)}`);
    return res.status(400).json({
      message: AUTH_MESSAGES.EMAIL_NOT_VERIFIED,
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  const existingUser = await storage.getUserByEmail(validatedData.email);
  if (existingUser) {
    logger.warn(`Signup failed: Email already exists - email=${maskEmail(validatedData.email)}`);
    return res.status(400).json({ message: AUTH_MESSAGES.EMAIL_EXISTS });
  }

  const passwordHash = await hashPassword(validatedData.password);

  const user = await storage.createUser({
    email: validatedData.email,
    passwordHash,
    userName: validatedData.userName,
    zipCode: validatedData.zipCode,
    address: validatedData.address,
    detailAddress: validatedData.detailAddress,
    phone: validatedData.phone,
    emailOptIn: validatedData.emailOptIn ?? false,
  });

  // 보안: 인증 상태 초기화 (재사용 방지)
  await storage.clearEmailVerification(validatedData.email, "signup");

  req.session.userId = user.id;

  // 보안 로깅: 회원가입 성공
  logger.info(`Signup successful - userId=${user.id}, email=${maskEmail(validatedData.email)}`);

  const { passwordHash: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
}));

// 로그인
router.post("/login", authRateLimiter, asyncHandler(async (req, res) => {
  const validatedData = loginSchema.parse(req.body);

  const user = await storage.getUserByEmail(validatedData.email);
  if (!user) {
    // 보안 로깅: 실패한 로그인 시도 (존재하지 않는 이메일)
    logger.warn(`Login failed: User not found - email=${maskEmail(validatedData.email)}`);
    return res
      .status(401)
      .json({ message: AUTH_MESSAGES.INVALID_CREDENTIALS });
  }

  // 소셜 로그인 사용자는 비밀번호로 로그인 불가
  if (!user.passwordHash) {
    logger.warn(`Login failed: Social login account attempted password login - email=${maskEmail(validatedData.email)}`);
    return res.status(401).json({
      message: AUTH_MESSAGES.SOCIAL_LOGIN_ACCOUNT,
    });
  }

  const isValidPassword = await verifyPassword(
    validatedData.password,
    user.passwordHash
  );
  if (!isValidPassword) {
    // 보안 로깅: 실패한 로그인 시도 (비밀번호 불일치)
    logger.warn(`Login failed: Invalid password - email=${maskEmail(validatedData.email)}, userId=${user.id}`);
    return res
      .status(401)
      .json({ message: AUTH_MESSAGES.INVALID_CREDENTIALS });
  }

  await regenerateSession(req);

  if (user.isAdmin) {
    if (config.isProd && !config.telegram.isEnabled) {
      logger.error("Admin 2FA Telegram is not configured in production; recovery fallback will be used if available", {
        userId: user.id,
        email: maskEmail(user.email),
      });
    }

    const challengeId = randomUUID();
    const code = generateAdmin2FACode();

    req.session.pendingAdminUserId = user.id;
    req.session.admin2faChallengeId = challengeId;
    req.session.admin2faCodeHash = hashAdmin2FACode(challengeId, code);
    req.session.admin2faExpiresAt = new Date(Date.now() + ADMIN_2FA_TTL_MS).toISOString();
    req.session.admin2faAttemptCount = 0;
    req.session.admin2faRecoveryAllowed = false;
    delete req.session.userId;
    delete req.session.admin2faVerifiedAt;

    const telegramResult = config.telegram.isEnabled
      ? await notifyAdminLogin2FA({
          email: user.email,
          code,
          expiresInMinutes: ADMIN_2FA_EXPIRES_IN_MINUTES,
          ip: req.ip,
        })
      : { success: false, error: "Telegram is not configured" };

    if (!telegramResult.success && config.isProd) {
      if (!isRecoveryCodeEnabled()) {
        clearAdmin2FAChallenge(req);
        logger.error("Admin 2FA delivery failed and recovery code is not configured", {
          userId: user.id,
          email: maskEmail(user.email),
          error: telegramResult.error,
        });
        await saveSession(req);
        return res.status(503).json({
          message: "관리자 2차 인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
          code: "ADMIN_2FA_DELIVERY_FAILED",
        });
      }

      req.session.admin2faRecoveryAllowed = true;
      logger.error("Admin 2FA delivery failed; recovery code fallback enabled", {
        userId: user.id,
        email: maskEmail(user.email),
        error: telegramResult.error,
      });
      await saveSession(req);
      return res.status(202).json({
        requiresAdmin2FA: true,
        challengeId,
        expiresInSeconds: ADMIN_2FA_TTL_MS / 1000,
        admin2faFallbackAvailable: true,
      });
    }

    if (!telegramResult.success && !config.isProd) {
      logger.warn("Admin 2FA Telegram delivery skipped in local environment", {
        userId: user.id,
        email: maskEmail(user.email),
        error: telegramResult.error,
        devCode: code,
      });
    }

    await saveSession(req);

    logger.info(`Admin login requires 2FA - userId=${user.id}, email=${maskEmail(validatedData.email)}`);
    return res.status(202).json({
      requiresAdmin2FA: true,
      challengeId,
      expiresInSeconds: ADMIN_2FA_TTL_MS / 1000,
      ...(config.isProd ? {} : { devCode: code }),
    });
  }

  req.session.userId = user.id;
  delete req.session.admin2faVerifiedAt;
  clearAdmin2FAChallenge(req);
  await saveSession(req);

  // 보안 로깅: 성공한 로그인
  logger.info(`Login successful - userId=${user.id}, email=${maskEmail(validatedData.email)}`);

  const { passwordHash: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
}));

// 로그인 완료된 관리자 세션의 고위험 작업용 2차 인증 challenge 발급
router.post("/admin-2fa/challenge", authRateLimiter, isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const email = req.user?.email;

  if (!userId || !email) {
    return res.status(401).json({
      message: AUTH_MESSAGES.REQUIRED,
      code: "AUTH_REQUIRED",
    });
  }

  const challengeId = randomUUID();
  const code = generateAdmin2FACode();

  req.session.pendingAdminUserId = userId;
  req.session.admin2faChallengeId = challengeId;
  req.session.admin2faCodeHash = hashAdmin2FACode(challengeId, code);
  req.session.admin2faExpiresAt = new Date(Date.now() + ADMIN_2FA_TTL_MS).toISOString();
  req.session.admin2faAttemptCount = 0;
  req.session.admin2faRecoveryAllowed = false;

  const telegramResult = config.telegram.isEnabled
    ? await notifyAdminLogin2FA({
        email,
        code,
        expiresInMinutes: ADMIN_2FA_EXPIRES_IN_MINUTES,
        ip: req.ip,
      })
    : { success: false, error: "Telegram is not configured" };

  if (!telegramResult.success && config.isProd) {
    if (!isRecoveryCodeEnabled()) {
      clearAdmin2FAChallenge(req);
      logger.error("Admin action 2FA delivery failed and recovery code is not configured", {
        userId,
        email: maskEmail(email),
        error: telegramResult.error,
      });
      await saveSession(req);
      return res.status(503).json({
        message: "관리자 2차 인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
        code: "ADMIN_2FA_DELIVERY_FAILED",
      });
    }

    req.session.admin2faRecoveryAllowed = true;
    logger.error("Admin action 2FA delivery failed; recovery code fallback enabled", {
      userId,
      email: maskEmail(email),
      error: telegramResult.error,
    });
    await saveSession(req);
    return res.status(202).json({
      requiresAdmin2FA: true,
      challengeId,
      expiresInSeconds: ADMIN_2FA_TTL_MS / 1000,
      admin2faFallbackAvailable: true,
    });
  }

  if (!telegramResult.success && !config.isProd) {
    logger.warn("Admin action 2FA Telegram delivery skipped in local environment", {
      userId,
      email: maskEmail(email),
      error: telegramResult.error,
      devCode: code,
    });
  }

  await saveSession(req);

  logger.info("Admin action 2FA challenge issued", {
    userId,
    email: maskEmail(email),
  });

  return res.status(202).json({
    requiresAdmin2FA: true,
    challengeId,
    expiresInSeconds: ADMIN_2FA_TTL_MS / 1000,
    ...(config.isProd ? {} : { devCode: code }),
  });
}));

// 관리자 로그인 2차 인증 확인
router.post("/admin-2fa/verify", authRateLimiter, asyncHandler(async (req, res) => {
  const validatedData = admin2FAVerifySchema.parse(req.body);
  const {
    pendingAdminUserId,
    admin2faChallengeId,
    admin2faCodeHash,
    admin2faExpiresAt,
    admin2faRecoveryAllowed,
  } = req.session;

  if (
    !pendingAdminUserId ||
    !admin2faChallengeId ||
    !admin2faCodeHash ||
    !admin2faExpiresAt ||
    admin2faChallengeId !== validatedData.challengeId
  ) {
    return res.status(401).json({
      message: "관리자 2차 인증이 필요합니다.",
      code: "ADMIN_2FA_REQUIRED",
    });
  }

  const expiresAtMs = Date.parse(admin2faExpiresAt);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    clearAdmin2FAChallenge(req);
    await saveSession(req);
    return res.status(401).json({
      message: "관리자 인증번호가 만료되었습니다. 다시 로그인해주세요.",
      code: "ADMIN_2FA_EXPIRED",
    });
  }

  const attemptCount = req.session.admin2faAttemptCount ?? 0;
  if (attemptCount >= ADMIN_2FA_MAX_ATTEMPTS) {
    clearAdmin2FAChallenge(req);
    await saveSession(req);
    return res.status(429).json({
      message: "관리자 인증 시도 횟수를 초과했습니다. 다시 로그인해주세요.",
      code: "ADMIN_2FA_ATTEMPTS_EXCEEDED",
    });
  }

  req.session.admin2faAttemptCount = attemptCount + 1;
  const actualHash = hashAdmin2FACode(admin2faChallengeId, validatedData.code);
  const isTelegramCodeValid = isSameHash(admin2faCodeHash, actualHash);
  const isRecoveryLogin = !!admin2faRecoveryAllowed && isRecoveryCodeValid(validatedData.code);

  if (!isTelegramCodeValid && !isRecoveryLogin) {
    await saveSession(req);
    logger.warn("Admin 2FA verification failed", {
      userId: pendingAdminUserId,
      attemptCount: req.session.admin2faAttemptCount,
      recoveryAllowed: !!admin2faRecoveryAllowed,
    });
    return res.status(401).json({
      message: "관리자 인증번호가 올바르지 않습니다.",
      code: "ADMIN_2FA_INVALID_CODE",
    });
  }

  const user = await storage.getUser(pendingAdminUserId);
  if (!user?.isAdmin) {
    clearAdmin2FAChallenge(req);
    await saveSession(req);
    return res.status(403).json({
      message: AUTH_MESSAGES.ADMIN_REQUIRED,
      code: "ADMIN_REQUIRED",
    });
  }

  req.session.userId = user.id;
  req.session.admin2faVerifiedAt = new Date().toISOString();
  clearAdmin2FAChallenge(req);
  await saveSession(req);

  logger.info("Admin 2FA verification successful", {
    userId: user.id,
    email: maskEmail(user.email),
    method: isRecoveryLogin ? "recovery" : "telegram",
  });

  const { passwordHash: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
}));

// 로그아웃
router.post("/logout", (req, res) => {
  const userId = req.session.userId;
  req.session.destroy((err) => {
    if (err) {
      return res
        .status(500)
        .json({ message: AUTH_MESSAGES.LOGOUT_ERROR });
    }
    // 캐시 무효화
    if (userId) {
      invalidateUserCache(userId);
    }
    res.clearCookie("connect.sid");
    res.json({ message: SUCCESS_MESSAGES.LOGOUT });
  });
});

// 현재 사용자 정보 조회
router.get("/user", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(404).json({ message: AUTH_MESSAGES.USER_NOT_FOUND });
  }
  const { passwordHash: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
}));

// 사용자 정보 수정 핸들러 (PATCH, PUT 공통 사용)
const updateUserHandler = asyncHandler(async (req, res) => {
  const userId = req.session.userId!;

  // Zod 스키마로 입력 검증 (XSS, 길이 제한, 형식 검증)
  const validatedData = updateUserSchema.parse(req.body);

  const updateData: Record<string, unknown> = {};
  if (validatedData.userName !== undefined) updateData.userName = validatedData.userName;
  if (validatedData.phone !== undefined) updateData.phone = validatedData.phone;
  if (validatedData.zipCode !== undefined) updateData.zipCode = validatedData.zipCode;
  if (validatedData.address !== undefined) updateData.address = validatedData.address;
  if (validatedData.detailAddress !== undefined) updateData.detailAddress = validatedData.detailAddress;
  if (validatedData.emailOptIn !== undefined) updateData.emailOptIn = validatedData.emailOptIn;

  const updatedUser = await storage.updateUser(userId, updateData);

  if (!updatedUser) {
    return res.status(404).json({ message: AUTH_MESSAGES.USER_NOT_FOUND });
  }

  // 캐시 무효화
  invalidateUserCache(userId);

  logger.info(`User profile updated: userId=${userId}`);

  res.json({ message: SUCCESS_MESSAGES.INFO_UPDATED, user: updatedUser });
});

// 사용자 정보 수정 (PATCH, PUT 둘 다 지원)
router.patch("/user", isAuthenticated, updateUserHandler);
router.put("/user", isAuthenticated, updateUserHandler);

// 비밀번호 변경 (로그인한 사용자)
router.put("/password", authRateLimiter, isAuthenticated, asyncHandler(async (req, res) => {
  const validatedData = changePasswordSchema.parse(req.body);
  const { currentPassword, newPassword } = validatedData;
  const userId = req.session.userId!;

  const user = await storage.getUser(userId);
  if (!user) {
    logger.error(`Password change failed: User not found - userId=${userId}`);
    return res.status(404).json({ message: AUTH_MESSAGES.USER_NOT_FOUND });
  }

  // 소셜 로그인 사용자는 비밀번호 변경 불가
  if (!user.passwordHash) {
    logger.warn(`Password change failed: Social login account - userId=${userId}, email=${maskEmail(user.email)}`);
    return res.status(400).json({
      message: AUTH_MESSAGES.SOCIAL_PASSWORD_CHANGE_FORBIDDEN,
    });
  }

  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    // 보안 로깅: 현재 비밀번호 불일치 (계정 탈취 시도 가능)
    logger.warn(`Password change failed: Current password mismatch - userId=${userId}, email=${maskEmail(user.email)}`);
    return res
      .status(401)
      .json({ message: AUTH_MESSAGES.CURRENT_PASSWORD_MISMATCH });
  }

  // 동일 비밀번호 제한: 기존 비밀번호와 동일한지 확인
  const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
  if (isSamePassword) {
    logger.warn(`Password change failed: Same as current password - userId=${userId}`);
    return res.status(400).json({
      message: AUTH_MESSAGES.SAME_PASSWORD,
    });
  }

  const newPasswordHash = await hashPassword(newPassword);
  await storage.updateUser(userId, { passwordHash: newPasswordHash });

  // 보안: 비밀번호 변경 시 다른 기기/세션 무효화 (현재 세션은 유지).
  // 실패해도 비밀번호는 이미 변경됐으므로 로깅 후 계속 진행.
  try {
    const revoked = await storage.deleteUserSessions(userId, req.sessionID);
    if (revoked > 0) {
      logger.info(`Other sessions revoked after password change - userId=${userId}, count=${revoked}`);
    }
  } catch (err) {
    logger.error(`Failed to revoke other sessions after password change - userId=${userId}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 보안 로깅: 비밀번호 변경 성공
  logger.info(`Password changed successfully - userId=${userId}, email=${maskEmail(user.email)}`);

  res.json({ message: SUCCESS_MESSAGES.PASSWORD_CHANGED });
}));

// 비밀번호 재설정 (비로그인 사용자)
router.post("/reset-password", authRateLimiter, asyncHandler(async (req, res) => {
  const validatedData = resetPasswordSchema.parse(req.body);
  const { email, newPassword } = validatedData;

  // 이메일 인증 완료 여부 확인
  const isVerified = await storage.isEmailVerified(email, "password_reset");
  if (!isVerified) {
    return res.status(400).json({
      message: AUTH_MESSAGES.EMAIL_NOT_VERIFIED,
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  // 사용자 조회
  // 보안: 이메일 enumeration 방지를 위해 미존재/소셜 사용자 모두 통일된 응답
  // (이미 isEmailVerified 가드를 통과했으므로, 여기서의 분기는 정보 누설을 줄이는 깊이 방어)
  const user = await storage.getUserByEmail(email);
  if (!user || !user.passwordHash) {
    return res.status(400).json({
      message: AUTH_MESSAGES.EMAIL_NOT_VERIFIED,
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  // 동일 비밀번호 제한: 기존 비밀번호와 동일한지 확인
  const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
  if (isSamePassword) {
    return res.status(400).json({
      message: AUTH_MESSAGES.SAME_PASSWORD_RESET,
    });
  }

  // 새 비밀번호 해시화 및 업데이트
  const newPasswordHash = await hashPassword(newPassword);
  await storage.updateUser(user.id, { passwordHash: newPasswordHash });

  // 보안: 재설정은 비로그인 흐름이므로 해당 사용자의 모든 세션을 무효화
  // (계정 탈취자의 기존 세션 제거). 실패해도 재설정은 완료됐으므로 계속 진행.
  try {
    const revoked = await storage.deleteUserSessions(user.id);
    if (revoked > 0) {
      logger.info(`All sessions revoked after password reset - userId=${user.id}, count=${revoked}`);
    }
  } catch (err) {
    logger.error(`Failed to revoke sessions after password reset - userId=${user.id}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 보안: 인증 상태 초기화 (재사용 방지)
  await storage.clearEmailVerification(email, "password_reset");

  logger.info(`Password reset successful - userId=${user.id}, email=${maskEmail(email)}`);

  res.json({ message: SUCCESS_MESSAGES.PASSWORD_RESET });
}));

// ------------------------------------------------------------------
// 이메일 인증 API
// ------------------------------------------------------------------

/**
 * 이메일 인증코드 발송
 * POST /api/auth/send-verification
 */
router.post("/send-verification", emailSendRateLimiter, asyncHandler(async (req, res) => {
  const validatedData = sendVerificationCodeSchema.parse(req.body);
  const { email, type } = validatedData;

  // 회원가입 인증인 경우: 이미 가입된 이메일인지 확인
  if (type === "signup") {
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: AUTH_MESSAGES.EMAIL_EXISTS });
    }
  }

  // 비밀번호 재설정인 경우: 가입된 이메일인지 확인
  if (type === "password_reset") {
    const existingUser = await storage.getUserByEmail(email);
    if (!existingUser) {
      // 보안상 존재 여부를 노출하지 않고 성공 응답
      return res.json({ message: SUCCESS_MESSAGES.EMAIL_SENT });
    }
    // 소셜 로그인 사용자는 비밀번호 재설정 불가
    if (!existingUser.passwordHash) {
      return res.status(400).json({
        message: AUTH_MESSAGES.SOCIAL_LOGIN_ACCOUNT,
      });
    }
  }

  // 인증코드 생성
  const code = generateVerificationCode();
  const expiresAt = getCodeExpiryTime();

  // DB에 저장
  await storage.createEmailVerification({
    email,
    code,
    type,
    expiresAt,
  });

  // 이메일 발송
  const emailResult =
    type === "signup"
      ? await sendVerificationEmail(email, code)
      : await sendPasswordResetEmail(email, code);

  if (!emailResult.success) {
    return res.status(500).json({ message: AUTH_MESSAGES.EMAIL_SEND_FAILED });
  }

  res.json({ message: SUCCESS_MESSAGES.EMAIL_SENT });
}));

/**
 * 이메일 인증코드 확인
 * POST /api/auth/verify-email
 */
router.post("/verify-email", authRateLimiter, asyncHandler(async (req, res) => {
  const validatedData = verifyEmailCodeSchema.parse(req.body);
  const { email, code, type } = validatedData;

  // 유효한 인증코드 조회
  const verification = await storage.getValidVerification(email, code, type);

  if (!verification) {
    return res.status(400).json({
      message: AUTH_MESSAGES.VERIFICATION_INVALID,
    });
  }

  // 인증코드 사용 처리
  await storage.markVerificationAsUsed(verification.id);

  res.json({
    message: SUCCESS_MESSAGES.EMAIL_VERIFIED,
    verified: true,
  });
}));

/**
 * 이메일 인증 상태 확인
 * GET /api/auth/check-verification?email=xxx&type=signup
 */
router.get("/check-verification", asyncHandler(async (req, res) => {
  const email = req.query.email as string;
  const type = (req.query.type as string) || "signup";

  if (!email) {
    return res.status(400).json({ message: AUTH_MESSAGES.EMAIL_REQUIRED });
  }

  const isVerified = await storage.isEmailVerified(email, type);

  res.json({ email, type, verified: isVerified });
}));

/**
 * 비밀번호 확인 (관리자 인증용)
 * POST /api/auth/verify-password
 *
 * - 인증된 사용자만 사용 가능
 * - 현재 로그인한 사용자의 비밀번호 확인
 * - Rate Limiting 적용 (Brute Force 방지)
 */
router.post("/verify-password", isAuthenticated, authRateLimiter, asyncHandler(async (req, res) => {
  const { password } = req.body;
  const userId = req.session.userId!; // isAuthenticated에서 검증됨

  // 비밀번호 입력 확인
  if (!password) {
    return res.status(400).json({
      message: AUTH_MESSAGES.PASSWORD_REQUIRED
    });
  }

  // 사용자 조회
  const user = await storage.getUser(userId);
  if (!user) {
    logger.warn(`Password verification failed: User not found - userId=${userId}`);
    return res.status(404).json({
      message: AUTH_MESSAGES.USER_NOT_FOUND
    });
  }

  // 소셜 로그인 사용자 처리
  if (!user.passwordHash) {
    logger.warn(`Password verification failed: Social login account - userId=${userId}`);
    return res.status(400).json({
      message: AUTH_MESSAGES.SOCIAL_NO_PASSWORD,
      verified: false
    });
  }

  // 비밀번호 확인
  const isValidPassword = await verifyPassword(password, user.passwordHash);

  if (isValidPassword) {
    logger.info(`Password verification successful - userId=${userId}`);
    res.json({ verified: true });
  } else {
    logger.warn(`Password verification failed: Invalid password - userId=${userId}`);
    res.json({ verified: false });
  }
}));

export default router;
