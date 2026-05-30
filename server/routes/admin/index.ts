// server/routes/admin/index.ts
// 관리자 라우터 통합

import { Router } from "express";
import { adminRateLimiter } from "../../config/security";
import productRoutes from "./product.routes";
import orderRoutes from "./order.routes";
import categoryRoutes from "./category.routes";
import variantRoutes from "./variant.routes";
import paymentRoutes from "./payment.routes";
import imageRoutes from "./image.routes";
import siteImageRoutes from "./siteImage.routes";
import userRoutes from "./user.routes";
import inquiryRoutes from "./inquiry.routes";
import emailPreviewRoutes from "./emailPreview.routes";
import analyticsRoutes from "./analytics.routes";

const router = Router();

// 관리자 전용 Rate Limiter 적용 (5분당 300회)
// 전역 Rate Limiter는 skip되고 이 제한만 적용됨
router.use(adminRateLimiter);

// 상품 관리
router.use("/products", productRoutes);

// 주문 관리 (orders, order-items)
router.use("/", orderRoutes);

// 결제 관리
router.use("/payments", paymentRoutes);

// 카테고리 관리
router.use("/categories", categoryRoutes);

// 옵션/실측 관리 (variants, measurements)
router.use("/", variantRoutes);

// 이미지 업로드 관리
router.use("/images", imageRoutes);

// 사이트 이미지 관리 (Main, Hero, Marquee, Journal)
router.use("/site-images", siteImageRoutes);

// 회원 관리
router.use("/users", userRoutes);

// 문의 관리
router.use("/inquiries", inquiryRoutes);

// 통계 관리
router.use("/analytics", analyticsRoutes);

// 이메일 템플릿 미리보기
router.use("/email-preview", emailPreviewRoutes);

export default router;
