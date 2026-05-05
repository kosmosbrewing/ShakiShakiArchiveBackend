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
  "@type": string | string[];
  name: string;
  url: string;
  logo: string;
  description?: string;
  address?: {
    "@type": "PostalAddress";
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
  priceRange?: string;
  sameAs?: string[];
}

export interface JsonLdWebSite {
  "@context": "https://schema.org";
  "@type": "WebSite";
  name: string;
  url: string;
}

export interface JsonLdProduct {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description?: string;
  image?: string[];
  sku?: string;
  category?: string;
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
    itemCondition: string;
    priceValidUntil: string;
    shippingDetails?: {
      "@type": "OfferShippingDetails";
      shippingRate: {
        "@type": "MonetaryAmount";
        value: string;
        currency: string;
      };
      shippingDestination?: {
        "@type": "DefinedRegion";
        addressCountry: string;
      };
      // 배송 소요시간 (handling + transit = 최대 7일)
      deliveryTime?: {
        "@type": "ShippingDeliveryTime";
        handlingTime: {
          "@type": "QuantitativeValue";
          minValue: number;
          maxValue: number;
          unitCode: string;
        };
        transitTime: {
          "@type": "QuantitativeValue";
          minValue: number;
          maxValue: number;
          unitCode: string;
        };
      };
    };
    // 반품 정책 (Google 리치 스니펫 권장 필드)
    hasMerchantReturnPolicy?: {
      "@type": "MerchantReturnPolicy";
      applicableCountry: string;
      returnPolicyCategory: string;
      merchantReturnDays: number;
      returnMethod: string;
      returnFees: string;
    };
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

export interface JsonLdFaqPage {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: {
      "@type": "Answer";
      text: string;
    };
  }>;
}

interface FaqEntry {
  question: string;
  answer: string;
}

const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: "배송비는 얼마인가요?",
    answer:
      "70,000원 이상 구매 시 무료배송이며, 미만 시 기본 배송비 3,500원입니다.\n제주 및 도서산간 지역은 추가 배송비 2,500원입니다.",
  },
  {
    question: "배송은 얼마나 걸리나요?",
    answer:
      "결제 완료 후 최대 7일 이내에 택배로 배송됩니다.\n제주 및 도서산간 지역은 1~2일 추가 소요될 수 있습니다.",
  },
  {
    question: "반품/환불은 어떻게 하나요?",
    answer:
      "상품 수령 후 7일 이내 신청 및 14일 이내 상품 도착 시 환불 가능합니다.\n마이페이지 > 주문내역에서 반품 신청 후, 고객님께서 직접 택배로 발송해 주셔야 합니다.",
  },
  {
    question: "반품 시 배송비는 어떻게 되나요?",
    answer:
      "고객 단순 변심의 경우 배송비는 '선불' 결제가 원칙입니다. 착불 도착 시 해당 금액만큼 환불금에서 차감됩니다.\n무료배송 혜택 수령 후 반품 시 조건 미달이면 초기 배송비 3,500원이 추가 차감될 수 있습니다.\n상품 불량 및 오배송의 경우 배송비 부담 없이 전액 환불됩니다.",
  },
  {
    question: "주문 후 배송지 변경이 가능한가요?",
    answer:
      "상품 발송 전이라면 1:1문의를 통해 변경이 가능합니다.\n발송 후에는 변경이 어려우니 빠른 연락 부탁드립니다.",
  },
  {
    question: "환불은 언제 되나요?",
    answer:
      "환불은 결제 수단에 따라 즉시~3영업일 이내 완료됩니다.\n정확한 환불 일정은 결제수단 및 카드사 정책에 따라 상이할 수 있습니다.",
  },
];

const HOME_STORE_INFO = {
  streetAddress: "덕곡2길 203-28",
  addressLocality: "밀양시",
  addressRegion: "경상남도",
  postalCode: "50414",
  addressCountry: "KR",
  priceRange: "₩₩",
};

// src/components/Navbar.vue 의 INSTAGRAM_WEB_URL과 동일 값 사용
const BRAND_SAME_AS = ["https://www.instagram.com/shaki.arc/"];

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
  // 홈 전용 title/description — 상품·카테고리 페이지와 별도로 관리
  const homeTitle = config.seo.homeTitle || SITE_CONFIG.name;
  const homeDescription = config.seo.homeDescription || SITE_CONFIG.description;

  const openGraph: OpenGraphMeta = {
    title: homeTitle,
    description: homeDescription,
    url: SITE_CONFIG.url,
    type: "website",
    image: SITE_CONFIG.logo,
    siteName: SITE_CONFIG.name,
    locale: SITE_CONFIG.locale,
    twitter: {
      card: "summary_large_image",
      title: homeTitle,
      description: homeDescription,
      image: SITE_CONFIG.logo,
    },
  };

  const jsonLd: (JsonLdOrganization | JsonLdWebSite)[] = [
    {
      "@context": "https://schema.org",
      "@type": ["Organization", "ClothingStore"],
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.url,
      logo: SITE_CONFIG.logo,
      description: SITE_CONFIG.description,
      address: {
        "@type": "PostalAddress",
        streetAddress: HOME_STORE_INFO.streetAddress,
        addressLocality: HOME_STORE_INFO.addressLocality,
        addressRegion: HOME_STORE_INFO.addressRegion,
        postalCode: HOME_STORE_INFO.postalCode,
        addressCountry: HOME_STORE_INFO.addressCountry,
      },
      priceRange: HOME_STORE_INFO.priceRange,
      sameAs: BRAND_SAME_AS,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.url,
    },
  ];

  return { openGraph, jsonLd };
}

/**
 * FAQ 페이지 SEO 데이터 생성
 */
export function generateFaqSeo(): {
  openGraph: OpenGraphMeta;
  jsonLd: (JsonLdFaqPage | JsonLdBreadcrumb)[];
} {
  const faqUrl = `${SITE_CONFIG.url}/faq`;
  const description =
    "배송비, 무료배송 기준, 배송 기간, 반품/환불 조건 등 자주 묻는 질문을 확인하세요.";

  const openGraph: OpenGraphMeta = {
    title: `자주 묻는 질문 | ${SITE_CONFIG.name}`,
    description,
    url: faqUrl,
    type: "website",
    image: SITE_CONFIG.logo,
    siteName: SITE_CONFIG.name,
    locale: SITE_CONFIG.locale,
    twitter: {
      card: "summary_large_image",
      title: `자주 묻는 질문 | ${SITE_CONFIG.name}`,
      description,
      image: SITE_CONFIG.logo,
    },
  };

  const jsonLd: (JsonLdFaqPage | JsonLdBreadcrumb)[] = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ENTRIES.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: SITE_CONFIG.url },
        { "@type": "ListItem", position: 2, name: "FAQ", item: faqUrl },
      ],
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

  // 가격 유효기간: 1년 후 (Google 리치 스니펫 권장 필드)
  const priceValidUntil = new Date();
  priceValidUntil.setFullYear(priceValidUntil.getFullYear() + 1);
  const priceValidUntilStr = priceValidUntil.toISOString().split("T")[0];

  const jsonLd: (JsonLdProduct | JsonLdBreadcrumb)[] = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description || undefined,
      image: productImages.length > 0 ? productImages.map(optimizeForOg) : undefined,
      sku: product.id,
      // 카테고리 정보 (검색 관련성 향상)
      category: categoryName || undefined,
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
        // 빈티지/구제 상품임을 명시 → Google 중고품 검색 필터에서 노출
        itemCondition: "https://schema.org/UsedCondition",
        priceValidUntil: priceValidUntilStr,
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingRate: {
            "@type": "MonetaryAmount",
            value: "3500",
            currency: SITE_CONFIG.currency,
          },
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "KR",
          },
          // 배송 소요시간: 처리 0-2일 + 운송 1-5일 = 총 최대 7일 이내
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
              "@type": "QuantitativeValue",
              minValue: 0,
              maxValue: 2,
              unitCode: "DAY",
            },
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: 1,
              maxValue: 5,
              unitCode: "DAY",
            },
          },
        },
        // 반품 정책: 수령 후 7일 이내, 고객 변심 시 왕복 배송비 부담
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          applicableCountry: "KR",
          returnPolicyCategory:
            "https://schema.org/MerchantReturnFiniteReturnWindow",
          merchantReturnDays: 7,
          returnMethod: "https://schema.org/ReturnByMail",
          returnFees: "https://schema.org/ReturnShippingFees",
        },
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
