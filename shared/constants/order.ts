// shared/constants/order.ts
// 주문 관련 상수

/**
 * 주문 상태
 */
export const ORDER_STATUS = {
  /** 결제 대기 */
  PENDING_PAYMENT: "pending_payment",
  /** 결제 진행 중 */
  PAYING: "paying",
  /** 결제 완료 */
  PAYMENT_CONFIRMED: "payment_confirmed",
  /** 상품 준비 중 */
  PREPARING: "preparing",
  /** 배송 중 */
  SHIPPED: "shipped",
  /** 배송 완료 */
  DELIVERED: "delivered",
  /** 주문 취소 (결제 전) */
  CANCELLED: "cancelled",
  /** 환불 완료 (결제 후 취소) */
  REFUNDED: "refunded",
} as const;

export type OrderStatusType = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/**
 * 주문 상태 enum (스키마 호환용)
 */
export const ORDER_STATUS_ENUM = [
  ORDER_STATUS.PENDING_PAYMENT,
  ORDER_STATUS.PAYING,
  ORDER_STATUS.PAYMENT_CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUNDED,
] as const;

/**
 * 취소 불가능한 주문 상태 목록
 * 배송 중, 배송 완료, 이미 취소/환불된 주문은 취소 불가
 */
export const NON_CANCELABLE_STATUSES = [
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUNDED,
] as const;

/**
 * 주문 ID 생성 설정
 */
export const ORDER_ID_CONFIG = {
  /** 주문번호 접두사 */
  PREFIX: "SHAKI",
  /** 랜덤 문자열 변환 진법 (36진수: 0-9, A-Z) */
  RADIX: 36,
  /** 랜덤 문자열 시작 인덱스 */
  RANDOM_START: 2,
  /** 랜덤 문자열 끝 인덱스 (4자리: 2~6) */
  RANDOM_END: 6,
} as const;

/**
 * PG사 주문번호 생성 (시분초 + 4자리 난수)
 * 형식: YYYYMMDD_SHAKI_HHMMSS_{random4}
 * 예시: 20260119_SHAKI_143052_A3F9
 *
 * 특징:
 * - 주문 생성 시각(년월일시분초)을 주문번호에서 바로 확인 가능
 * - 4자리 난수(36^4 = 1,679,616)로 같은 초 내 충돌 방지
 * - UNIQUE 제약조건으로 혹시 모를 중복 차단
 */
export function generateExternalOrderId(): string {
  const now = new Date();

  // KST(UTC+9) 변환 - 서버 타임존과 무관하게 항상 한국 시간 적용
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);

  // 날짜: YYYYMMDD (UTC 메서드 사용 - KST 오프셋이 이미 적용됨)
  const dateStr =
    kst.getUTCFullYear().toString() +
    String(kst.getUTCMonth() + 1).padStart(2, "0") +
    String(kst.getUTCDate()).padStart(2, "0");

  // 시분초: HHMMSS
  const timeStr =
    String(kst.getUTCHours()).padStart(2, "0") +
    String(kst.getUTCMinutes()).padStart(2, "0") +
    String(kst.getUTCSeconds()).padStart(2, "0");

  // 랜덤 4자리 (36^4 = 1,679,616 경우의 수)
  const random = Math.random()
    .toString(ORDER_ID_CONFIG.RADIX)
    .substring(2, 6) // 4자리
    .toUpperCase();

  return `${dateStr}_${ORDER_ID_CONFIG.PREFIX}_${timeStr}_${random}`;
}

/**
 * 주문 취소 가능 여부 확인
 */
export function isCancelable(status: string): boolean {
  return !NON_CANCELABLE_STATUSES.includes(
    status as (typeof NON_CANCELABLE_STATUSES)[number]
  );
}
