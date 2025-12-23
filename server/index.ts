// server/index.ts
// Express 앱 진입점

import express from "express";
import { createServer } from "http";
import { config } from "./config";
import { corsMiddleware } from "./config/cors";
import { createSessionMiddleware } from "./config/session";
import { helmetMiddleware, globalRateLimiter } from "./config/security";
import {
  errorHandler,
  loggerMiddleware,
  populateUser,
  log,
} from "./middleware";
import routes from "./routes";

// Express 앱 초기화
const app = express();

// rawBody 저장 (Stripe webhook 등에서 필요)
declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// 보안 헤더 (Helmet) - 가장 먼저 적용
app.use(helmetMiddleware);

// 전역 Rate Limiting
app.use(globalRateLimiter);

// Body 파싱
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));

// CORS
app.use(corsMiddleware);

// 세션
app.set("trust proxy", 1);
app.use(createSessionMiddleware());

// 사용자 정보 주입
app.use(populateUser);

// 요청 로깅
app.use(loggerMiddleware);

// API 라우트
app.use("/api", routes);

// 글로벌 에러 핸들러 (서버 크래시 방지)
app.use(errorHandler);

// 서버 시작
const httpServer = createServer(app);

httpServer.listen(
  {
    port: config.port,
    host: "localhost",
  },
  () => {
    log(`API Server serving on port ${config.port}`);
    log(`Environment: ${config.nodeEnv}`);
  }
);
