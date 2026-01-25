// server/constants.ts
// 백엔드에서 사용하는 상수 re-export
// 모든 상수는 shared/constants/에서 관리

export {
  // 배송비
  SHIPPING,
  calculateShippingFee,
  // 주문
  ORDER_STATUS,
  ORDER_STATUS_ENUM,
  NON_CANCELABLE_STATUSES,
  ORDER_ID_CONFIG,
  generateExternalOrderId,
  isCancelable,
  // 결제
  PAYMENT_PROVIDER,
  TOSS_PAYMENT_STATUS,
  NAVERPAY_PAYMENT_STATUS,
  NAVERPAY_CONFIG,
  KAKAOPAY_PAYMENT_STATUS,
  KAKAOPAY_CONFIG,
  mapNaverpayStatusToOrderStatus,
  mapTossStatusToOrderStatus,
  mapKakaopayStatusToOrderStatus,
  // 검증
  QUANTITY,
  PRICE,
  PASSWORD,
  VERIFICATION_CODE,
  PAYMENT_KEY,
  ORDER_ID,
  INQUIRY,
  generateVerificationCode,
  // DB
  DB_FIELD_LENGTH,
  DB_POOL,
  DB_TIMEOUT,
  // 보안
  SESSION,
  USER_CACHE,
  RATE_LIMIT,
  HSTS,
  // 메시지
  AUTH_MESSAGES,
  ORDER_MESSAGES,
  PAYMENT_MESSAGES,
  RATE_LIMIT_MESSAGES,
  VALIDATION_MESSAGES,
  SUCCESS_MESSAGES,
  SEARCH_MESSAGES,
  PRODUCT_MESSAGES,
  COMMON_MESSAGES,
  // 재고 선점
  STOCK_MESSAGES,
  // 로거
  LogLevel,
  LOG_LEVEL_MAP,
  LOG_LEVEL_NAMES,
  LOG_COLORS,
  LOG_LEVEL_COLORS,
  LOGGER_DEFAULTS,
  SENSITIVE_KEYS,
  LOGGER_ENV_KEYS,
  type LogLevelString,
} from "@shared/constants";
