// server/routes/inquiry.routes.ts
// Q&A 문의하기 관련 라우트 (/api/inquiries/*)

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import {
  createInquirySchema,
  createInquiryReplySchema,
  type InquiryType,
} from "@shared/schema";

const router = Router();

// ------------------------------------------------------------------
// 공개 API (비밀글 제외)
// ------------------------------------------------------------------

// 문의 목록 조회 (공개 문의만, 비밀글은 본인만 조회 가능)
router.get("/", asyncHandler(async (req, res) => {
  const { productId, type, status } = req.query;
  const userId = req.session?.userId;

  const filters: {
    productId?: string;
    type?: InquiryType;
    status?: string;
  } = {};

  if (productId && typeof productId === "string") {
    filters.productId = productId;
  }
  if (type && typeof type === "string") {
    filters.type = type as InquiryType;
  }
  if (status && typeof status === "string") {
    filters.status = status;
  }

  const allInquiries = await storage.getInquiries(filters);

  // 비밀글 필터링: 비밀글은 작성자 본인만 볼 수 있음
  const visibleInquiries = allInquiries.map((inquiry) => {
    if (inquiry.isPrivate && inquiry.userId !== userId) {
      // 비밀글인 경우 제목과 내용을 숨김
      return {
        ...inquiry,
        title: "비밀글입니다",
        content: "비밀글입니다",
        user: {
          ...inquiry.user,
          email: inquiry.user.email.slice(0, 3) + "***",
          userName: inquiry.user.userName.slice(0, 1) + "**",
        },
      };
    }
    // 공개글이거나 본인 글인 경우 원본 반환
    return {
      ...inquiry,
      user: {
        ...inquiry.user,
        // 이메일은 일부만 공개
        email: inquiry.user.email.slice(0, 3) + "***",
        // 패스워드 해시 제거
        passwordHash: undefined,
      },
    };
  });

  res.json(visibleInquiries);
}));

// 문의 상세 조회
router.get("/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.session?.userId;

  const inquiry = await storage.getInquiry(id);

  if (!inquiry) {
    return res.status(404).json({ message: "문의를 찾을 수 없습니다" });
  }

  // 비밀글 접근 권한 체크
  if (inquiry.isPrivate && inquiry.userId !== userId) {
    // 관리자인지 확인
    if (userId) {
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "비밀글은 작성자만 조회할 수 있습니다" });
      }
    } else {
      return res.status(403).json({ message: "비밀글은 작성자만 조회할 수 있습니다" });
    }
  }

  // 민감한 정보 제거
  const sanitizedInquiry = {
    ...inquiry,
    user: {
      ...inquiry.user,
      passwordHash: undefined,
      email: inquiry.userId === userId ? inquiry.user.email : inquiry.user.email.slice(0, 3) + "***",
    },
    replies: inquiry.replies.map((reply) => ({
      ...reply,
      user: {
        ...reply.user,
        passwordHash: undefined,
      },
    })),
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

  res.json(myInquiries);
}));

// 문의 등록
router.post("/", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;

  // 입력값 검증
  const parseResult = createInquirySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      message: "입력값이 올바르지 않습니다",
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const { productId, type, title, content, isPrivate } = parseResult.data;

  // 상품 문의인 경우 상품 존재 확인
  if (productId) {
    const product = await storage.getProduct(productId);
    if (!product) {
      return res.status(404).json({ message: "상품을 찾을 수 없습니다" });
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

  res.status(201).json(inquiry);
}));

// 문의 삭제 (본인만 가능)
router.delete("/:id", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const { id } = req.params;

  const inquiry = await storage.getInquiry(id);

  if (!inquiry) {
    return res.status(404).json({ message: "문의를 찾을 수 없습니다" });
  }

  // 본인 확인 (관리자도 삭제 가능)
  const user = await storage.getUser(userId);
  if (inquiry.userId !== userId && !user?.isAdmin) {
    return res.status(403).json({ message: "본인의 문의만 삭제할 수 있습니다" });
  }

  await storage.deleteInquiry(id);

  res.json({ message: "문의가 삭제되었습니다" });
}));

// ------------------------------------------------------------------
// 관리자 전용 API
// ------------------------------------------------------------------

// 답변 등록 (관리자만)
router.post("/:id/replies", isAdmin, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const { id: inquiryId } = req.params;

  // 문의 존재 확인
  const inquiry = await storage.getInquiry(inquiryId);
  if (!inquiry) {
    return res.status(404).json({ message: "문의를 찾을 수 없습니다" });
  }

  // 입력값 검증
  const parseResult = createInquiryReplySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      message: "입력값이 올바르지 않습니다",
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

  if (!status || !["pending", "answered", "closed"].includes(status)) {
    return res.status(400).json({ message: "유효한 상태값을 입력해주세요" });
  }

  const updated = await storage.updateInquiryStatus(id, status);

  if (!updated) {
    return res.status(404).json({ message: "문의를 찾을 수 없습니다" });
  }

  res.json(updated);
}));

// 답변 삭제 (관리자만)
router.delete("/replies/:replyId", isAdmin, asyncHandler(async (req, res) => {
  const replyId = parseInt(req.params.replyId);

  if (isNaN(replyId)) {
    return res.status(400).json({ message: "유효한 답변 ID가 필요합니다" });
  }

  await storage.deleteInquiryReply(replyId);

  res.json({ message: "답변이 삭제되었습니다" });
}));

export default router;
