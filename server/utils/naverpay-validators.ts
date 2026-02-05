// server/utils/naverpay-validators.ts
// 네이버페이 입력값 검증 유틸리티
// 참고: 네이버페이 가맹점 연동 가이드 v2.1 - 10장 입력값 제약 조건

/**
 * 네이버페이 입력값 최대 길이 제약 조건
 */
export const NAVERPAY_LIMITS = {
  // 상품 정보
  PRODUCT_ID: 30,              // product/id
  MERCHANT_PRODUCT_ID: 100,    // product/merchantProductId
  PRODUCT_NAME: 100,           // product/name
  GIFT_NAME: 200,              // product/giftName

  // 옵션 정보 (주문등록: selectedItem)
  OPTION_NAME: 20,             // option/selectedItem/name (⚠️ 20자 제한!)
  OPTION_VALUE_ID: 50,         // option/selectedItem/value/id
  OPTION_VALUE_TEXT: 50,       // option/selectedItem/value/text
  MANAGE_CODE: 100,            // option/manageCode

  // 추가상품
  SUPPLEMENT_ID: 50,           // supplement/id
  SUPPLEMENT_NAME: 50,         // supplement/name

  // 인터페이스
  SALES_CODE: 300,             // interface/salesCode
  MERCHANT_CUSTOM_CODE: 300,   // merchantCustomCode1, merchantCustomCode2 (UTF8 바이트)

  // 금액 범위
  FEE_PRICE_MAX: 200000,       // feePrice 최대값
  BASE_PRICE_MIN: 1,           // basePrice 최소값
} as const;

/**
 * 네이버페이 ID 허용 문자 패턴
 * - 영문, 숫자, 특수문자(! + - / = _ |)
 * - 공백 불가
 */
export const NAVERPAY_ID_PATTERN = /^[a-zA-Z0-9!+\-\/=_|]+$/;

/**
 * ID 유효성 검증 결과
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  value?: string; // 변환된 값 (truncate 등)
}

/**
 * 상품 ID 검증 (30자 제한, 허용 문자만)
 * @param id 검증할 상품 ID
 * @returns 검증 결과
 */
export function validateProductId(id: string): ValidationResult {
  if (!id) {
    return { valid: false, error: "상품 ID가 비어있습니다" };
  }

  if (id.length > NAVERPAY_LIMITS.PRODUCT_ID) {
    return {
      valid: false,
      error: `상품 ID가 ${NAVERPAY_LIMITS.PRODUCT_ID}자를 초과합니다 (${id.length}자)`
    };
  }

  if (!NAVERPAY_ID_PATTERN.test(id)) {
    return {
      valid: false,
      error: "상품 ID에 허용되지 않는 문자가 포함되어 있습니다 (영문, 숫자, !+-/=_| 만 허용)"
    };
  }

  return { valid: true, value: id };
}

/**
 * 옵션 관리 코드 검증 (100자 제한, 허용 문자만)
 * @param code 검증할 관리 코드
 * @returns 검증 결과
 */
export function validateManageCode(code: string): ValidationResult {
  if (!code) {
    return { valid: false, error: "옵션 관리 코드가 비어있습니다" };
  }

  if (code.length > NAVERPAY_LIMITS.MANAGE_CODE) {
    return {
      valid: false,
      error: `옵션 관리 코드가 ${NAVERPAY_LIMITS.MANAGE_CODE}자를 초과합니다 (${code.length}자)`
    };
  }

  if (!NAVERPAY_ID_PATTERN.test(code)) {
    return {
      valid: false,
      error: "옵션 관리 코드에 허용되지 않는 문자가 포함되어 있습니다"
    };
  }

  return { valid: true, value: code };
}

/**
 * 옵션명 검증 (20자 제한)
 * @param name 옵션명
 * @returns 검증 결과
 */
export function validateOptionName(name: string): ValidationResult {
  if (!name) {
    return { valid: false, error: "옵션명이 비어있습니다" };
  }

  if (name.length > NAVERPAY_LIMITS.OPTION_NAME) {
    return {
      valid: false,
      error: `옵션명이 ${NAVERPAY_LIMITS.OPTION_NAME}자를 초과합니다 (${name.length}자)`
    };
  }

  return { valid: true, value: name };
}

/**
 * 텍스트를 최대 길이로 자르기 (truncate)
 * @param str 원본 문자열
 * @param maxLength 최대 길이
 * @returns 잘린 문자열
 */
export function truncateText(str: string, maxLength: number): string {
  if (!str) return "";
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength);
}

/**
 * 옵션명 안전하게 변환 (20자 제한 적용)
 * @param name 원본 옵션명
 * @returns 20자 이내로 잘린 옵션명
 */
export function safeOptionName(name: string): string {
  return truncateText(name, NAVERPAY_LIMITS.OPTION_NAME);
}

/**
 * 옵션 값 텍스트 안전하게 변환 (50자 제한 적용)
 * @param text 원본 텍스트
 * @returns 50자 이내로 잘린 텍스트
 */
export function safeOptionValueText(text: string): string {
  return truncateText(text, NAVERPAY_LIMITS.OPTION_VALUE_TEXT);
}

/**
 * 옵션 값 ID 안전하게 변환 (50자 제한 + 허용 문자만)
 * @param id 원본 ID
 * @returns 정제된 ID
 */
export function safeOptionValueId(id: string): string {
  if (!id) return "";
  // 허용되지 않는 문자 제거
  let safeId = id.replace(/[^a-zA-Z0-9!+\-\/=_|]/g, "");
  return truncateText(safeId, NAVERPAY_LIMITS.OPTION_VALUE_ID);
}

/**
 * 상품명 안전하게 변환 (100자 제한 적용)
 * @param name 원본 상품명
 * @returns 100자 이내로 잘린 상품명
 */
export function safeProductName(name: string): string {
  return truncateText(name, NAVERPAY_LIMITS.PRODUCT_NAME);
}

/**
 * 관리 코드 안전하게 변환 (100자 제한 + 허용 문자만)
 * @param code 원본 관리 코드
 * @returns 정제된 관리 코드
 */
export function safeManageCode(code: string): string {
  if (!code) return "";
  // 허용되지 않는 문자를 언더스코어로 대체
  let safeCode = code.replace(/[^a-zA-Z0-9!+\-\/=_|]/g, "_");
  return truncateText(safeCode, NAVERPAY_LIMITS.MANAGE_CODE);
}

/**
 * 옵션 가격 검증 (basePrice의 -50% 이상)
 * @param optionPrice 옵션 추가 금액
 * @param basePrice 상품 기본 가격
 * @returns 검증 결과
 */
export function validateOptionPrice(optionPrice: number, basePrice: number): ValidationResult {
  const minPrice = -(basePrice * 0.5);

  if (optionPrice < minPrice) {
    return {
      valid: false,
      error: `옵션 가격이 최소값(${minPrice}원)보다 작습니다`,
    };
  }

  return { valid: true };
}

/**
 * 배송비 검증 (0~200,000)
 * @param feePrice 배송비
 * @param allowZero 0 허용 여부 (무료배송, 착불일 때)
 * @returns 검증 결과
 */
export function validateFeePrice(feePrice: number, allowZero: boolean = false): ValidationResult {
  if (feePrice < 0) {
    return { valid: false, error: "배송비는 0 이상이어야 합니다" };
  }

  if (!allowZero && feePrice === 0) {
    return { valid: false, error: "배송비가 0입니다 (무료배송 또는 착불이 아닌 경우)" };
  }

  if (feePrice > NAVERPAY_LIMITS.FEE_PRICE_MAX) {
    return {
      valid: false,
      error: `배송비가 ${NAVERPAY_LIMITS.FEE_PRICE_MAX}원을 초과합니다`
    };
  }

  return { valid: true };
}

/**
 * 기본가격 검증 (1 이상)
 * @param basePrice 기본 가격
 * @returns 검증 결과
 */
export function validateBasePrice(basePrice: number): ValidationResult {
  if (basePrice < NAVERPAY_LIMITS.BASE_PRICE_MIN) {
    return {
      valid: false,
      error: `기본가격은 ${NAVERPAY_LIMITS.BASE_PRICE_MIN}원 이상이어야 합니다`
    };
  }

  return { valid: true };
}

/**
 * base64url 디코딩 (address1 파라미터용)
 * 네이버페이는 주소를 UTF-8 → base64url 인코딩해서 전달
 * @param encoded base64url 인코딩된 문자열
 * @returns 디코딩된 UTF-8 문자열
 */
export function decodeBase64Url(encoded: string): string {
  if (!encoded) return "";

  try {
    // base64url → base64 변환 (- → +, _ → /)
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");

    // 패딩 추가 (필요한 경우)
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

    // base64 → UTF-8 디코딩
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch (error) {
    // 디코딩 실패 시 원본 반환
    return encoded;
  }
}
