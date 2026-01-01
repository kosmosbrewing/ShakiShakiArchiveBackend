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
} from "./middleware";
import routes from "./routes";
import { meilisearchService } from "./services/meilisearch.service";
import { testConnection } from "./db";
import { createLogger, getCurrentLogLevel } from "./utils/logger";

const logger = createLogger("Server");

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

// Docker/App Runner에서는 0.0.0.0으로 바인딩 필요
const host = config.isProd ? "0.0.0.0" : "localhost";

httpServer.listen(
  {
    port: config.port,
    host,
  },
  async () => {
    logger.info("서버 시작", {
      host,
      port: config.port,
      env: config.nodeEnv,
      logLevel: getCurrentLogLevel(),
    });

    // DB 연결 테스트
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error("DB 연결 실패 - 서버가 정상 작동하지 않을 수 있습니다");
    }

    // Meilisearch 초기화 (비동기, 실패해도 서버는 계속 실행)
    try {
      await meilisearchService.initialize();
    } catch (error) {
      logger.error("Meilisearch 초기화 중 오류 발생", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);
