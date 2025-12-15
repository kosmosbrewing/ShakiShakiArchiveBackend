// server/routes/auth.routes.ts
// 인증 관련 라우트 (/api/auth/*)

import { Router } from "express";
import { storage } from "../storage";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  isAuthenticated,
  invalidateUserCache,
} from "../middleware/auth.middleware";
import { signupSchema, loginSchema } from "@shared/schema";

const router = Router();

// 회원가입
router.post("/signup", async (req, res) => {
  try {
    const validatedData = signupSchema.parse(req.body);

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

export default router;
