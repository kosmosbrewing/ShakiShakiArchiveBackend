// server/middleware/logger.middleware.ts
// API 요청 로깅 미들웨어

import type { Request, Response, NextFunction } from "express";

/**
 * 시간 포맷팅
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
 * 로그 출력
 */
export function log(message: string, source = "express"): void {
  console.log(`${formatTime()} [${source}] ${message}`);
}

/**
 * API 요청 로깅 미들웨어
 * - /api/* 경로에 대한 요청/응답 로깅
 */
export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined;

  // res.json 메서드 래핑하여 응답 캡처
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;

    // API 요청만 로깅
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      // 80자 초과 시 자르기
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
}
