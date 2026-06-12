// server/utils/feeds/googleMerchant.ts
// 구글 머천트 센터 상품 피드 생성 (RSS 2.0 + g: 네임스페이스)
// 무료 리스팅(Free Listings)용 — 구글 쇼핑 탭 노출
// 스펙: https://support.google.com/merchants/answer/7052112

import { SITE_CONFIG } from "../seo";
import { optimizeForOg } from "../cloudinary";
import type { Category } from "@shared/schema";
import {
  escapeXml,
  sanitizeText,
  toKrwInteger,
  getProductUrl,
  isInStock,
  type FeedProduct,
} from "./common";

// 기본 배송비 (terms 페이지 정책과 동일: 3,500원)
const SHIPPING_FEE_KRW = 3500;

/**
 * 상품 1개 → <item> XML 변환
 */
function buildItem(
  product: FeedProduct,
  categoryNameById: Map<string, string>
): string {
  const url = getProductUrl(product);
  const price = toKrwInteger(product.price);
  const image = product.imageUrl || product.images?.[0] || "";
  const additionalImages = (product.images || [])
    .filter((img) => img && img !== image)
    .slice(0, 10); // 구글 제한: additional_image_link 최대 10개
  const categoryName = product.categoryId
    ? categoryNameById.get(String(product.categoryId)) || ""
    : "";
  const description = sanitizeText(
    product.description || `${product.name} - ${SITE_CONFIG.name} 빈티지`,
    5000
  );

  const lines = [
    "    <item>",
    `      <g:id>${escapeXml(product.slug || product.id)}</g:id>`,
    `      <g:title>${escapeXml(sanitizeText(product.name, 150))}</g:title>`,
    `      <g:description>${escapeXml(description)}</g:description>`,
    `      <g:link>${escapeXml(url)}</g:link>`,
    image
      ? `      <g:image_link>${escapeXml(optimizeForOg(image))}</g:image_link>`
      : "",
    ...additionalImages.map(
      (img) =>
        `      <g:additional_image_link>${escapeXml(optimizeForOg(img))}</g:additional_image_link>`
    ),
    `      <g:availability>${isInStock(product) ? "in_stock" : "out_of_stock"}</g:availability>`,
    `      <g:price>${price} KRW</g:price>`,
    // 빈티지/구제 상품이므로 중고 필수 표기 (오표기 시 정책 위반)
    `      <g:condition>used</g:condition>`,
    `      <g:brand>${escapeXml(SITE_CONFIG.name)}</g:brand>`,
    // 빈티지 1점물은 GTIN/MPN이 없으므로 identifier_exists=false 필수
    `      <g:identifier_exists>false</g:identifier_exists>`,
    categoryName
      ? `      <g:product_type>${escapeXml(categoryName)}</g:product_type>`
      : "",
    `      <g:shipping>`,
    `        <g:country>KR</g:country>`,
    `        <g:service>Standard</g:service>`,
    `        <g:price>${SHIPPING_FEE_KRW} KRW</g:price>`,
    `      </g:shipping>`,
    "    </item>",
  ];

  return lines.filter(Boolean).join("\n");
}

/**
 * 전체 상품 → 구글 머천트 피드 XML 생성
 * 품절 상품도 out_of_stock으로 포함 (구글은 품절 표기를 허용)
 */
export function generateGoogleMerchantFeed(
  products: FeedProduct[],
  categories: Category[]
): string {
  const categoryNameById = new Map(
    categories.map((c) => [String(c.id), c.name])
  );

  const items = products
    .filter((p) => p.name && toKrwInteger(p.price) > 0)
    .map((p) => buildItem(p, categoryNameById))
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
    `  <channel>`,
    `    <title>${escapeXml(SITE_CONFIG.name)}</title>`,
    `    <link>${escapeXml(SITE_CONFIG.url)}</link>`,
    `    <description>${escapeXml(SITE_CONFIG.description)}</description>`,
    items,
    `  </channel>`,
    `</rss>`,
  ].join("\n");
}
