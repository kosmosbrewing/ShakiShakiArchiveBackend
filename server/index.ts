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
import { startReservationCleanup } from "./routes/stock.routes";
import { startOrderCleanup } from "./utils/orderCleanup";
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

    // 🔍 환경 변수 설정 확인 (디버깅용)
    logger.info("환경 변수 설정 상태", {
      frontendUrl: config.frontendUrl,
      frontendUrlSource: process.env.FRONTEND_URL ? 'env' : 'default',
      naverpayEnabled: config.naverpay.isEnabled,
      naverpayReturnUrl: config.naverpay.isEnabled ? config.naverpay.returnUrl : '(비활성화)',
      tossEnabled: config.toss.isEnabled,
    });

    // ⚠️ 개발 환경에서 FRONTEND_URL 미설정 경고
    if (!config.isProd && !process.env.FRONTEND_URL) {
      logger.warn("⚠️  FRONTEND_URL 환경 변수가 설정되지 않았습니다. 기본값 사용: " + config.frontendUrl);
      logger.warn("   네이버페이 결제 완료 후 " + config.frontendUrl + " 로 리다이렉트됩니다.");
      logger.warn("   다른 포트를 사용 중이라면 .env 파일에 FRONTEND_URL을 설정하세요.");
    }

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

    // 재고 선점 자동 정리 시작
    startReservationCleanup();

    // 유령 주문 자동 정리 시작 (1시간 이상 pending_payment 주문 삭제)
    startOrderCleanup();
  }
);
