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

  // 토스페이먼츠 설정
  toss: {
    secretKey: process.env.TOSS_SECRET_KEY || "",
    clientKey: process.env.TOSS_CLIENT_KEY || "",
    apiBaseUrl: "https://api.tosspayments.com/v1",
    isEnabled: !!process.env.TOSS_SECRET_KEY,
  },

  // 네이버 OAuth 설정
  naver: {
    clientId: process.env.NAVER_CLIENT_ID || "",
    clientSecret: process.env.NAVER_CLIENT_SECRET || "",
    callbackUrl:
      process.env.NAVER_CALLBACK_URL ||
      "http://localhost:5000/api/oauth/naver/callback",
    isEnabled: !!process.env.NAVER_CLIENT_ID,
  },

  // 프론트엔드 URL (OAuth 콜백 리다이렉트용)
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",

  // Resend 이메일 설정
  email: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.EMAIL_FROM || "noreply@example.com",
    fromName: process.env.EMAIL_FROM_NAME || "ShakiShaki",
    isEnabled: !!process.env.RESEND_API_KEY,
    verificationCodeExpiry: 10, // 인증코드 만료 시간 (분)
  },
};
