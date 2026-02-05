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
 * 반품지 정보
 * 네이버페이 상품정보 API 등에서 사용
 */
export const RETURN_INFO = {
  /** 반품지 우편번호 */
  zipcode: "48411",
  /** 반품지 기본주소 */
  address1: "부산광역시 남구 전포대로 84-1",
  /** 반품지 상세주소 */
  address2: "104동 201호",
  /** 판매자명 */
  sellername: "손유진",
  /** 연락처1 (필수) */
  contact1: "010-7347-4088",
  /** 연락처2 (선택) */
  contact2: "",
} as const;

/**
 * 반품/교환 배송비 (편도/왕복)
 */
export const RETURN_SHIPPING_FEE = {
  /** 반품 배송비 (편도) */
  RETURN: 3500,
  /** 교환 배송비 (왕복) */
  EXCHANGE: 7000,
} as const;

/**
 * 도서산간 우편번호 범위 목록
 * 두 기준을 조합하여 최신화 (2024년 기준)
 */
export const REMOTE_AREA_POSTAL_CODES = [
  // === 제주도 전지역 ===
  { start: 63000, end: 63644, label: "제주도" },

  // === 인천 섬지역 ===
  { start: 22386, end: 22388, label: "인천 중구 섬지역" },
  { start: 23004, end: 23010, label: "인천 강화 섬지역" },
  { start: 23100, end: 23116, label: "인천 옹진 섬지역" },
  { start: 23124, end: 23136, label: "인천 옹진 섬지역" },

  // === 충남 섬지역 ===
  { start: 31708, end: 31708, label: "충남 당진 섬지역" },
  { start: 32133, end: 32133, label: "충남 태안 섬지역" },
  { start: 33411, end: 33411, label: "충남 보령 섬지역" },

  // === 경북 울릉도/독도 ===
  { start: 40200, end: 40240, label: "경북 울릉도/독도" },

  // === 부산 섬지역 ===
  { start: 46768, end: 46771, label: "부산 강서구 섬지역" },

  // === 경남 섬지역 ===
  { start: 52570, end: 52571, label: "경남 사천 섬지역" },
  { start: 53031, end: 53033, label: "경남 통영 섬지역" },
  { start: 53088, end: 53104, label: "경남 통영 섬지역" },
  { start: 54000, end: 54000, label: "경남 통영 섬지역" },

  // === 전북 섬지역 ===
  { start: 56347, end: 56349, label: "전북 부안 섬지역" },

  // === 전남 섬지역 ===
  { start: 57068, end: 57069, label: "전남 영광 섬지역" },
  { start: 58760, end: 58762, label: "전남 목포 섬지역" },
  { start: 58800, end: 58810, label: "전남 신안 섬지역" },
  { start: 58816, end: 58818, label: "전남 신안 섬지역" },
  { start: 58826, end: 58826, label: "전남 신안 섬지역" },
  { start: 58828, end: 58866, label: "전남 신안 섬지역" },
  { start: 58953, end: 58958, label: "전남 진도 섬지역" },
  { start: 59102, end: 59103, label: "전남 완도 섬지역" },
  { start: 59106, end: 59106, label: "전남 완도 섬지역" },
  { start: 59127, end: 59127, label: "전남 완도 섬지역" },
  { start: 59129, end: 59129, label: "전남 완도 섬지역" },
  { start: 59137, end: 59170, label: "전남 완도 섬지역" },
  { start: 59421, end: 59421, label: "전남 여수 섬지역" },
  { start: 59531, end: 59531, label: "전남 여수 섬지역" },
  { start: 59558, end: 59558, label: "전남 여수 섬지역" },
  { start: 59563, end: 59563, label: "전남 여수 섬지역" },
  { start: 59568, end: 59568, label: "전남 여수 섬지역" },
  { start: 59573, end: 59573, label: "전남 여수 섬지역" },
  { start: 59650, end: 59650, label: "전남 여수 섬지역" },
  { start: 59766, end: 59766, label: "전남 여수 섬지역" },
  { start: 59781, end: 59790, label: "전남 여수 섬지역" },
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
    (range) => code >= range.start && code <= range.end,
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
  postalCode?: string,
): number {
  // 기본 배송비 (무료 배송 조건 충족 시 0)
  let baseFee = subtotal >= SHIPPING.FREE_THRESHOLD ? 0 : SHIPPING.FEE;

  // 도서산간 추가 배송비 (무료 배송이어도 추가됨)
  if (postalCode && isRemoteArea(postalCode)) {
    baseFee += SHIPPING.EXTRA_FEE;
  }

  return baseFee;
}

// ------------------------------------------------------------------
// 환불 계산 관련 타입 및 함수
// ------------------------------------------------------------------

/**
 * 환불 계산 입력 타입
 */
export interface RefundCalculationInput {
  /** 취소/반품할 상품 금액 합계 */
  itemsAmount: number;
  /** 주문 시 고객이 결제한 배송비 (무료배송이면 0) */
  paidShippingFee: number;
  /** 전체 주문 금액 (상품만) */
  totalOrderAmount: number;
  /** 현재까지 환불 완료된 상품 금액 */
  alreadyRefundedAmount: number;
  /** 마지막 상품 취소/반품 여부 */
  isLastItems: boolean;
  /** 판매자 귀책 여부 (불량, 오배송) */
  isSellerFault: boolean;
  /** 배송 후 반품 여부 (배송 전 취소면 false) */
  isAfterShipping: boolean;
  /** 페널티 이미 차감 여부 (주문의 shippingPenaltyApplied) */
  penaltyAlreadyApplied: boolean;
  /** 판매자 귀책 취소 금액 (직권 취소로 인한 무료배송 기준 붕괴 시 고객 보호) */
  sellerCancelledAmount?: number;
}

/**
 * 환불 계산 결과 타입
 */
export interface RefundCalculationResult {
  /** 상품 환불 금액 */
  itemsRefund: number;
  /** 배송비 환불 금액 */
  shippingRefund: number;
  /** 페널티 (무료배송 혜택 회수 + 배송비 차감) */
  penalty: number;
  /** 최종 환불 금액 */
  totalRefund: number;
  /** 플래그 변경 여부 */
  shouldUpdatePenaltyFlag: boolean;
}

/**
 * 무료배송 혜택 여부 확인
 * - paidShippingFee가 0원: 일반 지역 무료배송
 * - paidShippingFee가 도서산간 추가 배송비(2,500원)만: 도서산간 무료배송
 * - 그 외: 기본 배송비를 결제한 유료배송
 */
function hadFreeShippingBenefit(paidShippingFee: number): boolean {
  return paidShippingFee === 0 || paidShippingFee === SHIPPING.EXTRA_FEE;
}

/**
 * 페널티 계산 (무료배송 혜택 회수)
 * @param paidShippingFee - 결제한 배송비
 * @param remainingAmount - 실제 남은 금액
 * @param penaltyAlreadyApplied - 이미 페널티 차감됨
 * @param sellerCancelledAmount - 판매자 귀책 취소 금액 (가상 남은 금액 계산용)
 */
function calculatePenalty(
  paidShippingFee: number,
  remainingAmount: number,
  penaltyAlreadyApplied: boolean,
  sellerCancelledAmount: number = 0,
): { penalty: number; shouldUpdateFlag: boolean } {
  // 유료배송 주문 (기본 배송비를 결제한 경우): 페널티 없음
  if (!hadFreeShippingBenefit(paidShippingFee)) {
    return { penalty: 0, shouldUpdateFlag: false };
  }

  // 가상 남은 금액: 판매자 귀책 취소 금액을 더해서 계산
  // (판매자 직권 취소로 기준이 깨진 경우 고객 보호)
  const virtualRemainingAmount = remainingAmount + sellerCancelledAmount;

  // 무료배송 + 가상 남은 금액이 기준 이상: 페널티 없음
  if (virtualRemainingAmount >= SHIPPING.FREE_THRESHOLD) {
    return { penalty: 0, shouldUpdateFlag: false };
  }

  // 무료배송 + 이미 페널티 차감됨: 페널티 없음
  if (penaltyAlreadyApplied) {
    return { penalty: 0, shouldUpdateFlag: false };
  }

  // 무료배송 + 가상 남은 금액이 기준 미만 + 최초: 기본배송비 페널티
  return { penalty: SHIPPING.FEE, shouldUpdateFlag: true };
}

/**
 * 환불 금액 계산
 *
 * 환불 로직:
 * - 배송 전 부분 취소: 상품값만
 * - 배송 전 마지막 취소: 상품값 + 낸 배송비
 * - 배송 후 부분 반품 (판매자 귀책): 상품값
 * - 배송 후 마지막 반품 (판매자 귀책): 상품값 + 낸 배송비
 * - 배송 후 부분 반품 (고객 귀책): 상품값 - 페널티
 * - 배송 후 마지막 반품 (고객 귀책): 상품값 + 낸 배송비 - 낸 배송비 - 기본배송비(무료배송 혜택 회수)
 */
export function calculateRefund(
  input: RefundCalculationInput,
): RefundCalculationResult {
  const {
    itemsAmount,
    paidShippingFee,
    totalOrderAmount,
    alreadyRefundedAmount,
    isLastItems,
    isSellerFault,
    isAfterShipping,
    penaltyAlreadyApplied,
    sellerCancelledAmount = 0,
  } = input;

  // 남은 금액 계산: 전체 주문 - 이미 환불 - 현재 환불
  const remainingAmount =
    totalOrderAmount - alreadyRefundedAmount - itemsAmount;

  let itemsRefund = itemsAmount;
  let shippingRefund = 0;
  let penalty = 0;
  let shouldUpdatePenaltyFlag = false;

  // === 배송 전 취소 ===
  if (!isAfterShipping) {
    if (isLastItems) {
      // 배송 전 마지막 취소: 상품값 + 낸 배송비
      shippingRefund = paidShippingFee;
    }
    // 배송 전 부분 취소: 상품값만
  }
  // === 배송 후 반품 ===
  else {
    if (isSellerFault) {
      // 판매자 귀책: 페널티 없음
      if (isLastItems) {
        // 마지막 반품: 상품값 + 낸 배송비
        shippingRefund = paidShippingFee;
      }
      // 부분 반품: 상품값만
    } else {
      // 고객 귀책
      if (isLastItems) {
        // 마지막 반품: 상품값 + 낸 배송비 - 낸 배송비 - 기본배송비(무료배송 혜택 회수)
        shippingRefund = paidShippingFee;
        penalty = paidShippingFee; // 실제 낸 배송비 차감 (배송은 이미 사용)

        // 무료배송 혜택을 받았고, 아직 페널티가 적용되지 않았다면 기본 배송비도 차감
        // 단, 판매자 귀책 취소 금액이 무료배송 기준 이상이면 페널티 면제 (고객 보호)
        const shouldApplyPenalty =
          hadFreeShippingBenefit(paidShippingFee) &&
          !penaltyAlreadyApplied &&
          sellerCancelledAmount < SHIPPING.FREE_THRESHOLD;

        if (shouldApplyPenalty) {
          penalty += SHIPPING.FEE;
          shouldUpdatePenaltyFlag = true;
        }
      } else {
        // 부분 반품: 상품값 - 페널티
        const penaltyResult = calculatePenalty(
          paidShippingFee,
          remainingAmount,
          penaltyAlreadyApplied,
          sellerCancelledAmount,
        );
        penalty = penaltyResult.penalty;
        shouldUpdatePenaltyFlag = penaltyResult.shouldUpdateFlag;
      }
    }
  }

  // 최종 환불 금액 계산 (최소 0원)
  const totalRefund = Math.max(0, itemsRefund + shippingRefund - penalty);

  return {
    itemsRefund,
    shippingRefund,
    penalty,
    totalRefund,
    shouldUpdatePenaltyFlag,
  };
}

/**
 * 환불 내역 요약 문자열 생성
 */
export function formatRefundSummary(result: RefundCalculationResult): string {
  const lines: string[] = [];

  lines.push(`상품 금액: ${result.itemsRefund.toLocaleString()}원`);

  if (result.shippingRefund > 0) {
    lines.push(`배송비 환불: +${result.shippingRefund.toLocaleString()}원`);
  }

  if (result.penalty > 0) {
    lines.push(`배송비 차감: -${result.penalty.toLocaleString()}원`);
  }

  lines.push(`───────────────`);
  lines.push(`총 환불 금액: ${result.totalRefund.toLocaleString()}원`);

  return lines.join("\n");
}
