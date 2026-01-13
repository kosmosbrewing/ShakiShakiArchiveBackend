// server/routes/auth.routes.ts
// 인증 관련 라우트 (/api/auth/*)

import { Router } from "express";
import { storage } from "../storage";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  isAuthenticated,
  invalidateUserCache,
} from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { authRateLimiter } from "../config/security";
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
import { createLogger } from "../utils/logger";

const router = Router();
const logger = createLogger("Auth");

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
      message: "이메일 인증이 완료되지 않았습니다",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  const existingUser = await storage.getUserByEmail(validatedData.email);
  if (existingUser) {
    logger.warn(`Signup failed: Email already exists - email=${maskEmail(validatedData.email)}`);
    return res.status(400).json({ message: "이미 사용 중인 이메일입니다" });
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
      .json({ message: "이메일 또는 비밀번호가 올바르지 않습니다" });
  }

  // 소셜 로그인 사용자는 비밀번호로 로그인 불가
  if (!user.passwordHash) {
    logger.warn(`Login failed: Social login account attempted password login - email=${maskEmail(validatedData.email)}`);
    return res.status(401).json({
      message: "소셜 로그인으로 가입한 계정입니다. 해당 소셜 서비스로 로그인해주세요.",
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
      .json({ message: "이메일 또는 비밀번호가 올바르지 않습니다" });
  }

  req.session.userId = user.id;

  // 보안 로깅: 성공한 로그인
  logger.info(`Login successful - userId=${user.id}, email=${maskEmail(validatedData.email)}`);

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
        .json({ message: "로그아웃 중 오류가 발생했습니다" });
    }
    // 캐시 무효화
    if (userId) {
      invalidateUserCache(userId);
    }
    res.clearCookie("connect.sid");
    res.json({ message: "로그아웃되었습니다" });
  });
});

// 현재 사용자 정보 조회
router.get("/user", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
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
    return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
  }

  // 캐시 무효화
  invalidateUserCache(userId);

  logger.info(`User profile updated: userId=${userId}`);

  res.json({ message: "정보가 수정되었습니다", user: updatedUser });
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
    return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
  }

  // 소셜 로그인 사용자는 비밀번호 변경 불가
  if (!user.passwordHash) {
    logger.warn(`Password change failed: Social login account - userId=${userId}, email=${maskEmail(user.email)}`);
    return res.status(400).json({
      message: "소셜 로그인으로 가입한 계정은 비밀번호를 변경할 수 없습니다",
    });
  }

  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    // 보안 로깅: 현재 비밀번호 불일치 (계정 탈취 시도 가능)
    logger.warn(`Password change failed: Current password mismatch - userId=${userId}, email=${maskEmail(user.email)}`);
    return res
      .status(401)
      .json({ message: "현재 비밀번호가 일치하지 않습니다" });
  }

  // 동일 비밀번호 제한: 기존 비밀번호와 동일한지 확인
  const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
  if (isSamePassword) {
    logger.warn(`Password change failed: Same as current password - userId=${userId}`);
    return res.status(400).json({
      message: "새 비밀번호는 현재 비밀번호와 달라야 합니다",
    });
  }

  const newPasswordHash = await hashPassword(newPassword);
  await storage.updateUser(userId, { passwordHash: newPasswordHash });

  // 보안 로깅: 비밀번호 변경 성공
  logger.info(`Password changed successfully - userId=${userId}, email=${maskEmail(user.email)}`);

  res.json({ message: "비밀번호가 변경되었습니다" });
}));

// 비밀번호 재설정 (비로그인 사용자)
router.post("/reset-password", authRateLimiter, asyncHandler(async (req, res) => {
  const validatedData = resetPasswordSchema.parse(req.body);
  const { email, newPassword } = validatedData;

  // 이메일 인증 완료 여부 확인
  const isVerified = await storage.isEmailVerified(email, "password_reset");
  if (!isVerified) {
    return res.status(400).json({
      message: "이메일 인증이 완료되지 않았습니다",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  // 사용자 조회
  const user = await storage.getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
  }

  // 소셜 로그인 사용자는 비밀번호 재설정 불가
  if (!user.passwordHash) {
    return res.status(400).json({
      message: "소셜 로그인으로 가입한 계정은 비밀번호를 재설정할 수 없습니다",
    });
  }

  // 동일 비밀번호 제한: 기존 비밀번호와 동일한지 확인
  const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
  if (isSamePassword) {
    return res.status(400).json({
      message: "새 비밀번호는 이전 비밀번호와 달라야 합니다",
    });
  }

  // 새 비밀번호 해시화 및 업데이트
  const newPasswordHash = await hashPassword(newPassword);
  await storage.updateUser(user.id, { passwordHash: newPasswordHash });

  // 보안: 인증 상태 초기화 (재사용 방지)
  await storage.clearEmailVerification(email, "password_reset");

  logger.info(`Password reset successful - userId=${user.id}, email=${maskEmail(email)}`);

  res.json({ message: "비밀번호가 재설정되었습니다" });
}));

// ------------------------------------------------------------------
// 이메일 인증 API
// ------------------------------------------------------------------

/**
 * 이메일 인증코드 발송
 * POST /api/auth/send-verification
 */
router.post("/send-verification", authRateLimiter, asyncHandler(async (req, res) => {
  const validatedData = sendVerificationCodeSchema.parse(req.body);
  const { email, type } = validatedData;

  // 회원가입 인증인 경우: 이미 가입된 이메일인지 확인
  if (type === "signup") {
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "이미 사용 중인 이메일입니다" });
    }
  }

  // 비밀번호 재설정인 경우: 가입된 이메일인지 확인
  if (type === "password_reset") {
    const existingUser = await storage.getUserByEmail(email);
    if (!existingUser) {
      // 보안상 존재 여부를 노출하지 않고 성공 응답
      return res.json({ message: "인증코드가 발송되었습니다" });
    }
    // 소셜 로그인 사용자는 비밀번호 재설정 불가
    if (!existingUser.passwordHash) {
      return res.status(400).json({
        message: "소셜 로그인으로 가입한 계정입니다. 해당 소셜 서비스로 로그인해주세요.",
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
    return res.status(500).json({ message: "이메일 발송에 실패했습니다" });
  }

  res.json({ message: "인증코드가 발송되었습니다" });
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
      message: "인증코드가 유효하지 않거나 만료되었습니다",
    });
  }

  // 인증코드 사용 처리
  await storage.markVerificationAsUsed(verification.id);

  res.json({
    message: "이메일이 인증되었습니다",
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
    return res.status(400).json({ message: "이메일을 입력해주세요" });
  }

  const isVerified = await storage.isEmailVerified(email, type);

  res.json({ email, type, verified: isVerified });
}));

export default router;
