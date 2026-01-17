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
  RESERVED: "결제를 위해 상품을 잠시 보관 중이에요!",
  RELEASED: "결제 대기 시간이 지나 아쉽게도 상품이 다시 공개되었습니다.",
  RESERVATION_NOT_FOUND: "선택하신 상품 정보를 다시 확인할 수 없습니다.",
  RESERVATION_EXPIRED: "보관 시간이 끝났어요. 다시 상품을 선택해 주세요.",
  ALREADY_RESERVED: "지금 다른 분이 먼저 이 상품의 결제를 진행하고 있어요.",
  INVALID_RESERVATION:
    "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

// 🔒 Option A: 재고 선점 제거 - 아래 상수는 사용되지 않음
// export const STOCK_RESERVATION = {
//   TTL_SECONDS: 180,
//   CLEANUP_INTERVAL_MS: 60000,
// } as const;
