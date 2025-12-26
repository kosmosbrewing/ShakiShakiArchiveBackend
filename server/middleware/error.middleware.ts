// server/middleware/error.middleware.ts
// 글로벌 에러 핸들러 - 서버 크래시 방지 + 상세 오류 추적

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../utils/logger";
import { config } from "../config";

const logger = createLogger("ERROR");

// 커스텀 에러 인터페이스
interface AppError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  details?: unknown;
}

/**
 * 에러에서 상태 코드 추출
 */
function getStatusCode(err: AppError): number {
  return err.status || err.statusCode || 500;
}

/**
 * 스택 트레이스 파싱 (가독성 향상)
 */
function parseStackTrace(stack?: string): string[] {
  if (!stack) return [];

  return stack
    .split("\n")
    .slice(1) // 첫 줄(에러 메시지) 제외
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .slice(0, 10); // 최대 10줄
}

/**
 * 에러 컨텍스트 정보 수집
 */
function collectErrorContext(
  err: AppError,
  req: Request
): Record<string, unknown> {
  return {
    // 에러 정보
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      details: err.details,
    },

    // 요청 정보
    request: {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get("user-agent"),
    },

    // 사용자 정보
    user: req.user
      ? {
          id: req.user.id,
          email: req.user.email,
        }
      : undefined,

    // 스택 트레이스 (개발 환경)
    stack: !config.isProd ? parseStackTrace(err.stack) : undefined,

    // 타임스탬프
    timestamp: new Date().toISOString(),
  };
}

/**
 * 글로벌 에러 핸들러
 * - 예상치 못한 에러 발생 시에도 서버가 계속 실행되도록 함
 * - 상세한 에러 로깅으로 디버깅 지원
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = getStatusCode(err);
  const context = collectErrorContext(err, req);

  // 상세 에러 로깅
  logger.error(`[${statusCode}] ${err.message}`, context);

  // 500 에러인 경우 전체 스택 트레이스도 출력
  if (statusCode >= 500 && err.stack) {
    console.error("\n--- Full Stack Trace ---");
    console.error(err.stack);
    console.error("------------------------\n");
  }

  // 응답
  const response: Record<string, unknown> = {
    message: config.isProd ? "Internal Server Error" : err.message,
    requestId: req.requestId, // 추적용
  };

  // 개발 환경에서는 상세 정보 포함
  if (!config.isProd) {
    response.error = {
      name: err.name,
      code: err.code,
      stack: parseStackTrace(err.stack),
    };
  }

  res.status(statusCode).json(response);
}

/**
 * 404 핸들러
 */
export function notFoundHandler(req: Request, res: Response) {
  logger.warn(`Route not found: ${req.method} ${req.path}`, {
    requestId: req.requestId,
    query: req.query,
  });

  res.status(404).json({
    message: "Not Found",
    path: req.path,
    requestId: req.requestId,
  });
}

/**
 * 비동기 핸들러 래퍼 (try-catch 자동화)
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
