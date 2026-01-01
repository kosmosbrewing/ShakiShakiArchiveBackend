// server/routes/index.ts
// 라우터 통합

import { Router } from "express";
import authRoutes from "./auth.routes";
import oauthRoutes from "./oauth.routes";
import productRoutes from "./product.routes";
import categoryRoutes from "./category.routes";
import cartRoutes from "./cart.routes";
import orderRoutes from "./order.routes";
import paymentRoutes from "./payment.routes";
import naverpayRoutes from "./naverpay.routes";
import wishlistRoutes from "./wishlist.routes";
import addressRoutes from "./address.routes";
import variantRoutes from "./variant.routes";
import searchRoutes from "./search.routes";
import productSearchRoutes from "./productSearch.routes";
import siteImageRoutes from "./siteImage.routes";
import inquiryRoutes from "./inquiry.routes";
import seoRoutes from "./seo.routes";
import adminRoutes from "./admin";

const router = Router();

// 헬스체크 (AWS App Runner, 로드밸런서용)
router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// 공개 라우트
router.use("/auth", authRoutes);
router.use("/oauth", oauthRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/variants", variantRoutes);
router.use("/search", searchRoutes); // 주소 검색 API
router.use("/search/products", productSearchRoutes); // 상품 검색 (Meilisearch)
router.use("/site-images", siteImageRoutes); // Hero, Marquee 이미지 조회
router.use("/inquiries", inquiryRoutes); // Q&A 문의하기
router.use("/seo", seoRoutes); // SEO 메타데이터 (JSON-LD, OpenGraph)

// 인증 필요 라우트
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/payments/naverpay", naverpayRoutes); // 네이버페이 결제
router.use("/wishlist", wishlistRoutes);
router.use("/user/addresses", addressRoutes);

// 관리자 라우트
router.use("/admin", adminRoutes);

export default router;
