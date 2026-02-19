// server/utils/seo.ts
// SEO 메타데이터 생성 유틸리티 (JSON-LD, OpenGraph)

import { config } from "../config";
import type { Product, Category } from "@shared/schema";
import { optimizeForOg, optimizeForList } from "./cloudinary";

// 사이트 기본 정보 (환경 변수로 설정 가능)
const SITE_CONFIG = {
  name: config.seo.siteName,
  description: config.seo.siteDescription,
  // URL 끝의 슬래시 제거 (중복 방지)
  url: config.frontendUrl.replace(/\/+$/, ""),
  locale: "ko_KR",
  currency: "KRW",
  logo: optimizeForOg(
    config.seo.siteLogo || `${config.frontendUrl}/logo.png`
  ),
};

// ============================================
// OpenGraph 메타데이터 타입
// ============================================
export interface OpenGraphMeta {
  title: string;
  description: string;
  url: string;
  type: "website" | "product" | "article";
  image?: string;
  siteName: string;
  locale: string;
  // 상품 전용 필드
  product?: {
    price: string;
    currency: string;
    availability: "in stock" | "out of stock";
  };
  // Twitter 카드
  twitter: {
    card: "summary" | "summary_large_image";
    title: string;
    description: string;
    image?: string;
  };
}

// ============================================
// JSON-LD 구조화 데이터 타입
// ============================================
export interface JsonLdOrganization {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  url: string;
  logo: string;
}

export interface JsonLdWebSite {
  "@context": "https://schema.org";
  "@type": "WebSite";
  name: string;
  url: string;
  potentialAction?: {
    "@type": "SearchAction";
    target: string;
    "query-input": string;
  };
}

export interface JsonLdProduct {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description?: string;
  image?: string[];
  sku?: string;
  brand?: {
    "@type": "Brand";
    name: string;
  };
  offers: {
    "@type": "Offer";
    url: string;
    priceCurrency: string;
    price: string;
    availability: string;
    seller: {
      "@type": "Organization";
      name: string;
    };
  };
}

export interface JsonLdBreadcrumb {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }>;
}

export interface JsonLdItemList {
  "@context": "https://schema.org";
  "@type": "ItemList";
  name: string;
  description?: string;
  numberOfItems: number;
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    url: string;
    name: string;
    image?: string;
  }>;
}

// ============================================
// SEO 생성 함수
// ============================================

/**
 * 홈페이지 SEO 데이터 생성
 */
export function generateHomeSeo(): {
  openGraph: OpenGraphMeta;
  jsonLd: (JsonLdOrganization | JsonLdWebSite)[];
} {
  const openGraph: OpenGraphMeta = {
    title: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.url,
    type: "website",
    image: SITE_CONFIG.logo,
    siteName: SITE_CONFIG.name,
    locale: SITE_CONFIG.locale,
    twitter: {
      card: "summary_large_image",
      title: SITE_CONFIG.name,
      description: SITE_CONFIG.description,
      image: SITE_CONFIG.logo,
    },
  };

  const jsonLd: (JsonLdOrganization | JsonLdWebSite)[] = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.url,
      logo: SITE_CONFIG.logo,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.url,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_CONFIG.url}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return { openGraph, jsonLd };
}

/**
 * 상품 상세 페이지 SEO 데이터 생성
 */
export function generateProductSeo(
  product: Product,
  categoryName?: string,
  categorySlug?: string // 브레드크럼브 URL 생성용
): {
  openGraph: OpenGraphMeta;
  jsonLd: (JsonLdProduct | JsonLdBreadcrumb)[];
} {
  // 실제 프론트엔드 라우트: /productDetail/:slug
  const productPathKey = product.slug || product.id;
  const productUrl = `${SITE_CONFIG.url}/productDetail/${productPathKey}`;
  const productImages = product.images?.length
    ? product.images
    : product.imageUrl
      ? [product.imageUrl]
      : [];
  const primaryImage = optimizeForOg(productImages[0] || SITE_CONFIG.logo);
  const description =
    product.description || `${product.name} - ${SITE_CONFIG.name}에서 구매하세요`;

  // 재고 상태 확인 (variant별 재고는 개별 확인 필요, 여기서는 isAvailable만 체크)
  const availability = product.isAvailable
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

  const openGraph: OpenGraphMeta = {
    title: `${product.name} | ${SITE_CONFIG.name}`,
    description,
    url: productUrl,
    type: "product",
    image: primaryImage,
    siteName: SITE_CONFIG.name,
    locale: SITE_CONFIG.locale,
    product: {
      price: String(product.price),
      currency: SITE_CONFIG.currency,
      availability: product.isAvailable ? "in stock" : "out of stock",
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      image: primaryImage,
    },
  };

  const jsonLd: (JsonLdProduct | JsonLdBreadcrumb)[] = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description || undefined,
      image: productImages.length > 0 ? productImages.map(optimizeForOg) : undefined,
      sku: product.id,
      brand: {
        "@type": "Brand",
        name: SITE_CONFIG.name,
      },
      offers: {
        "@type": "Offer",
        url: productUrl,
        priceCurrency: SITE_CONFIG.currency,
        price: String(product.price),
        availability,
        seller: {
          "@type": "Organization",
          name: SITE_CONFIG.name,
        },
      },
    },
  ];

  // 브레드크럼브 추가
  const breadcrumbItems = [
    { position: 1, name: "홈", item: SITE_CONFIG.url },
    { position: 2, name: "상품", item: `${SITE_CONFIG.url}/product/all` },
  ];

  if (categoryName) {
    breadcrumbItems.push({
      position: 3,
      name: categoryName,
      // categorySlug가 있으면 실제 카테고리 페이지 URL, 없으면 전체 상품 목록으로 fallback
      item: categorySlug
        ? `${SITE_CONFIG.url}/product/${categorySlug}`
        : `${SITE_CONFIG.url}/product/all`,
    });
    breadcrumbItems.push({
      position: 4,
      name: product.name,
      item: productUrl,
    });
  } else {
    breadcrumbItems.push({
      position: 3,
      name: product.name,
      item: productUrl,
    });
  }

  jsonLd.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item) => ({
      "@type": "ListItem" as const,
      ...item,
    })),
  });

  return { openGraph, jsonLd };
}

/**
 * 카테고리 페이지 SEO 데이터 생성
 */
export function generateCategorySeo(
  category: Category,
  products?: Product[]
): {
  openGraph: OpenGraphMeta;
  jsonLd: (JsonLdItemList | JsonLdBreadcrumb)[];
} {
  // 실제 프론트엔드 라우트: /product/:categorySlug
  const categoryUrl = `${SITE_CONFIG.url}/product/${category.slug}`;
  // 🔒 SEO 최적화: description이 너무 짧으면(20자 미만) fallback 사용
  const description =
    category.description && category.description.trim().length >= 20
      ? category.description
      : `샤키샤키가 엄선한 ${category.name} 빈티지 컬렉션`;

  const optimizedCategoryImage = optimizeForOg(
    category.imageUrl || SITE_CONFIG.logo
  );

  const openGraph: OpenGraphMeta = {
    title: `${category.name} | ${SITE_CONFIG.name}`,
    description,
    url: categoryUrl,
    type: "website",
    image: optimizedCategoryImage,
    siteName: SITE_CONFIG.name,
    locale: SITE_CONFIG.locale,
    twitter: {
      card: "summary_large_image",
      title: `${category.name} | ${SITE_CONFIG.name}`,
      description,
      image: optimizedCategoryImage,
    },
  };

  const jsonLd: (JsonLdItemList | JsonLdBreadcrumb)[] = [];

  // 상품 목록이 있으면 ItemList 추가
  if (products && products.length > 0) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: category.name,
      description: category.description || undefined,
      numberOfItems: products.length,
      itemListElement: products.slice(0, 20).map((product, index) => ({
        "@type": "ListItem" as const,
        position: index + 1,
        url: `${SITE_CONFIG.url}/productDetail/${product.slug || product.id}`,
        name: product.name,
        image: product.imageUrl ? optimizeForList(product.imageUrl) : undefined,
      })),
    });
  }

  // 브레드크럼브 추가
  jsonLd.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: SITE_CONFIG.url },
      {
        "@type": "ListItem",
        position: 2,
        name: category.name,
        item: categoryUrl,
      },
    ],
  });

  return { openGraph, jsonLd };
}

/**
 * 검색 결과 페이지 SEO 데이터 생성
 */
export function generateSearchSeo(
  query: string,
  resultCount: number
): {
  openGraph: OpenGraphMeta;
  jsonLd: JsonLdWebSite;
} {
  const searchUrl = `${SITE_CONFIG.url}/search?q=${encodeURIComponent(query)}`;
  const description = `"${query}" 검색 결과 ${resultCount}건 - ${SITE_CONFIG.name}`;

  const openGraph: OpenGraphMeta = {
    title: `"${query}" 검색 결과 | ${SITE_CONFIG.name}`,
    description,
    url: searchUrl,
    type: "website",
    siteName: SITE_CONFIG.name,
    locale: SITE_CONFIG.locale,
    twitter: {
      card: "summary",
      title: `"${query}" 검색 결과 | ${SITE_CONFIG.name}`,
      description,
    },
  };

  const jsonLd: JsonLdWebSite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.url,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_CONFIG.url}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return { openGraph, jsonLd };
}

/**
 * 상품 목록 페이지 SEO 데이터 생성
 */
export function generateProductListSeo(products: Product[]): {
  openGraph: OpenGraphMeta;
  jsonLd: JsonLdItemList;
} {
  const listUrl = `${SITE_CONFIG.url}/product/all`;
  const description = `전체 상품 ${products.length}개 - ${SITE_CONFIG.name}`;

  const openGraph: OpenGraphMeta = {
    title: `전체 상품 | ${SITE_CONFIG.name}`,
    description,
    url: listUrl,
    type: "website",
    image: SITE_CONFIG.logo,
    siteName: SITE_CONFIG.name,
    locale: SITE_CONFIG.locale,
    twitter: {
      card: "summary_large_image",
      title: `전체 상품 | ${SITE_CONFIG.name}`,
      description,
      image: SITE_CONFIG.logo,
    },
  };

  const jsonLd: JsonLdItemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "전체 상품",
    numberOfItems: products.length,
    itemListElement: products.slice(0, 30).map((product, index) => ({
      "@type": "ListItem" as const,
      position: index + 1,
      url: `${SITE_CONFIG.url}/productDetail/${product.slug || product.id}`,
      name: product.name,
      image: product.imageUrl ? optimizeForList(product.imageUrl) : undefined,
    })),
  };

  return { openGraph, jsonLd };
}

// SITE_CONFIG export (다른 곳에서 사용할 수 있도록)
export { SITE_CONFIG };
