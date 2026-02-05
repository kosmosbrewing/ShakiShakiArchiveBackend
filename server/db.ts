// server/db.ts
// Drizzle ORM + PostgreSQL Pool 설정

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import fs from "fs";
import path from "path";
// config import 시 필수 환경 변수 검증이 자동 실행됨
import { config } from "./config";
import { createLogger } from "./utils/logger";
import { DB_POOL, DB_TIMEOUT } from "./constants";

const { Pool } = pg;
const logger = createLogger("DB");

// SSL 설정: DB_SSL 환경변수로 명시적 제어
// - DB_SSL=true: SSL 활성화 (기본값)
// - DB_SSL=false: SSL 비활성화
// - 미설정 시: production에서는 true, 그 외에는 false
function getSslEnabled(): boolean {
  const dbSsl = process.env.DB_SSL?.toLowerCase();

  if (dbSsl === "true") return true;
  if (dbSsl === "false") return false;

  // 미설정 시 환경에 따라 결정
  return process.env.NODE_ENV === "production";
}

const needsSsl = getSslEnabled();

// SSL 인증서 설정 함수
function getSslConfig(): pg.PoolConfig["ssl"] {
  if (!needsSsl) {
    logger.info("SSL 비활성화 (DB_SSL=false)");
    return false;
  }

  // CA 인증서 경로 우선순위:
  // 1. DB_SSL_CA (사용자 지정)
  // 2. RDS_CA_BUNDLE (Docker 환경, Dockerfile에서 설정)
  // 3. certs/rds-ca-bundle.pem (로컬 기본 경로)
  const caCertPath = process.env.DB_SSL_CA || process.env.RDS_CA_BUNDLE || null;

  if (caCertPath) {
    // 절대 경로 또는 상대 경로 처리
    const resolvedPath = path.isAbsolute(caCertPath)
      ? caCertPath
      : path.resolve(process.cwd(), caCertPath);

    if (fs.existsSync(resolvedPath)) {
      logger.info("SSL 활성화 - CA 인증서 사용", { certPath: resolvedPath });
      return {
        rejectUnauthorized: true, // 인증서 검증 활성화
        ca: fs.readFileSync(resolvedPath, "utf-8"),
      };
    } else {
      logger.warn("인증서 경로를 찾을 수 없음", { certPath: resolvedPath });
    }
  }

  // 기본 인증서 경로 확인 (로컬 개발용)
  const defaultCaPath = path.resolve(process.cwd(), "certs/rds-ca-bundle.pem");
  if (fs.existsSync(defaultCaPath)) {
    logger.info("SSL 활성화 - 기본 CA 인증서 사용", {
      certPath: defaultCaPath,
    });
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(defaultCaPath, "utf-8"),
    };
  }

  // 인증서가 없으면 검증 없이 SSL 연결 (개발 환경용)
  logger.warn("SSL 활성화 - 인증서 없음 (rejectUnauthorized: false)");
  return {
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined,
  };
}

const sslConfig = getSslConfig();

// pg 전역 SSL 기본값 설정 (연결 문자열의 sslmode보다 우선)
if (needsSsl && typeof sslConfig === "object") {
  pg.defaults.ssl = sslConfig;
}

// config에서 검증된 DATABASE_URL 사용
const connectionString = config.databaseUrl;

// 환경별 Pool 설정
const isProduction = process.env.NODE_ENV === "production";

// Pool 옵션 설정
const poolConfig: pg.PoolConfig = {
  connectionString,
  ssl: sslConfig,

  // 연결 수 설정
  max: parseInt(
    process.env.DB_POOL_MAX ||
      String(isProduction ? DB_POOL.MAX_PROD : DB_POOL.MAX_DEV),
    10
  ),
  min: parseInt(process.env.DB_POOL_MIN || String(DB_POOL.MIN), 10),

  // 타임아웃 설정 (밀리초)
  idleTimeoutMillis: parseInt(
    process.env.DB_IDLE_TIMEOUT || String(DB_TIMEOUT.IDLE),
    10
  ),
  connectionTimeoutMillis: parseInt(
    process.env.DB_CONNECTION_TIMEOUT || String(DB_TIMEOUT.CONNECTION),
    10
  ),

  // 유휴 상태에서 프로세스 종료 허용 (graceful shutdown 지원)
  allowExitOnIdle: false,
};

logger.debug("Pool 설정 완료", {
  max: poolConfig.max,
  min: poolConfig.min,
  idleTimeoutMillis: poolConfig.idleTimeoutMillis,
  connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
});

// PostgreSQL 연결 풀 (트랜잭션용으로 export)
export const pool = new Pool(poolConfig);

// Pool 이벤트 리스너
// 새 연결이 생성될 때마다 타임존을 KST(Asia/Seoul)로 설정
pool.on("connect", async (client) => {
  try {
    // 세션 타임존을 한국 시간(KST)으로 설정
    await client.query("SET timezone = 'Asia/Seoul'");
    logger.debug("새 연결 생성 - 타임존 KST 설정 완료", {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    });
  } catch (error) {
    logger.error("타임존 설정 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

pool.on("acquire", () => {
  logger.debug("연결 획득", {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on("release", () => {
  logger.debug("연결 반환", {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on("remove", () => {
  logger.debug("연결 제거됨", {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
  });
});

pool.on("error", (err) => {
  logger.error("Pool 에러 발생", { error: err.message, stack: err.stack });
});

// Pool 상태 모니터링 함수
export function getPoolStatus() {
  return {
    totalCount: pool.totalCount, // 총 연결 수
    idleCount: pool.idleCount, // 유휴 연결 수
    waitingCount: pool.waitingCount, // 대기 중인 쿼리 수
  };
}

// Pool 연결 테스트 함수
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    // 연결 테스트 및 타임존 확인
    const result = await client.query(
      "SELECT current_setting('TIMEZONE') as timezone, NOW() as current_time"
    );
    client.release();
    logger.info("연결 테스트 성공", {
      timezone: result.rows[0]?.timezone,
      currentTime: result.rows[0]?.current_time,
    });
    return true;
  } catch (error) {
    logger.error("연결 테스트 실패", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}

// Graceful Shutdown 핸들러
let isShuttingDown = false;

export async function closePool(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("Pool 종료 시작");
  try {
    await pool.end();
    logger.info("Pool 종료 완료");
  } catch (error) {
    logger.error("Pool 종료 중 에러", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 프로세스 종료 시그널 핸들러
async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    // 이미 종료 중이면 강제 종료
    logger.info(`${signal} 재수신 - 강제 종료`);
    process.exit(1);
  }

  logger.info(`${signal} 수신 - Graceful shutdown 시작`);
  await closePool();
  process.exit(0);
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

// Drizzle ORM 인스턴스
export const db = drizzle({ client: pool, schema });
