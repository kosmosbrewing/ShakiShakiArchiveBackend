// shared/constants/logger.ts
// 로거 관련 상수

/**
 * 로그 레벨 정의
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 로그 레벨 문자열 타입
 */
export type LogLevelString = "debug" | "info" | "warn" | "error";

/**
 * 로그 레벨 문자열 매핑
 */
export const LOG_LEVEL_MAP: Record<LogLevelString, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
} as const;

/**
 * 로그 레벨 이름
 */
export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
} as const;

/**
 * 로그 컬러 코드 (터미널 ANSI 코드)
 */
export const LOG_COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

/**
 * 로그 레벨별 컬러
 */
export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: LOG_COLORS.gray,
  [LogLevel.INFO]: LOG_COLORS.cyan,
  [LogLevel.WARN]: LOG_COLORS.yellow,
  [LogLevel.ERROR]: LOG_COLORS.red,
} as const;

/**
 * 로그 설정 기본값
 */
export const LOGGER_DEFAULTS = {
  /** 프로덕션 환경 기본 로그 레벨 */
  PROD_LOG_LEVEL: LogLevel.ERROR,
  /** 개발 환경 기본 로그 레벨 */
  DEV_LOG_LEVEL: LogLevel.INFO,
  /** 프로덕션 환경 색상 사용 여부 */
  PROD_USE_COLOR: false,
  /** 개발 환경 색상 사용 여부 */
  DEV_USE_COLOR: true,
  /** 프로덕션 환경 Pretty Print 사용 여부 */
  PROD_USE_PRETTY: false,
  /** 개발 환경 Pretty Print 사용 여부 */
  DEV_USE_PRETTY: true,
} as const;

/**
 * 민감 정보 마스킹 대상 키워드
 */
export const SENSITIVE_KEYS = [
  // 인증 관련
  "password",
  "passwordHash",
  "token",
  "secret",
  "authorization",
  "cookie",
  "sessionId",
  // 금융/결제 관련
  "pin",
  "creditcard",
  "cardnumber",
  "cvv",
  "cvc",
  // API 키
  "apikey",
  "accesskey",
  "privatekey",
] as const;

/**
 * 로거 환경변수 키
 */
export const LOGGER_ENV_KEYS = {
  /** 로그 레벨 */
  LOG_LEVEL: "LOG_LEVEL",
  /** 색상 사용 여부 */
  LOG_COLOR: "LOG_COLOR",
  /** Pretty Print 사용 여부 */
  LOG_PRETTY: "LOG_PRETTY",
} as const;
