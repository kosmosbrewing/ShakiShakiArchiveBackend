// server/routes/auth.routes.ts
// 인증 관련 라우트 (/api/auth/*)

import { Router } from "express";
import { storage } from "../storage";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  isAuthenticated,
  invalidateUserCache,
} from "../middleware/auth.middleware";
import {
  signupSchema,
  loginSchema,
  sendVerificationCodeSchema,
  verifyEmailCodeSchema,
} from "@shared/schema";
import {
  generateVerificationCode,
  getCodeExpiryTime,
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../services/email.service";

const router = Router();

// 회원가입
router.post("/signup", async (req, res) => {
  try {
    const validatedData = signupSchema.parse(req.body);

    // 이메일 인증 완료 여부 확인
    const isVerified = await storage.isEmailVerified(
      validatedData.email,
      "signup"
    );
    if (!isVerified) {
      return res.status(400).json({
        message: "이메일 인증이 완료되지 않았습니다",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    const existingUser = await storage.getUserByEmail(validatedData.email);
    if (existingUser) {
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

    req.session.userId = user.id;

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "회원가입 실패";
    res.status(400).json({ message });
  }
});

// 로그인
router.post("/login", async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);

    const user = await storage.getUserByEmail(validatedData.email);
    if (!user) {
      return res
        .status(401)
        .json({ message: "이메일 또는 비밀번호가 올바르지 않습니다" });
    }

    // 소셜 로그인 사용자는 비밀번호로 로그인 불가
    if (!user.passwordHash) {
      return res.status(401).json({
        message: "소셜 로그인으로 가입한 계정입니다. 해당 소셜 서비스로 로그인해주세요.",
      });
    }

    const isValidPassword = await verifyPassword(
      validatedData.password,
      user.passwordHash
    );
    if (!isValidPassword) {
      return res
        .status(401)
        .json({ message: "이메일 또는 비밀번호가 올바르지 않습니다" });
    }

    req.session.userId = user.id;

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "로그인 실패";
    res.status(400).json({ message });
  }
});

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
router.get("/user", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
    }
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Error fetching user:", error);
    res
      .status(500)
      .json({ message: "사용자 정보를 가져오는 데 실패했습니다" });
  }
});

// 사용자 정보 수정
router.patch("/user", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { userName, zipCode, address, detailAddress, phone, emailOptIn } =
      req.body;

    const updateData: Record<string, unknown> = {};
    if (userName) updateData.userName = userName;
    if (phone !== undefined) updateData.phone = phone;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (address !== undefined) updateData.address = address;
    if (detailAddress !== undefined) updateData.detailAddress = detailAddress;
    if (emailOptIn !== undefined) updateData.emailOptIn = emailOptIn;

    const updatedUser = await storage.updateUser(userId, updateData);

    if (!updatedUser) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
    }

    // 캐시 무효화
    invalidateUserCache(userId);

    res.json({ message: "정보가 수정되었습니다", user: updatedUser });
  } catch (error: unknown) {
    console.error("Update user error:", error);
    const message = error instanceof Error ? error.message : "수정 실패";
    res.status(500).json({ message });
  }
});

// 비밀번호 변경
router.put("/password", isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
    }

    // 소셜 로그인 사용자는 비밀번호 변경 불가
    if (!user.passwordHash) {
      return res.status(400).json({
        message: "소셜 로그인으로 가입한 계정은 비밀번호를 변경할 수 없습니다",
      });
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res
        .status(401)
        .json({ message: "현재 비밀번호가 일치하지 않습니다" });
    }

    const newPasswordHash = await hashPassword(newPassword);
    await storage.updateUser(userId, { passwordHash: newPasswordHash });

    res.json({ message: "비밀번호가 변경되었습니다" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "비밀번호 변경 실패";
    res.status(500).json({ message });
  }
});

// ------------------------------------------------------------------
// 이메일 인증 API
// ------------------------------------------------------------------

/**
 * 이메일 인증코드 발송
 * POST /api/auth/send-verification
 */
router.post("/send-verification", async (req, res) => {
  try {
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
  } catch (error: unknown) {
    console.error("[Auth] 인증코드 발송 오류:", error);
    const message =
      error instanceof Error ? error.message : "인증코드 발송 실패";
    res.status(400).json({ message });
  }
});

/**
 * 이메일 인증코드 확인
 * POST /api/auth/verify-email
 */
router.post("/verify-email", async (req, res) => {
  try {
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
  } catch (error: unknown) {
    console.error("[Auth] 이메일 인증 오류:", error);
    const message = error instanceof Error ? error.message : "이메일 인증 실패";
    res.status(400).json({ message });
  }
});

/**
 * 이메일 인증 상태 확인
 * GET /api/auth/check-verification?email=xxx&type=signup
 */
router.get("/check-verification", async (req, res) => {
  try {
    const email = req.query.email as string;
    const type = (req.query.type as string) || "signup";

    if (!email) {
      return res.status(400).json({ message: "이메일을 입력해주세요" });
    }

    const isVerified = await storage.isEmailVerified(email, type);

    res.json({ email, type, verified: isVerified });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "확인 실패";
    res.status(500).json({ message });
  }
});

export default router;
