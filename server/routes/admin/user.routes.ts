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

const router = Router();
const logger = createLogger("AdminUserRoutes");

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
        message: "잘못된 요청 파라미터입니다.",
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
        message: "잘못된 사용자 ID 형식입니다.",
      });
    }

    // DB에서 회원 상세 정보 조회
    const userDetail = await storage.getAdminUserDetail(userId);

    if (!userDetail) {
      return res.status(404).json({
        message: "사용자를 찾을 수 없습니다.",
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

export default router;
