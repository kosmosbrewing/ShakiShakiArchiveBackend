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

  // Cross-Origin 쿠키를 위해 sameSite: "none" + secure: true 필요
  // ALB 뒤에서는 trust proxy 설정과 함께 사용
  const cookieSecure = config.isProd && config.secureCookie;

  return session({
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      // Cross-Origin 요청 시 쿠키 전송을 위해 "none" 사용 (HTTPS 필수)
      // 같은 도메인이면 "lax"로 변경 가능
      sameSite: cookieSecure ? "none" : "lax",
      maxAge: SESSION_TTL,
    },
  });
}
