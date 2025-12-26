// server/db.ts
// Drizzle ORM + PostgreSQL Pool 설정

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import fs from "fs";
import path from "path";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}

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
    console.log("[DB] SSL 비활성화 (DB_SSL=false)");
    return false;
  }

  // CA 인증서 경로 우선순위:
  // 1. DB_SSL_CA (사용자 지정)
  // 2. RDS_CA_BUNDLE (Docker 환경, Dockerfile에서 설정)
  // 3. certs/rds-ca-bundle.pem (로컬 기본 경로)
  const caCertPath =
    process.env.DB_SSL_CA ||
    process.env.RDS_CA_BUNDLE ||
    null;

  if (caCertPath) {
    // 절대 경로 또는 상대 경로 처리
    const resolvedPath = path.isAbsolute(caCertPath)
      ? caCertPath
      : path.resolve(process.cwd(), caCertPath);

    if (fs.existsSync(resolvedPath)) {
      console.log(`[DB] SSL 활성화 - CA 인증서: ${resolvedPath}`);
      return {
        rejectUnauthorized: true, // 인증서 검증 활성화
        ca: fs.readFileSync(resolvedPath, "utf-8"),
      };
    } else {
      console.warn(
        `[DB] 경고: 인증서 경로를 찾을 수 없음: ${resolvedPath}`
      );
    }
  }

  // 기본 인증서 경로 확인 (로컬 개발용)
  const defaultCaPath = path.resolve(process.cwd(), "certs/rds-ca-bundle.pem");
  if (fs.existsSync(defaultCaPath)) {
    console.log(`[DB] SSL 활성화 - CA 인증서 (기본): ${defaultCaPath}`);
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(defaultCaPath, "utf-8"),
    };
  }

  // 인증서가 없으면 검증 없이 SSL 연결 (개발 환경용)
  console.warn(
    "[DB] SSL 활성화 - 인증서 없음 (rejectUnauthorized: false)"
  );
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

// DATABASE_URL에서 sslmode 파라미터 처리
// URL에 sslmode가 있으면 Node.js의 SSL 설정과 충돌할 수 있음
let connectionString = process.env.DATABASE_URL;

// PostgreSQL 연결 풀 (트랜잭션용으로 export)
export const pool = new Pool({
  connectionString,
  ssl: sslConfig,
});

// Drizzle ORM 인스턴스
export const db = drizzle({ client: pool, schema });
