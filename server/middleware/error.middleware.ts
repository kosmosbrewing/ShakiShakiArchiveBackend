// server/middleware/error.middleware.ts
// 글로벌 에러 핸들러 - 서버 크래시 방지

import type { Request, Response, NextFunction } from "express";

/**
 * 글로벌 에러 핸들러
 * - 예상치 못한 에러 발생 시에도 서버가 계속 실행되도록 함
 * - throw err 제거로 서버 크래시 방지
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // 에러 로깅
  console.error("[Error]", {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  // HTTP 상태 코드 결정
  const status = (err as any).status || (err as any).statusCode || 500;

  // 프로덕션 환경에서는 상세 에러 메시지 숨김
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : err.message;

  res.status(status).json({ message });

  // 중요: throw err 제거 - 서버 크래시 방지
  // 추후 Sentry 등 외부 모니터링 서비스 연동 가능
}
