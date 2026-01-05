// shared/constants/shipping.ts
// 배송비 관련 상수

/**
 * 배송비 설정
 * SYNC: 프론트엔드/백엔드 공용
 */
export const SHIPPING = {
  /** 무료 배송 기준 금액 (원) */
  FREE_THRESHOLD: 70000,
  /** 기본 배송비 (원) */
  FEE: 3500,
  /** 제주/도서산간 추가 배송비 (원) */
  EXTRA_FEE: 2500,
} as const;

/**
 * 도서산간 우편번호 범위 목록
 * - 제주도, 울릉도, 옹진군 등 도서산간 지역
 */
export const REMOTE_AREA_POSTAL_CODES = [
  // 제주도 (63000-63644)
  { start: 63000, end: 63644 },
  // 울릉도/독도 (40200-40240)
  { start: 40200, end: 40240 },
  // 인천 옹진군 - 백령도, 대청도, 소청도 등 (23100-23136)
  { start: 23100, end: 23136 },
] as const;

/**
 * 도서산간 지역 여부 확인
 * @param postalCode - 우편번호 (5자리 문자열)
 * @returns 도서산간 지역이면 true
 */
export function isRemoteArea(postalCode: string): boolean {
  const code = parseInt(postalCode, 10);
  if (isNaN(code)) return false;

  return REMOTE_AREA_POSTAL_CODES.some(
    (range) => code >= range.start && code <= range.end
  );
}

/**
 * 배송비 계산
 * @param subtotal - 상품 금액 합계
 * @param postalCode - 우편번호 (도서산간 추가 배송비 계산용)
 * @returns 배송비 (무료 배송 조건 충족 시 기본 배송비 0, 도서산간은 추가)
 */
export function calculateShippingFee(
  subtotal: number,
  postalCode?: string
): number {
  // 기본 배송비 (무료 배송 조건 충족 시 0)
  let baseFee = subtotal >= SHIPPING.FREE_THRESHOLD ? 0 : SHIPPING.FEE;

  // 도서산간 추가 배송비 (무료 배송이어도 추가됨)
  if (postalCode && isRemoteArea(postalCode)) {
    baseFee += SHIPPING.EXTRA_FEE;
  }

  return baseFee;
}
