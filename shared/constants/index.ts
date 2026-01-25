// shared/constants/index.ts
// 상수 통합 export

// 배송비 관련
export { SHIPPING, calculateShippingFee } from "./shipping";

// 주문 관련
export {
  ORDER_STATUS,
  ORDER_STATUS_ENUM,
  NON_CANCELABLE_STATUSES,
  ORDER_ID_CONFIG,
  generateExternalOrderId,
  isCancelable,
  type OrderStatusType,
} from "./order";

// 결제 관련
export {
  PAYMENT_PROVIDER,
  TOSS_PAYMENT_STATUS,
  NAVERPAY_PAYMENT_STATUS,
  NAVERPAY_CONFIG,
  KAKAOPAY_PAYMENT_STATUS,
  KAKAOPAY_CONFIG,
  mapNaverpayStatusToOrderStatus,
  mapTossStatusToOrderStatus,
  mapKakaopayStatusToOrderStatus,
  type PaymentProviderType,
  type TossPaymentStatusType,
  type NaverpayPaymentStatusType,
  type KakaopayPaymentStatusType,
} from "./payment";

// 검증 관련
export {
  QUANTITY,
  PRICE,
  PASSWORD,
  VERIFICATION_CODE,
  PAYMENT_KEY,
  ORDER_ID,
  INQUIRY,
  generateVerificationCode,
} from "./validation";

// 데이터베이스 관련
export { DB_FIELD_LENGTH, DB_POOL, DB_TIMEOUT } from "./database";

// 보안 관련
export { SESSION, USER_CACHE, RATE_LIMIT, HSTS } from "./security";

// 메시지 관련
export {
  AUTH_MESSAGES,
  ORDER_MESSAGES,
  PAYMENT_MESSAGES,
  RATE_LIMIT_MESSAGES,
  VALIDATION_MESSAGES,
  CART_MESSAGES,
  PRODUCT_MESSAGES,
  INQUIRY_MESSAGES,
  ADDRESS_MESSAGES,
  WISHLIST_MESSAGES,
  CATEGORY_MESSAGES,
  IMAGE_MESSAGES,
  COMMON_MESSAGES,
  SUCCESS_MESSAGES,
  SEARCH_MESSAGES,
} from "./messages";

// 재고 선점 관련
export { STOCK_MESSAGES } from "./stock";

// 로거 관련
export {
  LogLevel,
  LOG_LEVEL_MAP,
  LOG_LEVEL_NAMES,
  LOG_COLORS,
  LOG_LEVEL_COLORS,
  LOGGER_DEFAULTS,
  SENSITIVE_KEYS,
  LOGGER_ENV_KEYS,
  type LogLevelString,
} from "./logger";
