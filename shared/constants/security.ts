// shared/constants/security.ts
// 보안 관련 상수

/**
 * 세션 설정
 */
export const SESSION = {
  /** 세션 TTL (1주일, 밀리초) */
  TTL: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * 사용자 캐시 설정
 */
export const USER_CACHE = {
  /** 캐시 TTL (5분, 밀리초) */
  TTL: 5 * 60 * 1000,
} as const;

/**
 * Rate Limit 기본 설정
 * 환경변수로 오버라이드 가능
 */
export const RATE_LIMIT = {
  /** 전역 Rate Limit */
  GLOBAL: {
    /** 윈도우 시간 (15분, 밀리초) */
    WINDOW_MS: 15 * 60 * 1000,
    /** 최대 요청 수 */
    MAX_REQUESTS: 500,
  },
  /** 인증 Rate Limit (Brute Force 방지) */
  AUTH: {
    /** 윈도우 시간 (15분, 밀리초) */
    WINDOW_MS: 15 * 60 * 1000,
    /** 최대 요청 수 */
    MAX_REQUESTS: 10,
  },
  /** API Rate Limit */
  API: {
    /** 윈도우 시간 (1분, 밀리초) */
    WINDOW_MS: 1 * 60 * 1000,
    /** 최대 요청 수 */
    MAX_REQUESTS: 100,
  },
  /** 결제 Rate Limit (매우 엄격) */
  PAYMENT: {
    /** 윈도우 시간 (1분, 밀리초) */
    WINDOW_MS: 1 * 60 * 1000,
    /** 최대 요청 수 */
    MAX_REQUESTS: 5,
  },
  /** 관리자 Rate Limit (높은 제한) */
  ADMIN: {
    /** 윈도우 시간 (5분, 밀리초) */
    WINDOW_MS: 5 * 60 * 1000,
    /** 최대 요청 수 */
    MAX_REQUESTS: 300,
  },
} as const;

/**
 * HSTS 설정
 */
export const HSTS = {
  /** maxAge (1년, 초) */
  MAX_AGE: 31536000,
} as const;

/**
 * 슈퍼 관리자 설정
 * 슈퍼 관리자만 다른 사용자에게 관리자 권한 부여/해제 가능
 */
export const SUPER_ADMIN = {
  /** 슈퍼 관리자 이메일 */
  EMAIL: "admin@shakishakiarchive.com",
} as const;
