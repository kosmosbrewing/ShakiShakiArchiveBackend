// server/routes/product.routes.ts
// 상품 관련 공개 라우트 (/api/products/*)

import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { asyncHandler } from "../middleware/error.middleware";
import { cacheStrategies, etagMiddleware } from "../middleware";
import { createLogger } from "../utils/logger";
import { PRODUCT_MESSAGES } from "@shared/constants/messages";

const router = Router();
const logger = createLogger("Product");

// UUID 유효성 검증 스키마
const uuidSchema = z.string().uuid("유효하지 않은 상품 ID 형식입니다");

// 상품 목록 조회 (페이지네이션 지원)
router.get("/", etagMiddleware(), cacheStrategies.productList, asyncHandler(async (req, res) => {
  const search = req.query.search as string | undefined;
  const categoryIdParam = req.query.categoryId as string | undefined;
  const categorySlugParam = req.query.category as string | undefined;

  // 페이지네이션 파라미터 (기본: page=1, limit=40, 최대 limit=100)
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 40));

  let targetCategoryId: number | undefined = undefined;

  // Case 1: 숫자로 된 ID가 직접 들어온 경우 (기존 호환)
  if (categoryIdParam && !isNaN(Number(categoryIdParam))) {
    targetCategoryId = Number(categoryIdParam);
  }
  // Case 2: Slug(문자열)가 들어온 경우 (신규 기능)
  else if (categorySlugParam && categorySlugParam !== "all") {
    const category = await storage.getCategoryBySlug(categorySlugParam);

    if (category) {
      targetCategoryId = category.id;
    } else {
      // 잘못된 슬러그면 빈 페이지네이션 응답 반환
      return res.json({
        products: [],
        pagination: { page: 1, limit, total: 0, totalPages: 0, hasMore: false },
      });
    }
  }

  const { products, total } = await storage.getProducts({
    search,
    categoryId: targetCategoryId,
    page,
    limit,
  });

  const totalPages = Math.ceil(total / limit);

  res.json({
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}));

// 상품 조회수 증가 (UUID 기반)
router.post("/:id/view", asyncHandler(async (req, res) => {
  // UUID 유효성 검증
  const parseResult = uuidSchema.safeParse(req.params.id);
  if (!parseResult.success) {
    return res.status(400).json({
      message: "유효하지 않은 상품 ID 형식입니다.",
      error: parseResult.error.errors[0].message,
    });
  }

  // 빠른 응답을 위해 비동기 처리 (fire-and-forget)
  void storage.incrementProductViewCount(req.params.id).catch((error) => {
    logger.warn("상품 조회수 증가 실패", {
      productId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return res.status(204).send();
}));

// 상품 상세 조회 (UUID 기반)
router.get("/:id", cacheStrategies.productDetail, asyncHandler(async (req, res) => {
  const product = await storage.getProduct(req.params.id); // UUID 문자열
  if (!product) {
    return res.status(404).json({ message: PRODUCT_MESSAGES.NOT_FOUND });
  }
  res.json(product);
}));

// 상품 옵션(variants) 조회 (UUID 기반)
router.get("/:id/variants", cacheStrategies.productDetail, asyncHandler(async (req, res) => {
  const variants = await storage.getProductVariants(req.params.id); // UUID 문자열
  res.json(variants);
}));

export default router;
