// server/routes/inquiry.routes.ts
// Q&A 문의하기 관련 라우트 (/api/inquiries/*)

import { Router } from "express";
import { storage } from "../storage";
import { hasVerifiedAdminSession, isAuthenticated, isAdmin, populateUser } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import {
  createInquirySchema,
  createInquiryReplySchema,
  type InquiryType,
} from "@shared/schema";
import { sanitizeUserObject, maskUserForPublicView, maskUserForInquiryView } from "../utils/masking";
import { isValidUUID, optionalUuidSchema } from "../utils/validation";
import { z } from "zod";
import { INQUIRY_MESSAGES, PRODUCT_MESSAGES } from "@shared/constants/messages";
import { notifyInquiryCreated } from "../services/telegram.service";
import { createLogger } from "../utils/logger";

const logger = createLogger("Inquiry");

const router = Router();

// 문의 목록 조회 Query Parameters 검증 스키마
const getInquiriesQuerySchema = z.object({
  productId: optionalUuidSchema,
  type: z.enum(["product", "shipping", "exchange", "other"]).optional(),
  status: z.enum(["pending", "answered", "closed"]).optional(),
});

// ------------------------------------------------------------------
// 공개 API (비밀글 제외)
// ------------------------------------------------------------------

// 문의 목록 조회 (공개 문의만, 비밀글은 본인만 조회 가능)
router.get("/", asyncHandler(async (req, res) => {
  const userId = req.session?.userId;

  // Query Parameters 검증
  const validationResult = getInquiriesQuerySchema.safeParse(req.query);
  if (!validationResult.success) {
    return res.status(400).json({
      message: INQUIRY_MESSAGES.INVALID_PARAMS,
      errors: validationResult.error.errors,
    });
  }

  const { productId, type, status } = validationResult.data;

  const filters: {
    productId?: string;
    type?: InquiryType;
    status?: string;
  } = {};

  if (productId) filters.productId = productId;
  if (type) filters.type = type;
  if (status) filters.status = status;

  const allInquiries = await storage.getInquiries(filters);

  // 비밀글 필터링 및 개인정보 마스킹: 비밀글은 작성자 본인만 볼 수 있음
  const visibleInquiries = allInquiries.map((inquiry) => {
    // 사용자 정보 마스킹 (관리자는 이름만 공개, 일반 사용자는 모두 마스킹)
    const maskedUser = maskUserForPublicView(inquiry.user);

    if (inquiry.isPrivate && inquiry.userId !== userId) {
      // 비밀글인 경우 제목과 내용을 숨김
      return {
        ...inquiry,
        title: "비밀글입니다",
        content: "비밀글입니다",
        user: maskedUser,
      };
    }

    // 공개글이거나 본인 글인 경우
    return {
      ...inquiry,
      user: maskedUser,
    };
  });

  res.json(visibleInquiries);
}));

// 문의 상세 조회
router.get("/:id", populateUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.session?.userId;

  // UUID 형식 검증
  if (!isValidUUID(id)) {
    return res.status(400).json({ message: INQUIRY_MESSAGES.INVALID_ID });
  }

  const inquiry = await storage.getInquiry(id);

  if (!inquiry) {
    return res.status(404).json({ message: INQUIRY_MESSAGES.NOT_FOUND });
  }

  // 비밀글 접근 권한 체크
  if (inquiry.isPrivate && inquiry.userId !== userId) {
    // 관리자인지 확인 (캐시된 정보 사용)
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: INQUIRY_MESSAGES.PRIVATE_ACCESS_DENIED });
    }
  }

  // 본인 여부 확인
  const isOwner = inquiry.userId === userId;

  // 문의 작성자 정보 마스킹 (본인/관리자/일반 사용자 구분)
  const maskedInquiryUser = maskUserForInquiryView(inquiry.user, isOwner);

  // 답변 작성자 정보 (관리자는 이름만 공개)
  const sanitizedReplies = inquiry.replies.map((reply) => ({
    ...reply,
    user: maskUserForPublicView(reply.user),
  }));

  const sanitizedInquiry = {
    ...inquiry,
    user: maskedInquiryUser,
    replies: sanitizedReplies,
  };

  res.json(sanitizedInquiry);
}));

// ------------------------------------------------------------------
// 인증 필요 API
// ------------------------------------------------------------------

// 내 문의 목록 조회
router.get("/my/list", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;

  const myInquiries = await storage.getInquiries({ userId });

  // 본인의 문의이므로 개인정보는 원본 반환 (passwordHash만 제거)
  const sanitizedInquiries = myInquiries.map((inquiry) => ({
    ...inquiry,
    user: sanitizeUserObject(inquiry.user),
  }));

  res.json(sanitizedInquiries);
}));

// 문의 등록
router.post("/", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;

  // 입력값 검증
  const parseResult = createInquirySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      message: INQUIRY_MESSAGES.INVALID_INPUT,
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const { productId, type, title, content, isPrivate } = parseResult.data;

  // 상품 문의인 경우 상품 존재 확인 (Telegram 알림에서도 재사용)
  let product = null;
  if (productId) {
    product = await storage.getProduct(productId);
    if (!product) {
      return res.status(404).json({ message: PRODUCT_MESSAGES.NOT_FOUND });
    }
  }

  const inquiry = await storage.createInquiry({
    userId,
    productId: productId || null,
    type,
    title,
    content,
    isPrivate: isPrivate || false,
  });

  // Telegram 관리자 알림
  const inquiryUser = await storage.getUser(userId);

  notifyInquiryCreated({
    inquiryId: inquiry.id,
    userName: inquiryUser?.userName || '고객',
    type,
    title,
    productName: product?.name,
  }).catch(err => logger.error("문의 알림 발송 실패", { inquiryId: inquiry.id, error: err instanceof Error ? err.message : String(err) }));

  res.status(201).json(inquiry);
}));

// 문의 삭제 (본인만 가능)
router.delete("/:id", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const { id } = req.params;

  // UUID 형식 검증
  if (!isValidUUID(id)) {
    return res.status(400).json({ message: INQUIRY_MESSAGES.INVALID_ID });
  }

  const inquiry = await storage.getInquiry(id);

  if (!inquiry) {
    return res.status(404).json({ message: INQUIRY_MESSAGES.NOT_FOUND });
  }

  // 본인 확인 (관리자도 삭제 가능)
  const user = await storage.getUser(userId);
  if (inquiry.userId !== userId && !hasVerifiedAdminSession(req, user)) {
    return res.status(403).json({ message: INQUIRY_MESSAGES.DELETE_FORBIDDEN });
  }

  await storage.deleteInquiry(id);

  res.json({ message: INQUIRY_MESSAGES.DELETED });
}));

// ------------------------------------------------------------------
// 관리자 전용 API
// ------------------------------------------------------------------

// 답변 등록 (관리자만)
router.post("/:id/replies", isAdmin, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const { id: inquiryId } = req.params;

  // UUID 형식 검증
  if (!isValidUUID(inquiryId)) {
    return res.status(400).json({ message: INQUIRY_MESSAGES.INVALID_ID });
  }

  // 문의 존재 확인
  const inquiry = await storage.getInquiry(inquiryId);
  if (!inquiry) {
    return res.status(404).json({ message: INQUIRY_MESSAGES.NOT_FOUND });
  }

  // 입력값 검증
  const parseResult = createInquiryReplySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      message: INQUIRY_MESSAGES.INVALID_INPUT,
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const { content } = parseResult.data;

  const reply = await storage.createInquiryReply({
    inquiryId,
    userId,
    content,
  });

  res.status(201).json(reply);
}));

// 문의 상태 변경 (관리자만)
router.patch("/:id/status", isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // UUID 형식 검증
  if (!isValidUUID(id)) {
    return res.status(400).json({ message: INQUIRY_MESSAGES.INVALID_ID });
  }

  if (!status || !["pending", "answered", "closed"].includes(status)) {
    return res.status(400).json({ message: INQUIRY_MESSAGES.INVALID_STATUS });
  }

  const updated = await storage.updateInquiryStatus(id, status);

  if (!updated) {
    return res.status(404).json({ message: INQUIRY_MESSAGES.NOT_FOUND });
  }

  res.json(updated);
}));

// 답변 삭제 (관리자만) - RESTful 엔드포인트
router.delete("/:inquiryId/replies/:replyId", isAdmin, asyncHandler(async (req, res) => {
  const { inquiryId, replyId } = req.params;
  const replyIdNum = parseInt(replyId);

  // UUID 형식 검증
  if (!isValidUUID(inquiryId)) {
    return res.status(400).json({ message: INQUIRY_MESSAGES.INVALID_ID });
  }

  // 답변 ID 유효성 검사
  if (isNaN(replyIdNum)) {
    return res.status(400).json({ message: INQUIRY_MESSAGES.INVALID_REPLY_ID });
  }

  // 1. 문의 존재 확인
  const inquiry = await storage.getInquiry(inquiryId);
  if (!inquiry) {
    return res.status(404).json({ message: INQUIRY_MESSAGES.NOT_FOUND });
  }

  // 2. 답변 존재 확인
  const reply = await storage.getInquiryReply(replyIdNum);
  if (!reply) {
    return res.status(404).json({ message: INQUIRY_MESSAGES.REPLY_NOT_FOUND });
  }

  // 3. 해당 답변이 해당 문의에 속하는지 확인
  if (reply.inquiryId !== inquiryId) {
    return res.status(400).json({ message: INQUIRY_MESSAGES.REPLY_MISMATCH });
  }

  // 4. 답변 삭제
  await storage.deleteInquiryReply(replyIdNum);

  res.json({ message: INQUIRY_MESSAGES.REPLY_DELETED });
}));

// 답변 삭제 (관리자만) - 기존 엔드포인트 호환성 유지 (Deprecated)
router.delete("/replies/:replyId", isAdmin, asyncHandler(async (req, res) => {
  const replyId = parseInt(req.params.replyId);

  if (isNaN(replyId)) {
    return res.status(400).json({ message: INQUIRY_MESSAGES.INVALID_REPLY_ID });
  }

  await storage.deleteInquiryReply(replyId);

  res.json({ message: INQUIRY_MESSAGES.REPLY_DELETED });
}));

export default router;
