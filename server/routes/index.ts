// server/routes/index.ts
// 라우터 통합

import { Router } from "express";
import authRoutes from "./auth.routes";
import productRoutes from "./product.routes";
import categoryRoutes from "./category.routes";
import cartRoutes from "./cart.routes";
import orderRoutes from "./order.routes";
import wishlistRoutes from "./wishlist.routes";
import addressRoutes from "./address.routes";
import variantRoutes from "./variant.routes";
import adminRoutes from "./admin";

const router = Router();

// 공개 라우트
router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/variants", variantRoutes);

// 인증 필요 라우트
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/user/addresses", addressRoutes);

// 관리자 라우트
router.use("/admin", adminRoutes);

export default router;
