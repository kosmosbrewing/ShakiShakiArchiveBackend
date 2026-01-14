// server/routes/admin/inquiry.routes.ts
// 관리자 문의 관리 라우트 (/api/admin/inquiries/*)

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import { type InquiryType } from "@shared/schema";
import { maskUserForPublicView } from "../../utils/masking";
import { isValidUUID, optionalUuidSchema } from "../../utils/validation";
import { z } from "zod";

const router = Router();

// 문의 목록 조회 Query Parameters 검증 스키마
const getInquiriesQuerySchema = z.object({
  productId: optionalUuidSchema,
  type: z.enum(["product", "shipping", "exchange", "other"]).optional(),
  status: z.enum(["pending", "answered", "closed"]).optional(),
  userId: optionalUuidSchema,
});

/**
 * 관리자용 문의 목록 조회 (마스킹 적용)
 * GET /api/admin/inquiries
 *
 * - 모든 문의 조회 가능 (비밀글 포함)
 * - 개인정보는 마스킹하여 반환
 * - 관리자가 화면에서 정보를 확인하고 대상을 선택하기 위함
 */
router.get(
  "/",
  isAuthenticated,
  isAdmin,
  cacheStrategies.admin,
  asyncHandler(async (req, res) => {
    // Query Parameters 검증
    const validationResult = getInquiriesQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: "잘못된 요청 파라미터입니다.",
        errors: validationResult.error.errors,
      });
    }

    const { productId, type, status, userId } = validationResult.data;

    const filters: {
      productId?: string;
      type?: InquiryType;
      status?: string;
      userId?: string;
    } = {};

    if (productId) filters.productId = productId;
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (userId) filters.userId = userId;

    const allInquiries = await storage.getInquiries(filters);

    // 관리자용 조회 API: 일반 사용자는 모두 마스킹, 관리자는 이름만 공개
    const maskedInquiries = allInquiries.map((inquiry) => ({
      ...inquiry,
      user: maskUserForPublicView(inquiry.user),
    }));

    res.json(maskedInquiries);
  })
);

/**
 * 관리자용 문의 상세 조회 (마스킹 적용)
 * GET /api/admin/inquiries/:id
 *
 * - 비밀글 포함 모든 문의 조회 가능
 * - 개인정보는 마스킹하여 반환
 */
router.get(
  "/:id",
  isAuthenticated,
  isAdmin,
  cacheStrategies.admin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // UUID 형식 검증
    if (!isValidUUID(id)) {
      return res.status(400).json({ message: "잘못된 문의 ID 형식입니다" });
    }

    const inquiry = await storage.getInquiry(id);

    if (!inquiry) {
      return res.status(404).json({ message: "문의를 찾을 수 없습니다" });
    }

    // 관리자용 조회 API: 일반 사용자는 모두 마스킹, 관리자는 이름만 공개
    const maskedInquiry = {
      ...inquiry,
      user: maskUserForPublicView(inquiry.user),
      replies: inquiry.replies.map((reply) => ({
        ...reply,
        user: maskUserForPublicView(reply.user), // 답변 작성자(관리자)는 이름만 공개
      })),
    };

    res.json(maskedInquiry);
  })
);

export default router;
