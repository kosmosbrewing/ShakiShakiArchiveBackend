// server/config/index.ts
// 환경 변수 중앙 관리

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set");
}

export const config = {
  // 서버 설정
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: process.env.NODE_ENV !== "production",
  isProd: process.env.NODE_ENV === "production",

  // 데이터베이스
  databaseUrl: process.env.DATABASE_URL,

  // 세션
  sessionSecret: process.env.SESSION_SECRET,
  secureCookie: process.env.SECURE_COOKIE !== "false",

  // CORS (쉼표로 구분된 origin 목록)
  cors: {
    allowedOrigins: process.env.CORS_ORIGINS?.split(",") || ["*"],
  },
};
