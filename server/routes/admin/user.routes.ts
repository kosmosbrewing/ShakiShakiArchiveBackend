// server/routes/admin/user.routes.ts
// 관리자 회원 관리 라우트 (/api/admin/users/*)

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { z } from "zod";
import { createLogger } from "../../utils/logger";

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

    // 비밀번호 해시 제거 (이미 storage에서 제거되어 있지만 안전을 위해 확인)
    const sanitizedUsers = result.users.map((user) => {
      const { passwordHash, ...safeUser } = user;
      return safeUser;
    });

    res.json({
      users: sanitizedUsers,
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
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // UUID 형식 검증
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
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

    // 비밀번호 해시 제거 및 응답 구조 분리
    const { passwordHash, stats, ...userData } = userDetail;

    // 가이드 문서 형식에 맞게 응답 (user와 stats 분리)
    res.json({
      user: userData,
      stats: {
        totalOrders: stats.totalOrders,
        totalSpent: stats.totalSpent,
        lastOrderDate: stats.lastOrderDate, // 항상 ISO 문자열 또는 null
        totalInquiries: stats.totalInquiries,
      },
    });
  })
);

export default router;
