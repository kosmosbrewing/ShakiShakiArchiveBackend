// shared/constants/validation.ts
// 검증 규칙 관련 상수

/**
 * 수량 제한
 */
export const QUANTITY = {
  /** 최소 주문 수량 */
  MIN: 1,
  /** 최대 주문 수량 */
  MAX: 99,
} as const;

/**
 * 가격 제한
 */
export const PRICE = {
  /** 최소 상품 가격 (원) */
  MIN: 0,
  /** 최대 상품 가격 (원) - 1억 */
  MAX: 100_000_000,
} as const;

/**
 * 비밀번호 규칙
 */
export const PASSWORD = {
  /** 최소 길이 */
  MIN_LENGTH: 8,
} as const;

/**
 * 인증코드 설정
 */
export const VERIFICATION_CODE = {
  /** 코드 길이 */
  LENGTH: 6,
  /** 코드 최소값 */
  MIN_VALUE: 100000,
  /** 코드 범위 (MIN_VALUE + RANGE = 최대값) */
  RANGE: 900000,
  /** 만료 시간 (분) - 환경변수로 오버라이드 가능 */
  DEFAULT_EXPIRY_MINUTES: 10,
} as const;

/**
 * 결제 키 길이 제한
 */
export const PAYMENT_KEY = {
  /** paymentKey 최대 길이 */
  MAX_LENGTH: 200,
} as const;

/**
 * 주문 ID 길이 제한
 */
export const ORDER_ID = {
  /** 최소 길이 */
  MIN_LENGTH: 6,
  /** 최대 길이 */
  MAX_LENGTH: 64,
} as const;

/**
 * 문의 제목 길이 제한
 */
export const INQUIRY = {
  /** 제목 최대 길이 */
  TITLE_MAX_LENGTH: 200,
} as const;

/**
 * 6자리 인증코드 생성
 */
export function generateVerificationCode(): string {
  return Math.floor(
    VERIFICATION_CODE.MIN_VALUE + Math.random() * VERIFICATION_CODE.RANGE
  ).toString();
}
