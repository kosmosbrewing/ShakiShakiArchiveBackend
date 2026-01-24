// server/middleware/proxy-headers.middleware.ts
// API Gateway 커스텀 헤더 처리 미들웨어
// AWS API Gateway + VPC Link 환경에서 덮어씌워지는 Host 헤더를 복원

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../utils/logger";

const logger = createLogger("ProxyHeaders");

// Express Request 타입 확장 (originalHost 속성 추가)
declare global {
  namespace Express {
    interface Request {
      /** API Gateway에서 전달받은 원본 Host */
      originalHost?: string;
    }
  }
}

/**
 * API Gateway 커스텀 헤더 처리 미들웨어
 *
 * API Gateway + VPC Link 환경에서:
 * - X-Forwarded-Proto: API Gateway가 자동 전달 (처리 불필요)
 * - Cookie: API Gateway가 자동 전달 (처리 불필요)
 * - Host: API Gateway가 덮어씀 → X-Original-Host로 복원 필요
 *
 * Terraform 설정:
 * request_parameters = {
 *   "overwrite:header.X-Original-Host" = var.frontend_domain
 * }
 */
export function proxyHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // X-Original-Host만 처리 (API Gateway에서 전달)
  const originalHost = req.headers["x-original-host"];

  if (originalHost) {
    // Host 헤더 복원 (Express의 req.hostname 등에서 사용됨)
    req.headers["host"] = originalHost as string;
    // 참조용으로도 저장
    req.originalHost = originalHost as string;
  }

  next();
}

/**
 * 헤더 디버깅 미들웨어
 * 문제 진단용 - 환경변수 DEBUG_PROXY_HEADERS=true 시 활성화
 */
export function debugHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // API 경로만 로깅 (헬스체크 제외)
  if (!req.path.startsWith("/api") || req.path === "/api/health") {
    return next();
  }

  logger.info("=== 요청 헤더 디버그 ===", {
    path: req.path,
    method: req.method,
    // Host 관련
    host: req.headers["host"] || "(없음)",
    "x-original-host": req.headers["x-original-host"] || "(없음)",
    // 프록시 관련 (API Gateway 자동 전달)
    "x-forwarded-proto": req.headers["x-forwarded-proto"] || "(없음)",
    "x-forwarded-for": req.headers["x-forwarded-for"] || "(없음)",
    // 쿠키 (API Gateway 자동 전달)
    cookie: req.headers["cookie"] ? "[존재]" : "(없음)",
    // Express 판단 결과
    "req.secure": req.secure,
    "req.protocol": req.protocol,
    "req.hostname": req.hostname,
  });

  next();
}
