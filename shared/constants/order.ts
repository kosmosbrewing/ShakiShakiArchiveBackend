// shared/constants/order.ts
// 주문 관련 상수

/**
 * 주문 상태
 */
export const ORDER_STATUS = {
  /** 결제 대기 */
  PENDING_PAYMENT: "pending_payment",
  /** 결제 완료 */
  PAYMENT_CONFIRMED: "payment_confirmed",
  /** 상품 준비 중 */
  PREPARING: "preparing",
  /** 배송 중 */
  SHIPPED: "shipped",
  /** 배송 완료 */
  DELIVERED: "delivered",
  /** 주문 취소 */
  CANCELLED: "cancelled",
} as const;

export type OrderStatusType = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/**
 * 주문 상태 enum (스키마 호환용)
 */
export const ORDER_STATUS_ENUM = [
  ORDER_STATUS.PENDING_PAYMENT,
  ORDER_STATUS.PAYMENT_CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
] as const;

/**
 * 취소 불가능한 주문 상태 목록
 * 배송 중, 배송 완료, 이미 취소된 주문은 취소 불가
 */
export const NON_CANCELABLE_STATUSES = [
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
] as const;

/**
 * 주문 ID 생성 설정
 */
export const ORDER_ID_CONFIG = {
  /** 주문번호 접두사 */
  PREFIX: "SHAKI",
  /** timestamp 변환 진법 */
  RADIX: 36,
  /** 랜덤 문자열 시작 인덱스 */
  RANDOM_START: 2,
  /** 랜덤 문자열 끝 인덱스 */
  RANDOM_END: 8,
} as const;

/**
 * PG사 주문번호 생성
 * 형식: YYYYMMDD_SHAKI_{timestamp}_{random}
 */
export function generateExternalOrderId(): string {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const timestamp = Date.now()
    .toString(ORDER_ID_CONFIG.RADIX)
    .toUpperCase();
  const random = Math.random()
    .toString(ORDER_ID_CONFIG.RADIX)
    .substring(ORDER_ID_CONFIG.RANDOM_START, ORDER_ID_CONFIG.RANDOM_END)
    .toUpperCase();
  return `${dateStr}_${ORDER_ID_CONFIG.PREFIX}_${timestamp}_${random}`;
}

/**
 * 주문 취소 가능 여부 확인
 */
export function isCancelable(status: string): boolean {
  return !NON_CANCELABLE_STATUSES.includes(
    status as (typeof NON_CANCELABLE_STATUSES)[number]
  );
}
