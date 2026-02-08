// server/routes/seo.routes.ts
// SEO 메타데이터 API 라우트 (/api/seo/*)

import { Router } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../middleware/error.middleware";
import { cacheStrategies } from "../middleware";
import {
  generateHomeSeo,
  generateProductSeo,
  generateCategorySeo,
  generateSearchSeo,
  generateProductListSeo,
} from "../utils/seo";
import { PRODUCT_MESSAGES, CATEGORY_MESSAGES, VALIDATION_MESSAGES } from "@shared/constants/messages";

const router = Router();

/**
 * GET /api/seo/home
 * 홈페이지 SEO 메타데이터 조회
 *
 * 캐시: 브라우저 5분, CDN 10분
 */
router.get("/home", cacheStrategies.staticData, (_req, res) => {
  // 동기 함수이므로 에러 발생 시 Express가 자동으로 처리
  const seoData = generateHomeSeo();
  res.json(seoData);
});

/**
 * GET /api/seo/products
 * 상품 목록 페이지 SEO 메타데이터 조회
 *
 * 캐시: 브라우저 10초, CDN 1분
 */
router.get("/products", cacheStrategies.productList, asyncHandler(async (_req, res) => {
  const { products } = await storage.getProducts({});
  const seoData = generateProductListSeo(products);
  res.json(seoData);
}));

/**
 * GET /api/seo/products/:idOrSlug
 * 상품 상세 페이지 SEO 메타데이터 조회
 * - UUID 또는 slug로 조회 가능
 *
 * 캐시: 브라우저 5분, CDN 10분
 */
router.get("/products/:idOrSlug", cacheStrategies.staticData, asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;

  // UUID 형식인지 확인 (기본 UUID 패턴)
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrSlug
    );

  let product;
  if (isUuid) {
    product = await storage.getProduct(idOrSlug);
  } else {
    // slug로 조회
    product = await storage.getProductBySlug(idOrSlug);
  }

  if (!product) {
    return res.status(404).json({ message: PRODUCT_MESSAGES.NOT_FOUND });
  }

  // 카테고리명 조회 (브레드크럼브용)
  let categoryName: string | undefined;
  if (product.categoryId) {
    const category = await storage.getCategory(product.categoryId);
    categoryName = category?.name;
  }

  const seoData = generateProductSeo(product, categoryName);
  res.json(seoData);
}));

/**
 * GET /api/seo/categories/:idOrSlug
 * 카테고리 페이지 SEO 메타데이터 조회
 * - ID(숫자) 또는 slug로 조회 가능
 *
 * 캐시: 브라우저 5분, CDN 10분
 */
router.get("/categories/:idOrSlug", cacheStrategies.staticData, asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;

  // 숫자인지 확인
  const isNumeric = /^\d+$/.test(idOrSlug);

  let category;
  if (isNumeric) {
    category = await storage.getCategory(Number(idOrSlug));
  } else {
    category = await storage.getCategoryBySlug(idOrSlug);
  }

  if (!category) {
    return res.status(404).json({ message: CATEGORY_MESSAGES.NOT_FOUND });
  }

  // 해당 카테고리의 상품 목록 조회
  const { products } = await storage.getProducts({ categoryId: category.id });

  const seoData = generateCategorySeo(category, products);
  res.json(seoData);
}));

/**
 * GET /api/seo/search
 * 검색 결과 페이지 SEO 메타데이터 조회
 * @query q - 검색어 (필수)
 *
 * 캐시: 브라우저 10초, CDN 1분
 */
router.get("/search", cacheStrategies.productList, asyncHandler(async (req, res) => {
  const query = req.query.q as string;

  if (!query || query.trim() === "") {
    return res.status(400).json({ message: VALIDATION_MESSAGES.SEARCH_QUERY_REQUIRED });
  }

  // 검색 결과 수 조회
  const { total } = await storage.getProducts({ search: query });
  const seoData = generateSearchSeo(query, total);

  res.json(seoData);
}));

/**
 * GET /api/seo/sitemap-data
 * 사이트맵 생성용 데이터 조회
 * - 프론트엔드에서 sitemap.xml 생성 시 사용
 *
 * 캐시: 브라우저 5분, CDN 10분
 */
router.get("/sitemap-data", cacheStrategies.staticData, asyncHandler(async (_req, res) => {
  const [productsResult, categories] = await Promise.all([
    storage.getProducts({}),
    storage.getCategories(),
  ]);

  const sitemapData = {
    products: productsResult.products.map((p) => ({
      slug: p.slug,
      updatedAt: p.updatedAt,
      imageUrl: p.imageUrl,
    })),
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
    })),
    generatedAt: new Date().toISOString(),
  };

  res.json(sitemapData);
}));

export default router;
