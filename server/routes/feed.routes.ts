// server/routes/feed.routes.ts
// 상품 피드 라우트 (/api/feeds/*)
// - google-merchant.xml : 구글 머천트 센터 무료 리스팅용
// - rss.xml             : 네이버 서치어드바이저 RSS 제출용
// - naver-ep.txt        : 네이버 쇼핑파트너존 EP (입점 후 등록)

import { Router } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../middleware/error.middleware";
import { cacheStrategies } from "../middleware";
import { generateGoogleMerchantFeed } from "../utils/feeds/googleMerchant";
import { generateRssFeed } from "../utils/feeds/rss";
import { generateNaverEpFeed } from "../utils/feeds/naverEp";
import type { FeedProduct } from "../utils/feeds/common";

const router = Router();

/**
 * 전체 상품 수집 (페이지네이션 순회)
 * 피드는 전체 상품이 필요하므로 큰 limit으로 순회
 */
async function fetchAllProducts(): Promise<FeedProduct[]> {
  const all: FeedProduct[] = [];
  const limit = 200;
  let page = 1;

  while (true) {
    const { products, total } = await storage.getProducts({ page, limit });
    all.push(...products);
    if (all.length >= total || products.length === 0) break;
    page++;
  }

  return all;
}

// 구글 머천트 센터 피드 (품절 포함, out_of_stock 표기)
router.get(
  "/google-merchant.xml",
  cacheStrategies.staticData,
  asyncHandler(async (_req, res) => {
    const [products, categories] = await Promise.all([
      fetchAllProducts(),
      storage.getCategories(),
    ]);

    res
      .type("application/xml; charset=utf-8")
      .send(generateGoogleMerchantFeed(products, categories));
  })
);

// RSS 2.0 피드 (최신 상품 50개)
router.get(
  "/rss.xml",
  cacheStrategies.staticData,
  asyncHandler(async (_req, res) => {
    const products = await fetchAllProducts();

    res
      .type("application/rss+xml; charset=utf-8")
      .send(generateRssFeed(products));
  })
);

// 네이버 쇼핑 EP 피드 (판매 중 상품만, TSV)
router.get(
  "/naver-ep.txt",
  cacheStrategies.staticData,
  asyncHandler(async (_req, res) => {
    const [products, categories] = await Promise.all([
      fetchAllProducts(),
      storage.getCategories(),
    ]);

    res
      .type("text/plain; charset=utf-8")
      .send(generateNaverEpFeed(products, categories));
  })
);

export default router;
