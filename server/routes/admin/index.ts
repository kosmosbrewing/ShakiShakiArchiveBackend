// server/routes/admin/index.ts
// 관리자 라우터 통합

import { Router } from "express";
import productRoutes from "./product.routes";
import orderRoutes from "./order.routes";
import categoryRoutes from "./category.routes";
import variantRoutes from "./variant.routes";
import paymentRoutes from "./payment.routes";
import imageRoutes from "./image.routes";
import siteImageRoutes from "./siteImage.routes";

const router = Router();

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

// 사이트 이미지 관리 (Hero, Marquee)
router.use("/site-images", siteImageRoutes);

export default router;
