// server/config/cors.ts
// CORS 미들웨어 설정

import type { Request, Response, NextFunction } from "express";
import { config } from "./index";
import { createLogger } from "../utils/logger";

const logger = createLogger("CORS");

/**
 * CORS 미들웨어
 * - 개발 환경: 모든 origin 허용
 * - 프로덕션: CORS_ORIGINS 환경 변수에 지정된 origin만 허용
 */
export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const origin = req.headers.origin;

  // origin 허용 여부 체크
  const isAllowed =
    config.isDev ||
    !origin ||
    config.cors.allowedOrigins.includes("*") ||
    config.cors.allowedOrigins.includes(origin);

  // 디버깅: CORS 검증 실패 시 로그 출력
  if (!isAllowed && origin) {
    logger.warn("CORS origin 거부됨", {
      requestOrigin: origin,
      allowedOrigins: config.cors.allowedOrigins,
      isDev: config.isDev,
    });
  }

  if (isAllowed) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );

  // Preflight 요청 처리
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
}
