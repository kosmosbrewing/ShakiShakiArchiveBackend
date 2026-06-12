// server/utils/feeds/naverEp.ts
// 네이버 쇼핑 EP(Engine Page) 피드 생성 — TSV (UTF-8)
// 쇼핑파트너존 입점 후 이 피드 URL을 등록하면 네이버 쇼핑 검색에 노출됨
// 스펙: 1행 탭 구분 필드명 헤더, 이후 상품 1개/행
// 주의: 품절 상품은 반드시 제외 (품절 노출 시 네이버 페널티)

import { SITE_CONFIG } from "../seo";
import { optimizeForOg } from "../cloudinary";
import type { Category } from "@shared/schema";
import {
  sanitizeText,
  toKrwInteger,
  getProductUrl,
  isInStock,
  type FeedProduct,
} from "./common";

// 기본 배송비 (terms 페이지 정책과 동일: 3,500원)
const SHIPPING_FEE_KRW = 3500;

// EP 필드 순서 (헤더와 행이 동일한 순서를 유지해야 함)
const EP_FIELDS = [
  "id",
  "title",
  "price_pc",
  "link",
  "image_link",
  "category_name1",
  "condition",
  "shipping",
  "brand",
  "update_time",
] as const;

/**
 * YYYY-MM-DD HH:mm:ss 포맷 (네이버 update_time 스펙, KST 기준)
 */
function toEpDateTime(value: Date | string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  // KST(UTC+9) 변환 후 ISO 문자열에서 날짜/시간 추출
  const kst = new Date(safe.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * 판매 중인 상품 → 네이버 EP TSV 생성
 */
export function generateNaverEpFeed(
  products: FeedProduct[],
  categories: Category[]
): string {
  const categoryNameById = new Map(
    categories.map((c) => [String(c.id), c.name])
  );

  const rows = products
    // 품절/비활성 상품 제외 + 가격 0원 상품 제외
    .filter((p) => p.name && isInStock(p) && toKrwInteger(p.price) > 0)
    .map((product) => {
      const values: Record<(typeof EP_FIELDS)[number], string> = {
        id: sanitizeText(product.slug || product.id, 50),
        title: sanitizeText(product.name, 100),
        price_pc: String(toKrwInteger(product.price)),
        link: getProductUrl(product),
        image_link: optimizeForOg(
          product.imageUrl || product.images?.[0] || SITE_CONFIG.logo
        ),
        category_name1: product.categoryId
          ? sanitizeText(categoryNameById.get(String(product.categoryId)), 50)
          : "",
        // U = 중고 (빈티지/구제 필수 표기)
        condition: "U",
        shipping: String(SHIPPING_FEE_KRW),
        brand: sanitizeText(SITE_CONFIG.name, 50),
        update_time: toEpDateTime(product.updatedAt || product.createdAt),
      };

      return EP_FIELDS.map((field) => values[field]).join("\t");
    });

  return [EP_FIELDS.join("\t"), ...rows].join("\n");
}
