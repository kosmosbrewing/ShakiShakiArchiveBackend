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
  mapNaverpayStatusToOrderStatus,
  mapTossStatusToOrderStatus,
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
  // 재고 선점
  STOCK_RESERVATION,
  STOCK_MESSAGES,
} from "@shared/constants";
