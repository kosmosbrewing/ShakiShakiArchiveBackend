// server/routes/admin/user.routes.ts
// 관리자 회원 관리 라우트 (/api/admin/users/*)

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import { z } from "zod";
import { createLogger } from "../../utils/logger";
import { maskUserObject } from "../../utils/masking";
import { isValidUUID } from "../../utils/validation";
import { AUTH_MESSAGES, COMMON_MESSAGES, VALIDATION_MESSAGES, SUPER_ADMIN } from "@shared/constants";

const router = Router();
const logger = createLogger("AdminUserRoutes");

// 관리자 권한 변경 요청 스키마
const updateRoleSchema = z.object({
  isAdmin: z.boolean(),
});

// 회원 목록 조회 Query Parameters 검증 스키마
const getUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "userName", "email", "updatedAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

/**
 * 관리자용 회원 목록 조회
 * GET /api/admin/users
 */
router.get(
  "/",
  isAuthenticated,
  isAdmin,
  cacheStrategies.admin,
  asyncHandler(async (req, res) => {
    // Query Parameters 검증
    const validationResult = getUsersQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: VALIDATION_MESSAGES.INVALID_REQUEST_PARAMS,
        errors: validationResult.error.errors,
      });
    }

    const { page, limit, search, sortBy, sortOrder } = validationResult.data;

    // DB에서 회원 목록 조회
    const result = await storage.getAdminUsers({
      page,
      limit,
      search,
      sortBy,
      sortOrder,
    });

    // 개인정보 마스킹 (유틸리티 함수 사용)
    const maskedUsers = result.users.map(maskUserObject);

    res.json({
      users: maskedUsers,
      pagination: result.pagination,
    });
  })
);

/**
 * 관리자용 회원 상세 조회
 * GET /api/admin/users/:userId
 */
router.get(
  "/:userId",
  isAuthenticated,
  isAdmin,
  cacheStrategies.admin,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // UUID 형식 검증
    if (!isValidUUID(userId)) {
      return res.status(400).json({
        message: COMMON_MESSAGES.INVALID_ID,
      });
    }

    // DB에서 회원 상세 정보 조회
    const userDetail = await storage.getAdminUserDetail(userId);

    if (!userDetail) {
      return res.status(404).json({
        message: AUTH_MESSAGES.USER_NOT_FOUND,
      });
    }

    // 응답 구조 분리 (user와 stats)
    const { stats, ...userData } = userDetail;

    // 개인정보 마스킹 (유틸리티 함수 사용)
    const maskedUserData = maskUserObject(userData);

    res.json({
      user: maskedUserData,
      stats: {
        totalOrders: stats.totalOrders,
        totalSpent: stats.totalSpent,
        lastOrderDate: stats.lastOrderDate,
        totalInquiries: stats.totalInquiries,
      },
    });
  })
);

/**
 * 관리자 권한 부여/해제
 * PATCH /api/admin/users/:userId/role
 *
 * 슈퍼 관리자(admin@shakishakiarchive.com)만 사용 가능
 */
router.patch(
  "/:userId/role",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.session.userId!;

    // 1. UUID 형식 검증
    if (!isValidUUID(userId)) {
      return res.status(400).json({
        message: COMMON_MESSAGES.INVALID_ID,
      });
    }

    // 2. 요청 데이터 검증
    const validationResult = updateRoleSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: VALIDATION_MESSAGES.INVALID_REQUEST_PARAMS,
        errors: validationResult.error.errors,
      });
    }

    const { isAdmin: newAdminStatus } = validationResult.data;

    // 3. 현재 로그인한 사용자 조회
    const currentUser = await storage.getUser(currentUserId);
    if (!currentUser) {
      return res.status(401).json({
        message: AUTH_MESSAGES.REQUIRED,
      });
    }

    // 4. 슈퍼 관리자 권한 확인
    if (currentUser.email !== SUPER_ADMIN.EMAIL) {
      logger.warn("슈퍼 관리자 권한 없이 역할 변경 시도", {
        attemptedBy: currentUser.email,
        targetUserId: userId,
      });
      return res.status(403).json({
        message: "슈퍼 관리자만 관리자 권한을 부여/해제할 수 있습니다.",
        code: "SUPER_ADMIN_REQUIRED",
      });
    }

    // 5. 대상 사용자 조회
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({
        message: AUTH_MESSAGES.USER_NOT_FOUND,
      });
    }

    // 6. 자기 자신의 권한 변경 방지
    if (targetUser.id === currentUserId) {
      return res.status(400).json({
        message: "자신의 관리자 권한은 변경할 수 없습니다.",
        code: "CANNOT_CHANGE_OWN_ROLE",
      });
    }

    // 7. 슈퍼 관리자 계정의 권한 해제 방지
    if (targetUser.email === SUPER_ADMIN.EMAIL && !newAdminStatus) {
      return res.status(400).json({
        message: "슈퍼 관리자 계정의 권한은 해제할 수 없습니다.",
        code: "CANNOT_REVOKE_SUPER_ADMIN",
      });
    }

    // 8. 이미 동일한 상태인 경우
    if (targetUser.isAdmin === newAdminStatus) {
      return res.status(400).json({
        message: newAdminStatus
          ? "이미 관리자 권한이 부여된 사용자입니다."
          : "이미 일반 사용자입니다.",
        code: "ALREADY_IN_STATE",
      });
    }

    // 9. 관리자 권한 업데이트
    const updatedUser = await storage.updateUser(userId, {
      isAdmin: newAdminStatus,
    });

    if (!updatedUser) {
      return res.status(500).json({
        message: "권한 변경에 실패했습니다.",
        code: "UPDATE_FAILED",
      });
    }

    logger.info("관리자 권한 변경 완료", {
      changedBy: currentUser.email,
      targetUser: targetUser.email,
      newAdminStatus,
    });

    res.json({
      message: newAdminStatus
        ? "관리자 권한이 부여되었습니다."
        : "관리자 권한이 해제되었습니다.",
      user: maskUserObject(updatedUser),
    });
  })
);

export default router;
