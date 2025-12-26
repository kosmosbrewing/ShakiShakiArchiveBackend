// server/config/session.ts
// 세션 미들웨어 설정

import session from "express-session";
import connectPg from "connect-pg-simple";
import { config } from "./index";
import { pool } from "../db";

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 1주일

/**
 * PostgreSQL 기반 세션 미들웨어 생성
 * SSL 설정이 적용된 pool을 재사용
 */
export function createSessionMiddleware() {
  const PgStore = connectPg(session);
  const store = new PgStore({
    pool, // SSL 설정이 적용된 pool 사용
    createTableIfMissing: false,
    ttl: SESSION_TTL,
    tableName: "sessions",
  });

  return session({
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.isProd && config.secureCookie,
      sameSite: config.isProd ? "strict" : "lax",
      maxAge: SESSION_TTL,
    },
  });
}
