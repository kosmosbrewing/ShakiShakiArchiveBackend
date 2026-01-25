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
  EMAIL_NOT_VERIFIED: "이메일 인증이 완료되지 않았습니다",
  SOCIAL_LOGIN_ACCOUNT: "소셜 로그인으로 가입한 계정입니다. 해당 소셜 서비스로 로그인해주세요.",
  SOCIAL_NO_PASSWORD: "소셜 로그인으로 가입한 계정은 비밀번호가 없습니다",
  SOCIAL_PASSWORD_CHANGE_FORBIDDEN: "소셜 로그인으로 가입한 계정은 비밀번호를 변경할 수 없습니다",
  SOCIAL_PASSWORD_RESET_FORBIDDEN: "소셜 로그인으로 가입한 계정은 비밀번호를 재설정할 수 없습니다",
  CURRENT_PASSWORD_MISMATCH: "현재 비밀번호가 일치하지 않습니다",
  SAME_PASSWORD: "새 비밀번호는 현재 비밀번호와 달라야 합니다",
  SAME_PASSWORD_RESET: "새 비밀번호는 이전 비밀번호와 달라야 합니다",
  VERIFICATION_INVALID: "인증코드가 유효하지 않거나 만료되었습니다",
  EMAIL_SEND_FAILED: "이메일 발송에 실패했습니다",
  LOGOUT_ERROR: "로그아웃 중 오류가 발생했습니다",
  PASSWORD_REQUIRED: "비밀번호를 입력해주세요",
  EMAIL_REQUIRED: "이메일을 입력해주세요",
  NAVER_LOGIN_NOT_CONFIGURED: "네이버 로그인이 설정되지 않았습니다",
  KAKAO_LOGIN_NOT_CONFIGURED: "카카오 로그인이 설정되지 않았습니다",
} as const;

/**
 * 주문 관련 에러 메시지
 */
export const ORDER_MESSAGES = {
  NOT_FOUND: "주문을 찾을 수 없습니다",
  NOT_EXISTS: "주문이 존재하지 않습니다",
  ITEM_NOT_FOUND: "주문 항목을 찾을 수 없습니다",
  CART_EMPTY: "장바구니가 비어있습니다",
  PRODUCT_NOT_FOUND: "상품을 찾을 수 없습니다",
  VARIANT_NOT_FOUND: "상품 옵션을 찾을 수 없습니다",
  CANNOT_CANCEL: (status: string) =>
    `현재 상태(${status})에서는 취소할 수 없습니다`,
  CANCEL_SUCCESS: "주문이 취소되었습니다",
  NO_PAYMENT_INFO: "결제 정보가 없어 취소할 수 없습니다",
  DEFAULT_CANCEL_REASON: "고객 요청에 의한 취소",
  CLEANUP_FAILED: "cleanup 실패, Cron이 처리합니다",
  PRICE_ERROR_CHECK_CART: "일부 상품의 가격 오류가 발생했습니다. 장바구니를 다시 확인해주세요.",
  AMOUNT_INVALID: "주문 금액이 올바르지 않습니다",
  CANNOT_CHANGE_TO_PAYING: "결제 진행 상태로 변경할 수 없습니다.",
  STATUS_ALREADY_CHANGED: "주문 상태가 이미 변경되었습니다.",
  CHANGED_TO_PAYING: "결제 진행 상태로 변경되었습니다.",
  PAYMENT_PROTECTED: "결제창이 열려 있어 보호합니다",
  PAYMENT_IN_PROGRESS: "결제 진행 중입니다. 결제를 완료해주세요.",
  STOCK_RESTORE_STARTED: "결제창 열기 전 이탈 - 재고 복구 시작",
  CANCEL_ERROR: "주문 취소 중 오류가 발생했습니다.",
  NO_PARTIAL_CANCEL: "부분 취소는 지원하지 않습니다. 전체 환불만 가능합니다.",
  DELETE_DISABLED: "주문 삭제 기능이 비활성화되었습니다. 주문 취소를 이용해주세요.",
  STATUS_CHANGED_CANNOT_DELETE: "주문 상태가 변경되어 삭제할 수 없습니다.",
  DELETED: "주문이 삭제되었습니다.",
} as const;

/**
 * 결제 관련 에러 메시지
 */
export const PAYMENT_MESSAGES = {
  AMOUNT_MISMATCH: "결제 금액이 일치하지 않습니다",
  FAILED: "결제에 실패했습니다",
  CANCEL_FAILED: "결제 취소에 실패했습니다",
  SERVICE_DISABLED: "결제 서비스가 비활성화되어 있습니다",
  INVALID_REQUEST: "잘못된 요청 데이터입니다",
  ORDER_CANCELLED: "취소된 주문입니다. 새로운 주문을 생성해주세요.",
  ALREADY_PAID: "이미 결제가 완료된 주문입니다.",
  INVALID_ORDER_STATUS: "결제할 수 없는 주문 상태입니다.",
  OUT_OF_STOCK: "재고가 부족합니다",
  SUCCESS: "결제가 완료되었습니다",
  CANCEL_SUCCESS: "결제가 취소되었습니다",
  NAVERPAY_NO_PARTIAL: "네이버페이는 부분 취소를 지원하지 않습니다. 전체 환불만 가능합니다.",
  NAVERPAY_DISABLED: "네이버페이 서비스가 비활성화되어 있습니다",
  NAVERPAY_NO_PAYMENT_INFO: "네이버페이 결제 정보가 없습니다",
} as const;

/**
 * Rate Limit 에러 메시지
 */
export const RATE_LIMIT_MESSAGES = {
  GLOBAL: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  AUTH: "인증 요청이 너무 많습니다. 15분 후 다시 시도해주세요.",
  API: "API 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  PAYMENT: "결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  ADMIN: "관리자 API 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
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
  VARIANT_ID_FORMAT_INVALID: "유효하지 않은 variant ID 형식입니다",
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
  SEARCH_QUERY_REQUIRED: "검색어(q)가 필요합니다",
  INVALID_REQUEST_PARAMS: "잘못된 요청 파라미터입니다.",
} as const;

/**
 * 장바구니 관련 메시지
 */
export const CART_MESSAGES = {
  ITEM_NOT_FOUND: "장바구니 항목을 찾을 수 없습니다",
  ITEM_DELETED: "장바구니에서 삭제되었습니다",
  INVALID_QUANTITY: "유효하지 않은 수량입니다",
} as const;

/**
 * 상품 관련 메시지
 */
export const PRODUCT_MESSAGES = {
  NOT_FOUND: "상품을 찾을 수 없습니다",
  NOT_AVAILABLE: "현재 판매하지 않는 상품입니다",
  INVALID_PRICE: "상품 가격 오류가 발생했습니다",
  VARIANT_NOT_FOUND: "상품 옵션을 찾을 수 없습니다",
  VARIANT_NOT_AVAILABLE: "선택하신 옵션은 현재 판매하지 않습니다",
  VARIANT_DELETED: "상품 옵션이 삭제되었습니다",
  DELETED: "상품이 삭제되었습니다",
  MEASUREMENT_NOT_FOUND: "실측 정보를 찾을 수 없습니다",
  MEASUREMENT_DELETED: "실측 정보가 삭제되었습니다",
} as const;

/**
 * 문의 관련 메시지
 */
export const INQUIRY_MESSAGES = {
  NOT_FOUND: "문의를 찾을 수 없습니다",
  REPLY_NOT_FOUND: "답변을 찾을 수 없습니다",
  INVALID_ID: "잘못된 문의 ID 형식입니다",
  INVALID_REPLY_ID: "유효한 답변 ID가 필요합니다",
  INVALID_STATUS: "유효한 상태값을 입력해주세요",
  PRIVATE_ACCESS_DENIED: "비밀글은 작성자만 조회할 수 있습니다",
  DELETE_FORBIDDEN: "본인의 문의만 삭제할 수 있습니다",
  REPLY_MISMATCH: "해당 답변은 이 문의에 속하지 않습니다",
  DELETED: "문의가 삭제되었습니다",
  REPLY_DELETED: "답변이 삭제되었습니다",
  INVALID_INPUT: "입력값이 올바르지 않습니다",
  INVALID_PARAMS: "잘못된 요청 파라미터입니다.",
} as const;

/**
 * 배송지 관련 메시지
 */
export const ADDRESS_MESSAGES = {
  NOT_FOUND: "배송지를 찾을 수 없습니다",
  DELETED: "배송지가 삭제되었습니다",
} as const;

/**
 * 위시리스트 관련 메시지
 */
export const WISHLIST_MESSAGES = {
  PRODUCT_ID_REQUIRED: "상품 ID가 필요합니다",
  REMOVED: "위시리스트에서 삭제되었습니다",
} as const;

/**
 * 카테고리 관련 메시지
 */
export const CATEGORY_MESSAGES = {
  NOT_FOUND: "카테고리를 찾을 수 없습니다",
  DELETED: "카테고리가 삭제되었습니다",
} as const;

/**
 * 이미지 업로드 관련 메시지
 */
export const IMAGE_MESSAGES = {
  SERVICE_NOT_CONFIGURED: "이미지 업로드 서비스가 설정되지 않았습니다.",
  FILE_REQUIRED: "이미지 파일이 필요합니다.",
  NOT_FOUND: "이미지를 찾을 수 없습니다.",
  INVALID_ID: "유효하지 않은 이미지 ID입니다.",
  INVALID_TYPE: "유효하지 않은 이미지 타입입니다.",
  INVALID_SITE_IMAGE_TYPE: "유효하지 않은 이미지 타입입니다. (hero 또는 marquee)",
  DELETED: "이미지가 삭제되었습니다.",
  UPDATED: "이미지가 수정되었습니다.",
  ADDED: "이미지가 추가되었습니다.",
  UPLOAD_SUCCESS: "이미지 업로드 성공",
  DELETE_SUCCESS: "이미지 삭제 성공",
  ORDER_CHANGED: "이미지 순서가 변경되었습니다.",
  INVALID_INPUT: "입력값이 유효하지 않습니다.",
} as const;

/**
 * 공통 에러 메시지
 */
export const COMMON_MESSAGES = {
  FORBIDDEN: "권한이 없습니다",
  NOT_FOUND: "리소스를 찾을 수 없습니다",
  INVALID_ID: "유효하지 않은 ID 형식입니다",
  SERVER_ERROR: "서버 오류가 발생했습니다",
  INVALID_STATUS_TRANSITION: "현재 상태에서는 변경할 수 없습니다",
} as const;

/**
 * 성공 메시지
 */
export const SUCCESS_MESSAGES = {
  LOGOUT: "로그아웃되었습니다",
  PASSWORD_CHANGED: "비밀번호가 변경되었습니다",
  PASSWORD_RESET: "비밀번호가 재설정되었습니다",
  INFO_UPDATED: "정보가 수정되었습니다",
  EMAIL_SENT: "인증코드가 발송되었습니다",
  EMAIL_VERIFIED: "이메일이 인증되었습니다",
  STOCK_RESTORED: "재고 복구 완료",
  REINDEX_STARTED: "재인덱싱이 시작되었습니다",
} as const;

/**
 * 검색 관련 메시지
 */
export const SEARCH_MESSAGES = {
  KAKAO_API_NOT_CONFIGURED: "카카오 API 키가 설정되지 않았습니다",
  ADDRESS_SEARCH_FAILED: "주소 검색에 실패했습니다",
  PLACE_SEARCH_FAILED: "장소 검색에 실패했습니다",
  MEILISEARCH_DISABLED: "Meilisearch가 비활성화되어 있습니다",
} as const;
