// server/utils/feeds/rss.ts
// RSS 2.0 피드 생성 — 네이버 서치어드바이저 RSS 제출용
// 네이버는 sitemap보다 RSS 기반 신규 문서 발견이 빠른 경우가 많음

import { SITE_CONFIG } from "../seo";
import {
  escapeXml,
  sanitizeText,
  toKrwInteger,
  getProductUrl,
  toRfc822,
  type FeedProduct,
} from "./common";

// 최신 상품 50개만 노출 (신규 문서 발견 목적이므로 전체 불필요)
const RSS_ITEM_LIMIT = 50;

/**
 * 최신 상품 → RSS 2.0 XML 생성
 */
export function generateRssFeed(products: FeedProduct[]): string {
  // createdAt 최신순 정렬 후 상위 N개
  const recent = [...products]
    .filter((p) => p.name)
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime()
    )
    .slice(0, RSS_ITEM_LIMIT);

  const items = recent
    .map((product) => {
      const url = getProductUrl(product);
      const price = toKrwInteger(product.price);
      const description = sanitizeText(
        product.description ||
          `${product.name} - ${SITE_CONFIG.name} 빈티지 (${price.toLocaleString("ko-KR")}원)`,
        500
      );

      return [
        "    <item>",
        `      <title>${escapeXml(sanitizeText(product.name, 100))}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(description)}</description>`,
        `      <pubDate>${toRfc822(product.createdAt)}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0">`,
    `  <channel>`,
    `    <title>${escapeXml(SITE_CONFIG.name)}</title>`,
    `    <link>${escapeXml(SITE_CONFIG.url)}</link>`,
    `    <description>${escapeXml(SITE_CONFIG.description)}</description>`,
    `    <language>ko</language>`,
    `    <lastBuildDate>${toRfc822(new Date())}</lastBuildDate>`,
    items,
    `  </channel>`,
    `</rss>`,
  ].join("\n");
}
