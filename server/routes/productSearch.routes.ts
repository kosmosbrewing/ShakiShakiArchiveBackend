// server/routes/productSearch.routes.ts
// Meilisearch 기반 상품 검색 API (/api/search/products/*)

import { Router } from "express";
import { meilisearchService, type SearchOptions } from "../services/meilisearch.service";
import { storage } from "../storage";
import { isAdmin, cacheStrategies, etagMiddleware } from "../middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { createLogger } from "../utils/logger";

const router = Router();
const logger = createLogger("Search");

/**
 * GET /api/search/products
 * 상품 검색 (Meilisearch 사용)
 *
 * @query q - 검색어 (필수)
 * @query limit - 결과 수 (기본값: 20, 최대: 100)
 * @query offset - 오프셋 (기본값: 0)
 * @query category - 카테고리 slug
 * @query categoryId - 카테고리 ID
 * @query minPrice - 최소 가격
 * @query maxPrice - 최대 가격
 * @query inStock - 재고 있는 상품만 (true/false)
 * @query sort - 정렬 (price_asc, price_desc, newest, oldest)
 */
router.get("/", etagMiddleware(), cacheStrategies.productList, asyncHandler(async (req, res) => {
  const query = (req.query.q as string) || "";
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const categorySlug = req.query.category as string | undefined;
  const categoryId = req.query.categoryId
    ? parseInt(req.query.categoryId as string)
    : undefined;
  const minPrice = req.query.minPrice
    ? parseFloat(req.query.minPrice as string)
    : undefined;
  const maxPrice = req.query.maxPrice
    ? parseFloat(req.query.maxPrice as string)
    : undefined;
  const inStock = req.query.inStock === "true";
  const sort = req.query.sort as SearchOptions["sort"];

  // Meilisearch가 비활성화된 경우 DB 폴백
  if (!meilisearchService.isEnabled()) {
    logger.info("Meilisearch 비활성화 - DB 검색으로 폴백");
    const products = await storage.getProducts({
      search: query || undefined,
      categoryId,
    });

    return res.json({
      hits: products,
      query,
      processingTimeMs: 0,
      estimatedTotalHits: products.length,
      limit,
      offset,
      fallback: true,
    });
  }

  const searchOptions: SearchOptions = {
    query,
    limit,
    offset,
    categoryId,
    categorySlug,
    minPrice,
    maxPrice,
    inStock: inStock || undefined,
    sort,
  };

  const result = await meilisearchService.searchProducts(searchOptions);

  res.json(result);
}));

/**
 * GET /api/search/products/autocomplete
 * 검색어 자동완성
 *
 * @query q - 검색어 (필수)
 * @query limit - 결과 수 (기본값: 5, 최대: 10)
 */
router.get("/autocomplete", etagMiddleware(), cacheStrategies.productList, asyncHandler(async (req, res) => {
  const query = (req.query.q as string) || "";
  const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);

  if (!query.trim()) {
    return res.json({ suggestions: [] });
  }

  // Meilisearch 비활성화 시 빈 배열 반환
  if (!meilisearchService.isEnabled()) {
    return res.json({ suggestions: [], fallback: true });
  }

  const suggestions = await meilisearchService.autocomplete(query, limit);

  res.json({ suggestions });
}));

/**
 * GET /api/search/products/stats
 * 검색 인덱스 상태 조회 (관리자 전용)
 */
router.get("/stats", isAdmin, cacheStrategies.admin, asyncHandler(async (_req, res) => {
  if (!meilisearchService.isEnabled()) {
    return res.json({
      enabled: false,
      message: "Meilisearch가 비활성화되어 있습니다",
    });
  }

  const stats = await meilisearchService.getIndexStats();

  res.json({
    enabled: true,
    ...stats,
  });
}));

/**
 * POST /api/search/products/reindex
 * 전체 상품 재인덱싱 (관리자 전용)
 */
router.post("/reindex", isAdmin, asyncHandler(async (_req, res) => {
  if (!meilisearchService.isEnabled()) {
    return res.status(400).json({
      message: "Meilisearch가 비활성화되어 있습니다",
    });
  }

  // 모든 상품과 카테고리 조회
  const [products, categories] = await Promise.all([
    storage.getProducts({}),
    storage.getCategories(),
  ]);

  // 카테고리 맵 생성
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // 재인덱싱 실행
  await meilisearchService.rebuildIndex(products, categoryMap);

  res.json({
    message: "재인덱싱이 시작되었습니다",
    totalProducts: products.length,
  });
}));

export default router;
