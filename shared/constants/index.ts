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
  mapNaverpayStatusToOrderStatus,
  mapTossStatusToOrderStatus,
  type PaymentProviderType,
  type TossPaymentStatusType,
  type NaverpayPaymentStatusType,
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
} from "./messages";

// 재고 선점 관련
export { STOCK_RESERVATION, STOCK_MESSAGES } from "./stock";
