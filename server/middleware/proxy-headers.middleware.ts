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
 * - X-Original-Proto: HTTPS 판단용 → X-Forwarded-Proto로 복사
 * - X-Original-Host: Host 헤더 복원
 * - Cookie: API Gateway가 자동 전달
 *
 * Terraform 설정:
 * request_parameters = {
 *   "overwrite:header.X-Original-Host" = var.frontend_domain
 *   "overwrite:header.X-Original-Proto" = "https"
 * }
 */
export function proxyHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // 1. X-Original-Proto 처리 (HTTPS 판단용) - 가장 중요!
  // X-Original-Proto → X-Forwarded-Proto로 복사
  // Express의 trust proxy가 X-Forwarded-Proto를 읽어 req.secure 판단
  const originalProto = req.headers["x-original-proto"];
  if (originalProto) {
    const proto = (originalProto as string).toLowerCase();
    if (proto === "https" || proto === "http") {
      req.headers["x-forwarded-proto"] = proto;
    }
  }

  // 2. X-Original-Host 처리 (Host 헤더 복원)
  const originalHost = req.headers["x-original-host"];
  if (originalHost) {
    req.headers["host"] = originalHost as string;
    req.originalHost = originalHost as string;
  }

  // 3. X-Original-Cookie 처리 (Cookie 헤더가 막힌 경우)
  // API Gateway가 Cookie 헤더를 전달하지 않으면 X-Original-Cookie로 우회
  const originalCookie = req.headers["x-original-cookie"];
  if (originalCookie && !req.headers["cookie"]) {
    req.headers["cookie"] = originalCookie as string;
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
    // 커스텀 헤더 (API Gateway에서 전달)
    "x-original-proto": req.headers["x-original-proto"] || "(없음)",
    "x-original-host": req.headers["x-original-host"] || "(없음)",
    // 변환된 헤더
    "x-forwarded-proto": req.headers["x-forwarded-proto"] || "(없음)",
    host: req.headers["host"] || "(없음)",
    // 쿠키
    cookie: req.headers["cookie"] ? "[존재]" : "(없음)",
    // Express 판단 결과
    "req.secure": req.secure,
    "req.protocol": req.protocol,
    "req.hostname": req.hostname,
  });

  next();
}
