// server/constants.ts
// 백엔드에서 사용하는 상수 re-export
// 모든 상수는 shared/constants/에서 관리

export {
  // 배송비
  SHIPPING,
  calculateShippingFee,
  isRemoteArea,
  // 반품지 정보
  RETURN_INFO,
  RETURN_SHIPPING_FEE,
  // 환불 계산
  calculateRefund,
  formatRefundSummary,
  type RefundCalculationInput,
  type RefundCalculationResult,
  // 주문
  ORDER_STATUS,
  ORDER_STATUS_ENUM,
  NON_CANCELABLE_STATUSES,
  ORDER_ID_CONFIG,
  generateExternalOrderId,
  isCancelable,
  // 주문 아이템 상태
  ORDER_ITEM_STATUS,
  PRE_SHIPPING_STATUSES,
  POST_SHIPPING_STATUSES,
  // 반품 관련
  SELLER_FAULT_REASONS,
  RETURN_REASON_TYPES,
  RETURN_STATUS,
  type OrderItemStatusType,
  type SellerFaultReasonType,
  type ReturnReasonType,
  type ReturnStatusType,
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
  SUPER_ADMIN,
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
  // 스케줄러
  AUTO_CONFIRM_SCHEDULER,
  ORDER_CLEANUP_SCHEDULER,
  STOCK_RESERVATION_CLEANUP_SCHEDULER,
  SCHEDULER_TIMEZONE,
} from "@shared/constants";
