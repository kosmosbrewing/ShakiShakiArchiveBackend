// server/utils/logger.ts
// 프로덕션: JSON 형식 + ERROR 레벨 기본 + 색상 없음
// 개발: 컬러 텍스트 + DEBUG 레벨 기본 + Pretty Print

import { config } from "../config";
import {
  LogLevel,
  LOG_LEVEL_MAP,
  LOG_LEVEL_NAMES,
  LOG_COLORS,
  LOG_LEVEL_COLORS,
  LOGGER_DEFAULTS,
  SENSITIVE_KEYS,
  LOGGER_ENV_KEYS,
  type LogLevelString,
} from "../constants";

// 환경변수에서 로그 레벨 파싱
function getLogLevel(): LogLevel {
  const envLevel = process.env[LOGGER_ENV_KEYS.LOG_LEVEL]?.toLowerCase() as
    | LogLevelString
    | undefined;
  if (envLevel && envLevel in LOG_LEVEL_MAP) {
    return LOG_LEVEL_MAP[envLevel];
  }
  // 프로덕션: ERROR만, 개발: DEBUG부터
  return config.isProd ? LOGGER_DEFAULTS.PROD_LOG_LEVEL : LOGGER_DEFAULTS.DEV_LOG_LEVEL;
}

// 로그 출력 형식 설정
// LOG_COLOR: 색상 사용 여부 (기본: 개발=true, 운영=false)
// LOG_PRETTY: Pretty Print 여부 (기본: 개발=true, 운영=false)
function getLogColor(): boolean {
  const envColor = process.env[LOGGER_ENV_KEYS.LOG_COLOR]?.toLowerCase();
  if (envColor === "true") return true;
  if (envColor === "false") return false;
  return config.isProd ? LOGGER_DEFAULTS.PROD_USE_COLOR : LOGGER_DEFAULTS.DEV_USE_COLOR;
}

function getLogPretty(): boolean {
  const envPretty = process.env[LOGGER_ENV_KEYS.LOG_PRETTY]?.toLowerCase();
  if (envPretty === "true") return true;
  if (envPretty === "false") return false;
  return config.isProd ? LOGGER_DEFAULTS.PROD_USE_PRETTY : LOGGER_DEFAULTS.DEV_USE_PRETTY;
}

const CURRENT_LOG_LEVEL = getLogLevel();
const USE_COLOR = getLogColor();
const USE_PRETTY = getLogPretty();

/**
 * ISO 타임스탬프 생성
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 로컬 시간 포맷 (개발용)
 */
function getLocalTime(): string {
  return new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * 객체를 안전하게 직렬화
 */
function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return "[Circular]";
  }
}

/**
 * JSON 로그 출력 (프로덕션용)
 */
function outputJson(
  level: LogLevel,
  context: string | undefined,
  message: string,
  meta?: Record<string, unknown>
): void {
  const logEntry: Record<string, unknown> = {
    timestamp: getTimestamp(),
    level: LOG_LEVEL_NAMES[level],
    message,
  };

  if (context) {
    logEntry.context = context;
  }

  if (meta && Object.keys(meta).length > 0) {
    // 메타 정보를 펼쳐서 최상위에 추가
    Object.assign(logEntry, meta);
  }

  const output = safeStringify(logEntry);

  // ERROR는 stderr, 나머지는 stdout
  if (level >= LogLevel.ERROR) {
    console.error(output);
  } else {
    console.log(output);
  }
}

/**
 * Pretty Print 로그 출력 (색상 선택적)
 */
function outputPretty(
  level: LogLevel,
  context: string | undefined,
  message: string,
  meta?: Record<string, unknown>
): void {
  const timestamp = getLocalTime();
  const levelName = LOG_LEVEL_NAMES[level];
  const contextStr = context ? `[${context}]` : "";

  let logLine: string;
  if (USE_COLOR) {
    // 색상 사용
    const color = LOG_LEVEL_COLORS[level];
    logLine = `${LOG_COLORS.dim}${timestamp}${LOG_COLORS.reset} ${color}${levelName}${LOG_COLORS.reset} ${LOG_COLORS.bright}${contextStr}${LOG_COLORS.reset} ${message}`;
  } else {
    // 색상 없음
    logLine = `${timestamp} ${levelName} ${contextStr} ${message}`;
  }

  if (level >= LogLevel.ERROR) {
    console.error(logLine);
  } else {
    console.log(logLine);
  }

  // 메타데이터 출력
  if (meta && Object.keys(meta).length > 0) {
    const metaStr = JSON.stringify(meta, null, 2);
    if (USE_COLOR) {
      console.log(`${LOG_COLORS.dim}${metaStr}${LOG_COLORS.reset}`);
    } else {
      console.log(metaStr);
    }
  }
}

/**
 * 메인 로거 클래스
 */
class Logger {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  private log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    // 로그 레벨 필터링
    if (level < CURRENT_LOG_LEVEL) return;

    if (USE_PRETTY) {
      // Pretty Print 형식 (색상은 USE_COLOR에 따라 결정)
      outputPretty(level, this.context, message, meta);
    } else {
      // JSON 형식 (운영 환경 기본)
      outputJson(level, this.context, message, meta);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  /**
   * Error 객체 로깅
   */
  logError(error: Error, context?: Record<string, unknown>): void {
    this.error(error.message, {
      errorName: error.name,
      stack: error.stack,
      ...context,
    });
  }

  /**
   * HTTP 요청 로깅
   */
  logRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    meta?: Record<string, unknown>
  ): void {
    const message = `${method} ${path} ${statusCode} ${duration}ms`;
    const requestMeta = { method, path, statusCode, duration, ...meta };

    if (statusCode >= 500) {
      this.error(message, requestMeta);
    } else if (statusCode >= 400) {
      this.warn(message, requestMeta);
    } else {
      this.info(message, requestMeta);
    }
  }
}

/**
 * 요청 ID 생성
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 민감 정보 마스킹
 * - 로그인, 회원가입, 비밀번호 변경 등에서 비밀번호 필드 보호
 * - 결제/금융 정보 보호
 */
export function maskSensitiveData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
      masked[key] = "[MASKED]";
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskSensitiveData(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

// 기본 로거
export const logger = new Logger();

// 컨텍스트별 로거 생성
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// 현재 로그 레벨 확인용
export function getCurrentLogLevel(): string {
  return LOG_LEVEL_NAMES[CURRENT_LOG_LEVEL];
}

export default logger;
