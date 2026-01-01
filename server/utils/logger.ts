// server/utils/logger.ts
// 프로덕션: JSON 형식 + ERROR 레벨 기본
// 개발: 컬러 텍스트 + DEBUG 레벨 기본

import { config } from "../config";

// 로그 레벨 정의
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// 로그 레벨 문자열 매핑
const levelFromString: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

// 환경변수에서 로그 레벨 파싱
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in levelFromString) {
    return levelFromString[envLevel];
  }
  // 프로덕션: ERROR만, 개발: DEBUG부터
  return config.isProd ? LogLevel.ERROR : LogLevel.DEBUG;
}

const CURRENT_LOG_LEVEL = getLogLevel();

// 로그 레벨 이름
const levelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

// 컬러 코드 (개발 환경 터미널용)
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const levelColors: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: colors.gray,
  [LogLevel.INFO]: colors.cyan,
  [LogLevel.WARN]: colors.yellow,
  [LogLevel.ERROR]: colors.red,
};

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
    level: levelNames[level],
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
 * 컬러 로그 출력 (개발용)
 */
function outputColored(
  level: LogLevel,
  context: string | undefined,
  message: string,
  meta?: Record<string, unknown>
): void {
  const timestamp = getLocalTime();
  const color = levelColors[level];
  const levelName = levelNames[level];
  const contextStr = context ? `[${context}]` : "";

  const logLine = `${colors.dim}${timestamp}${colors.reset} ${color}${levelName}${colors.reset} ${colors.bright}${contextStr}${colors.reset} ${message}`;

  if (level >= LogLevel.ERROR) {
    console.error(logLine);
  } else {
    console.log(logLine);
  }

  // 메타데이터 출력
  if (meta && Object.keys(meta).length > 0) {
    console.log(`${colors.dim}${JSON.stringify(meta, null, 2)}${colors.reset}`);
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

    if (config.isProd) {
      outputJson(level, this.context, message, meta);
    } else {
      outputColored(level, this.context, message, meta);
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
 */
export function maskSensitiveData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const sensitiveKeys = [
    "password",
    "passwordHash",
    "token",
    "secret",
    "authorization",
    "cookie",
    "sessionId",
  ];

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
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
  return levelNames[CURRENT_LOG_LEVEL];
}

export default logger;
