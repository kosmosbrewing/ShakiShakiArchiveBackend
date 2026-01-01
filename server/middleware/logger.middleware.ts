// server/middleware/logger.middleware.ts
// API 요청 로깅 미들웨어 - 디버깅용 상세 로그 지원

import type { Request, Response, NextFunction } from "express";
import {
  createLogger,
  generateRequestId,
  maskSensitiveData,
} from "../utils/logger";
import { config } from "../config";

const logger = createLogger("HTTP");

// Express Request 타입 확장
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * 시간 포맷팅 (하위 호환성)
 */
function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/**
 * 로그 출력 (하위 호환성)
 */
export function log(message: string, source = "express"): void {
  const sourceLogger = createLogger(source);
  sourceLogger.info(message);
}

/**
 * 요청 바디에서 로깅할 정보 추출
 */
function extractRequestInfo(req: Request): Record<string, unknown> {
  const info: Record<string, unknown> = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get("user-agent"),
  };

  // 개발 환경에서만 요청 바디 로깅
  if (!config.isProd && req.body && Object.keys(req.body).length > 0) {
    info.body = maskSensitiveData(req.body);
  }

  // 인증된 사용자 정보
  if (req.user) {
    info.userId = req.user.id;
    info.userEmail = req.user.email;
  }

  return info;
}

/**
 * API 요청 로깅 미들웨어
 * - 요청 ID 부여
 * - 요청/응답 로깅
 * - 에러 추적
 */
export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // API 경로만 상세 로깅
  if (!req.path.startsWith("/api")) {
    return next();
  }

  // 요청 ID 및 시작 시간 설정
  req.requestId = generateRequestId();
  req.startTime = Date.now();

  // 응답 바디 캡처
  let responseBody: unknown;
  const originalJson = res.json;
  res.json = function (body, ...args) {
    responseBody = body;
    return originalJson.apply(res, [body, ...args]);
  };

  // 요청 시작 로그 (DEBUG 레벨)
  logger.debug(`→ ${req.method} ${req.path}`, extractRequestInfo(req));

  // 응답 완료 시 로그
  res.on("finish", () => {
    const duration = Date.now() - (req.startTime || Date.now());

    const meta: Record<string, unknown> = {
      requestId: req.requestId,
      duration: `${duration}ms`,
    };

    // 에러 응답인 경우 상세 정보 포함
    if (res.statusCode >= 400) {
      meta.response = responseBody;

      // 요청 정보도 포함 (디버깅용)
      if (!config.isProd) {
        meta.request = extractRequestInfo(req);
      }
    }

    // 상태 코드에 따른 로깅
    logger.logRequest(req.method, req.path, res.statusCode, duration, meta);
  });

  // 에러 이벤트 캐치
  res.on("error", (err) => {
    logger.error(`Response error on ${req.method} ${req.path}`, {
      requestId: req.requestId,
      error: err.message,
      stack: err.stack,
    });
  });

  next();
}

/**
 * 느린 요청 감지 미들웨어 (선택적 사용)
 */
export function slowRequestLogger(thresholdMs = 1000) {
  const slowLogger = createLogger("SLOW");

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (duration > thresholdMs) {
        slowLogger.warn(`Slow request detected: ${req.method} ${req.path}`, {
          requestId: req.requestId,
          duration: `${duration}ms`,
          threshold: `${thresholdMs}ms`,
          query: req.query,
          userId: req.user?.id,
        });
      }
    });

    next();
  };
}
