// server/utils/logger.ts
// 디버깅을 위한 로그 유틸리티

import { config } from "../config";

// 로그 레벨 정의
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// 환경별 기본 로그 레벨
const DEFAULT_LOG_LEVEL = config.isProd ? LogLevel.INFO : LogLevel.DEBUG;

// 컬러 코드 (터미널 출력용)
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

// 로그 레벨별 색상
const levelColors: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: colors.gray,
  [LogLevel.INFO]: colors.cyan,
  [LogLevel.WARN]: colors.yellow,
  [LogLevel.ERROR]: colors.red,
};

// 로그 레벨 이름
const levelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

/**
 * 로컬 시간 포맷팅
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
 * 객체를 안전하게 JSON 문자열로 변환
 */
function safeStringify(obj: unknown, maxLength = 1000): string {
  try {
    const str = JSON.stringify(obj, null, 2);
    if (str.length > maxLength) {
      return str.slice(0, maxLength) + "... (truncated)";
    }
    return str;
  } catch {
    return "[Circular or non-serializable object]";
  }
}

/**
 * 메인 로거 클래스
 */
class Logger {
  private level: LogLevel = DEFAULT_LOG_LEVEL;
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  /**
   * 로그 레벨 설정
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 로그 출력
   */
  private log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    if (level < this.level) return;

    const timestamp = getLocalTime();
    const color = levelColors[level];
    const levelName = levelNames[level];
    const contextStr = this.context ? `[${this.context}]` : "";

    // 컬러 로그 출력
    let logLine = `${colors.dim}${timestamp}${colors.reset} ${color}${levelName}${colors.reset} ${colors.bright}${contextStr}${colors.reset} ${message}`;

    console.log(logLine);

    // 메타데이터가 있으면 상세 출력
    if (meta && Object.keys(meta).length > 0) {
      console.log(`${colors.dim}${safeStringify(meta)}${colors.reset}`);
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
   * 에러 객체 상세 로깅
   */
  logError(error: Error, context?: Record<string, unknown>): void {
    this.error(error.message, {
      name: error.name,
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
    const statusColor =
      statusCode >= 500
        ? colors.red
        : statusCode >= 400
          ? colors.yellow
          : statusCode >= 300
            ? colors.cyan
            : colors.green;

    const message = `${colors.bright}${method}${colors.reset} ${path} ${statusColor}${statusCode}${colors.reset} ${colors.dim}${duration}ms${colors.reset}`;

    // 상태 코드에 따라 로그 레벨 결정
    if (statusCode >= 500) {
      this.log(LogLevel.ERROR, message, meta);
    } else if (statusCode >= 400) {
      this.log(LogLevel.WARN, message, meta);
    } else {
      this.log(LogLevel.INFO, message, meta);
    }
  }
}

/**
 * 요청 ID 생성 (추적용)
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

// 기본 로거 인스턴스
export const logger = new Logger();

// 컨텍스트별 로거 생성 함수
export function createLogger(context: string): Logger {
  return new Logger(context);
}

export default logger;
