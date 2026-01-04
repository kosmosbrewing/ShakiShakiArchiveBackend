// shared/constants/database.ts
// 데이터베이스 관련 상수

/**
 * DB 필드 길이 제한
 * 스키마 정의 시 참조
 */
export const DB_FIELD_LENGTH = {
  // 사용자 관련
  PASSWORD_HASH: 255,
  USER_NAME: 100,
  ZIP_CODE: 20,
  ADDRESS: 255,
  PHONE: 20,
  NAVER_ID: 100,
  SOCIAL_PROVIDER: 20,

  // 상품 관련
  PRODUCT_NAME: 255,
  PRODUCT_SLUG: 255,
  CATEGORY_NAME: 100,
  CATEGORY_SLUG: 100,
  VARIANT_SIZE: 50,
  VARIANT_COLOR: 50,
  VARIANT_SKU: 100,

  // 주문 관련
  STATUS: 50,
  TRACKING_NUMBER: 100,
  SHIPPING_NAME: 100,
  SHIPPING_REQUEST_NOTE: 255,

  // 결제 관련
  PAYMENT_KEY: 200,
  EXTERNAL_ORDER_ID: 64,
  PAYMENT_PROVIDER: 50,
  PAYMENT_METHOD: 50,

  // 인증 관련
  VERIFICATION_CODE: 6,
  VERIFICATION_TYPE: 20,

  // 사이트 이미지
  SITE_IMAGE_TYPE: 20,
  SITE_IMAGE_URL: 500,

  // 문의
  INQUIRY_TYPE: 20,
  INQUIRY_STATUS: 20,
  INQUIRY_TITLE: 200,
} as const;

/**
 * DB 연결 풀 기본 설정
 */
export const DB_POOL = {
  /** 프로덕션 환경 최대 연결 수 */
  MAX_PROD: 20,
  /** 개발 환경 최대 연결 수 */
  MAX_DEV: 10,
  /** 최소 연결 수 */
  MIN: 2,
} as const;

/**
 * DB 타임아웃 설정 (밀리초)
 */
export const DB_TIMEOUT = {
  /** 유휴 연결 타임아웃 (30초) */
  IDLE: 30000,
  /** 연결 시도 타임아웃 (10초) */
  CONNECTION: 10000,
} as const;
