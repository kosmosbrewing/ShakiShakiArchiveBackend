// shared/constants/messages.ts
// 에러 메시지 및 검증 메시지 상수

/**
 * 인증 관련 에러 메시지
 */
export const AUTH_MESSAGES = {
  REQUIRED: "인증이 필요합니다",
  ADMIN_REQUIRED: "관리자 권한이 필요합니다",
  FORBIDDEN: "권한이 없습니다",
  INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다",
  EMAIL_EXISTS: "이미 사용 중인 이메일입니다",
  USER_NOT_FOUND: "사용자를 찾을 수 없습니다",
  SERVER_ERROR: "서버 오류가 발생했습니다",
} as const;

/**
 * 주문 관련 에러 메시지
 */
export const ORDER_MESSAGES = {
  NOT_FOUND: "주문을 찾을 수 없습니다",
  CART_EMPTY: "장바구니가 비어있습니다",
  PRODUCT_NOT_FOUND: "상품을 찾을 수 없습니다",
  VARIANT_NOT_FOUND: "상품 옵션을 찾을 수 없습니다",
  CANNOT_CANCEL: (status: string) =>
    `현재 상태(${status})에서는 취소할 수 없습니다`,
  CANCEL_SUCCESS: "주문이 취소되었습니다",
  NO_PAYMENT_INFO: "결제 정보가 없어 취소할 수 없습니다",
  DEFAULT_CANCEL_REASON: "고객 요청에 의한 취소",
} as const;

/**
 * 결제 관련 에러 메시지
 */
export const PAYMENT_MESSAGES = {
  AMOUNT_MISMATCH: "결제 금액이 일치하지 않습니다",
  FAILED: "결제에 실패했습니다",
  CANCEL_FAILED: "결제 취소에 실패했습니다",
} as const;

/**
 * Rate Limit 에러 메시지
 */
export const RATE_LIMIT_MESSAGES = {
  GLOBAL: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  AUTH: "인증 요청이 너무 많습니다. 15분 후 다시 시도해주세요.",
  API: "API 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  PAYMENT: "결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
} as const;

/**
 * 입력 검증 메시지
 */
export const VALIDATION_MESSAGES = {
  EMAIL_INVALID: "유효한 이메일 주소를 입력해주세요",
  PASSWORD_MIN_LENGTH: "비밀번호는 최소 8자 이상이어야 합니다",
  PASSWORD_REQUIRED: "비밀번호를 입력해주세요",
  NAME_REQUIRED: "이름을 입력해주세요",
  RECIPIENT_REQUIRED: "수령인을 입력해주세요",
  PHONE_REQUIRED: "연락처를 입력해주세요",
  ZIP_CODE_REQUIRED: "우편번호를 입력해주세요",
  ADDRESS_REQUIRED: "주소를 입력해주세요",
  QUANTITY_MIN: "최소 1개 이상",
  QUANTITY_MAX: "최대 99개까지",
  PRODUCT_ID_INVALID: "유효한 상품 ID가 아닙니다",
  VARIANT_ID_INVALID: "유효한 옵션 ID가 아닙니다",
  PAYMENT_KEY_MAX: "paymentKey는 최대 200자입니다",
  ORDER_ID_LENGTH: "orderId는 6-64자입니다",
  AMOUNT_POSITIVE: "결제 금액은 양수여야 합니다",
  CANCEL_REASON_REQUIRED: "취소 사유를 입력해주세요",
  VERIFICATION_CODE_LENGTH: "인증코드는 6자리입니다",
  IMAGE_URL_INVALID: "유효한 이미지 URL을 입력해주세요",
  LINK_URL_INVALID: "유효한 링크 URL을 입력해주세요",
  TITLE_REQUIRED: "제목을 입력해주세요",
  TITLE_MAX_LENGTH: "제목은 최대 200자입니다",
  CONTENT_REQUIRED: "내용을 입력해주세요",
  REPLY_CONTENT_REQUIRED: "답변 내용을 입력해주세요",
} as const;
