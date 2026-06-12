// server/utils/feeds/common.ts
// 상품 피드(구글 머천트, 네이버 EP, RSS) 공통 유틸리티

import { SITE_CONFIG } from "../seo";
import type { Product } from "@shared/schema";

// getProducts()가 variant 재고 합계를 함께 반환하는 형태
export type FeedProduct = Product & { totalStock: number };

/**
 * XML 특수문자 이스케이프
 */
export function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 피드 텍스트 정리: 제어문자/탭/개행 제거 + 길이 제한
 * 네이버 EP는 TSV라서 탭/개행이 포함되면 필드가 깨짐
 */
export function sanitizeText(value: unknown, maxLength = 1000): string {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * decimal 문자열 가격("39000.00")을 정수 원화로 변환
 */
export function toKrwInteger(price: unknown): number {
  const parsed = Math.round(parseFloat(String(price ?? "0")));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * 상품 상세 URL (프론트 라우트 /productDetail/:slug 와 일치)
 */
export function getProductUrl(product: Product): string {
  return `${SITE_CONFIG.url}/productDetail/${product.slug || product.id}`;
}

/**
 * 판매 가능 여부: isAvailable 플래그 + variant 재고 합계 기준
 */
export function isInStock(product: FeedProduct): boolean {
  return product.isAvailable !== false && product.totalStock > 0;
}

/**
 * RFC 822 날짜 포맷 (RSS pubDate용)
 */
export function toRfc822(value: Date | string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toUTCString()
    : date.toUTCString();
}
