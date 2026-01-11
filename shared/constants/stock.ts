// shared/constants/stock.ts
// 🔒 Option A: 재고 선점 제거
// 재고 관련 에러 메시지만 유지

// 재고 메시지 (주문 생성 시 사용)
export const STOCK_MESSAGES = {
  // 에러
  INSUFFICIENT_STOCK: "재고가 부족합니다",
  PRODUCT_NOT_FOUND: "상품을 찾을 수 없습니다",
  VARIANT_NOT_FOUND: "상품 옵션을 찾을 수 없습니다",

  // 🔒 사용 안함 (재고 선점 제거로 인해 deprecated)
  RESERVED: "재고가 선점되었습니다",
  RELEASED: "재고 선점이 해제되었습니다",
  RESERVATION_NOT_FOUND: "선점 정보를 찾을 수 없습니다",
  RESERVATION_EXPIRED: "선점이 만료되었습니다",
  ALREADY_RESERVED: "이미 선점된 상품이 있습니다",
  INVALID_RESERVATION: "유효하지 않은 선점입니다",
} as const;

// 🔒 Option A: 재고 선점 제거 - 아래 상수는 사용되지 않음
// export const STOCK_RESERVATION = {
//   TTL_SECONDS: 180,
//   CLEANUP_INTERVAL_MS: 60000,
// } as const;
