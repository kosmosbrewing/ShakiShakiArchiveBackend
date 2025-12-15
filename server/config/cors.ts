// server/config/cors.ts
// CORS 미들웨어 설정

import type { Request, Response, NextFunction } from "express";
import { config } from "./index";

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
