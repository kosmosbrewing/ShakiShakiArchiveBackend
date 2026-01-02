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
 * 전체 URL 생성
 */
function getFullUrl(req: Request): string {
  const protocol = req.protocol;
  const host = req.get("host") || "unknown";
  const originalUrl = req.originalUrl;
  return `${protocol}://${host}${originalUrl}`;
}

/**
 * 응답 바디 요약 (너무 큰 경우 축약)
 */
function summarizeResponseBody(body: unknown, maxLength = 2000): unknown {
  if (body === undefined || body === null) return body;

  const stringified = JSON.stringify(body);
  if (stringified.length <= maxLength) {
    return body;
  }

  // 너무 큰 경우 요약
  return {
    _truncated: true,
    _originalLength: stringified.length,
    _preview: stringified.slice(0, maxLength) + "...",
  };
}

/**
 * 요청 바디에서 로깅할 정보 추출
 */
function extractRequestInfo(req: Request): Record<string, unknown> {
  const info: Record<string, unknown> = {
    requestId: req.requestId,
    method: req.method,
    url: getFullUrl(req),
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get("user-agent"),
  };

  // 요청 바디 로깅 (민감 정보 마스킹)
  if (req.body && Object.keys(req.body).length > 0) {
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

  // 응답 바디 캡처 (json, send 모두 지원)
  let responseBody: unknown;

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function (body: unknown) {
    responseBody = body;
    return originalJson(body);
  };

  res.send = function (body: unknown) {
    // JSON 형태의 문자열인 경우 파싱 시도
    if (typeof body === "string") {
      try {
        responseBody = JSON.parse(body);
      } catch {
        responseBody = body;
      }
    } else {
      responseBody = body;
    }
    return originalSend(body);
  };

  // 요청 시작 로그 - 전체 URL 포함
  const fullUrl = getFullUrl(req);
  logger.info(`→ REQUEST ${req.method} ${fullUrl}`, extractRequestInfo(req));

  // 응답 완료 시 로그
  res.on("finish", () => {
    const duration = Date.now() - (req.startTime || Date.now());

    const meta: Record<string, unknown> = {
      requestId: req.requestId,
      url: fullUrl,
      duration: `${duration}ms`,
    };

    // 모든 응답에 대해 요청/응답 데이터 포함
    meta.request = {
      body: req.body && Object.keys(req.body).length > 0
        ? maskSensitiveData(req.body)
        : undefined,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
    };
    meta.response = summarizeResponseBody(responseBody);

    // 상태 코드에 따른 로깅
    logger.logRequest(req.method, fullUrl, res.statusCode, duration, meta);
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
