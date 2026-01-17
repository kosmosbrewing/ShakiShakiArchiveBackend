// server/middleware/cache.middleware.ts
// HTTP 캐싱 전략 미들웨어

import { Request, Response, NextFunction } from "express";

export interface CacheOptions {
  maxAge: number;
  sMaxage?: number;
  staleWhileRevalidate?: number;
  isPrivate?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  mustRevalidate?: boolean;
  proxyRevalidate?: boolean;
  varyOn?: string[];
}

/**
 * Cache-Control 헤더 설정 미들웨어
 *
 * @param options - 캐싱 옵션
 * @returns Express 미들웨어 함수
 */
export const cacheControl = (options: CacheOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const directives: string[] = [];

    // public vs private
    directives.push(options.isPrivate ? "private" : "public");

    // no-store (캐시 저장 자체를 방지 - 가장 강력한 제한)
    if (options.noStore) {
      directives.push("no-store");
    }

    // no-cache 또는 max-age
    if (options.noCache) {
      directives.push("no-cache");
    } else {
      directives.push(`max-age=${options.maxAge}`);

      // s-maxage (CDN 캐시) - private일 때는 무시됨
      if (options.sMaxage !== undefined && !options.isPrivate) {
        directives.push(`s-maxage=${options.sMaxage}`);
      }

      // stale-while-revalidate
      if (options.staleWhileRevalidate !== undefined) {
        directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
      }
    }

    // must-revalidate (캐시 만료 시 반드시 재검증)
    if (options.mustRevalidate) {
      directives.push("must-revalidate");
    }

    // proxy-revalidate (공유 캐시에만 적용되는 must-revalidate)
    if (options.proxyRevalidate) {
      directives.push("proxy-revalidate");
    }

    res.set("Cache-Control", directives.join(", "));

    // Vary 헤더 설정 (중요: 사용자별 데이터 캐시 분리)
    if (options.varyOn && options.varyOn.length > 0) {
      const existingVary = res.getHeader("Vary");
      let varyValues = [...options.varyOn];

      // 기존 Vary 헤더가 있으면 병합
      if (existingVary) {
        const existing = existingVary
          .toString()
          .split(",")
          .map(v => v.trim())
          .filter(v => v.length > 0);
        varyValues.push(...existing);
      }

      // 중복 제거 후 설정
      const uniqueVary = Array.from(new Set(varyValues));
      res.set("Vary", uniqueVary.join(", "));
    }

    next();
  };
};

/**
 * 캐싱 전략 프리셋
 *
 * 각 엔드포인트 특성에 맞는 Cache-Control 헤더 제공
 */
export const cacheStrategies = {
  /**
   * 정적 데이터 (카테고리, 상수)
   * - 브라우저: 5분 (300초)
   * - CDN: 10분 (600초)
   * - stale: 1시간 (3600초)
   *
   * 사용처: /api/categories, /api/constants
   */
  staticData: cacheControl({
    maxAge: 300,
    sMaxage: 600,
    staleWhileRevalidate: 3600,
  }),

  /**
   * 동적 데이터 (상품 목록)
   * - 브라우저: 10초
   * - CDN: 1분 (60초)
   * - stale: 5분 (300초)
   *
   * 사용처: /api/products (목록), /api/search/products
   */
  productList: cacheControl({
    maxAge: 10,
    sMaxage: 60,
    staleWhileRevalidate: 300,
  }),

  /**
   * 상품 상세 데이터
   * - private + no-cache + no-store
   * - must-revalidate + proxy-revalidate (캐시 만료 시 반드시 재검증)
   * - 항상 최신 상태 보장 (재고 변동 즉시 반영)
   *
   * 사용처: /api/products/:id (상세), /api/products/:id/variants
   *
   * ⚠️ 중요:
   * - 상품 상세는 실시간 재고 반영이 중요하므로 캐시 저장 금지
   * - 여러 사용자가 동시에 보는 상품의 재고 정보가 달라지지 않도록 방지
   */
  productDetail: cacheControl({
    maxAge: 0,
    isPrivate: true,
    noCache: true,
    noStore: true,
    mustRevalidate: true,
    proxyRevalidate: true,
  }),

  /**
   * 사이트 이미지 (Hero, Marquee)
   * - 브라우저: 10분 (600초)
   * - CDN: 1시간 (3600초)
   * - stale: 1일 (86400초)
   *
   * 사용처: /api/site-images
   */
  siteImages: cacheControl({
    maxAge: 600,
    sMaxage: 3600,
    staleWhileRevalidate: 86400,
  }),

  /**
   * 사용자별 데이터 (장바구니, 주문)
   * - private + no-cache + no-store
   * - must-revalidate + proxy-revalidate (캐시 만료 시 반드시 재검증)
   * - Vary: Cookie, Authorization (사용자별 캐시 분리)
   * - s-maxage 없음 (CDN 캐싱 방지)
   *
   * 사용처: /api/cart, /api/orders
   *
   * ⚠️ 보안 중요:
   * - no-store: 캐시 저장 자체를 방지 (공유 PC 보안)
   * - 사용자별 데이터가 브라우저/CDN에 캐시되지 않도록 방지
   */
  private: cacheControl({
    maxAge: 0,
    isPrivate: true,
    noCache: true,
    noStore: true,
    mustRevalidate: true,
    proxyRevalidate: true,
    varyOn: ["Cookie", "Authorization"],
  }),

  /**
   * 인증 의존 데이터 (내 정보, 위시리스트)
   * - private
   * - 1분 캐시 (60초)
   * - stale: 5분 (300초) - 캐시 만료 후에도 백그라운드 갱신하며 즉시 응답
   * - Vary: Cookie, Authorization (사용자별 캐시 분리)
   *
   * 사용처: /api/user/*, /api/wishlist
   *
   * 성능 개선:
   * - stale-while-revalidate로 UX 향상
   * - 캐시 만료 시에도 이전 데이터 즉시 반환 + 백그라운드에서 갱신
   */
  userDependent: cacheControl({
    maxAge: 60,
    isPrivate: true,
    staleWhileRevalidate: 300,
    varyOn: ["Cookie", "Authorization"],
  }),

  /**
   * 관리자 API
   * - private + no-cache + no-store
   * - must-revalidate + proxy-revalidate (캐시 만료 시 반드시 재검증)
   * - Vary: Cookie, Authorization (관리자별 캐시 분리)
   * - 캐싱 없음 (항상 최신 데이터)
   *
   * 사용처: /api/admin/*
   *
   * ⚠️ 보안 중요:
   * - no-store: 민감한 관리 데이터 캐시 저장 방지
   * - 항상 서버에서 최신 데이터 조회
   */
  admin: cacheControl({
    maxAge: 0,
    isPrivate: true,
    noCache: true,
    noStore: true,
    mustRevalidate: true,
    proxyRevalidate: true,
    varyOn: ["Cookie", "Authorization"],
  }),
};
