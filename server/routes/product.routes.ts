// server/routes/product.routes.ts
// 상품 관련 공개 라우트 (/api/products/*)

import { Router } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../middleware/error.middleware";
import { createLogger } from "../utils/logger";

const router = Router();
const logger = createLogger("Product");

// 상품 목록 조회
router.get("/", asyncHandler(async (req, res) => {
  const search = req.query.search as string | undefined;
  const categoryIdParam = req.query.categoryId as string | undefined;
  const categorySlugParam = req.query.category as string | undefined;

  let targetCategoryId: number | undefined = undefined;

  // Case 1: 숫자로 된 ID가 직접 들어온 경우 (기존 호환)
  if (categoryIdParam && !isNaN(Number(categoryIdParam))) {
    targetCategoryId = Number(categoryIdParam);
  }
  // Case 2: Slug(문자열)가 들어온 경우 (신규 기능)
  else if (categorySlugParam && categorySlugParam !== "all") {
    // Slug로 카테고리 정보 조회
    const category = await storage.getCategoryBySlug(categorySlugParam);

    if (category) {
      targetCategoryId = category.id; // 찾은 카테고리의 ID(숫자)를 사용
    } else {
      // 잘못된 슬러그면 빈 배열 반환 (또는 404)
      return res.json([]);
    }
  }
  const products = await storage.getProducts({
    search,
    categoryId: targetCategoryId,
  });
  res.json(products);
}));

// 상품 상세 조회 (UUID 기반)
router.get("/:id", asyncHandler(async (req, res) => {
  const product = await storage.getProduct(req.params.id); // UUID 문자열
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }
  res.json(product);
}));

// 상품 옵션(variants) 조회 (UUID 기반)
router.get("/:id/variants", asyncHandler(async (req, res) => {
  const variants = await storage.getProductVariants(req.params.id); // UUID 문자열
  res.json(variants);
}));

export default router;
