// shared/constants/stock.ts
// 재고 선점 관련 상수

// 재고 선점 설정
export const STOCK_RESERVATION = {
  // 선점 유효 시간 (초) - 10분
  TTL_SECONDS: 600,
  // 만료된 선점 정리 주기 (밀리초) - 1분
  CLEANUP_INTERVAL_MS: 60000,
} as const;

// 재고 선점 메시지
export const STOCK_MESSAGES = {
  // 성공
  RESERVED: "재고가 선점되었습니다",
  RELEASED: "재고 선점이 해제되었습니다",

  // 에러
  INSUFFICIENT_STOCK: "재고가 부족합니다",
  RESERVATION_NOT_FOUND: "선점 정보를 찾을 수 없습니다",
  RESERVATION_EXPIRED: "선점이 만료되었습니다",
  PRODUCT_NOT_FOUND: "상품을 찾을 수 없습니다",
  VARIANT_NOT_FOUND: "상품 옵션을 찾을 수 없습니다",
  ALREADY_RESERVED: "이미 선점된 상품이 있습니다",
  INVALID_RESERVATION: "유효하지 않은 선점입니다",
} as const;
