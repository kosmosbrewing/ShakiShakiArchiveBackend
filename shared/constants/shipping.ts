// shared/constants/shipping.ts
// 배송비 관련 상수

/**
 * 배송비 설정
 * SYNC: 프론트엔드/백엔드 공용
 */
export const SHIPPING = {
  /** 무료 배송 기준 금액 (원) */
  FREE_THRESHOLD: 50000,
  /** 기본 배송비 (원) */
  FEE: 3000,
} as const;

/**
 * 배송비 계산
 * @param subtotal - 상품 금액 합계
 * @returns 배송비 (무료 배송 조건 충족 시 0)
 */
export function calculateShippingFee(subtotal: number): number {
  return subtotal >= SHIPPING.FREE_THRESHOLD ? 0 : SHIPPING.FEE;
}
