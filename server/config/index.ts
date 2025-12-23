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

  // 네이버페이 결제 설정
  naverpay: {
    clientId: process.env.NAVERPAY_CLIENT_ID || "",
    clientSecret: process.env.NAVERPAY_CLIENT_SECRET || "",
    chainId: process.env.NAVERPAY_CHAIN_ID || "",
    merchantId: process.env.NAVERPAY_MERCHANT_ID || "",
    // 개발 환경에서는 dev, 운영 환경에서는 prod
    mode: (process.env.NAVERPAY_MODE || "dev") as "dev" | "prod",
    isEnabled: !!process.env.NAVERPAY_CLIENT_ID,
    // 결제 완료 후 리다이렉트 URL
    returnUrl:
      process.env.NAVERPAY_RETURN_URL ||
      "http://localhost:5000/api/payments/naverpay/callback",
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

  // Cloudinary 이미지 업로드 설정
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    isEnabled: !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ),
  },

  // Rate Limiting 설정
  rateLimit: {
    // 전역 Rate Limit (15분 윈도우)
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15분
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
    // 인증 Rate Limit (Brute Force 방지)
    authWindowMs: parseInt(
      process.env.RATE_LIMIT_AUTH_WINDOW_MS || "900000",
      10
    ), // 15분
    authMaxRequests: parseInt(
      process.env.RATE_LIMIT_AUTH_MAX_REQUESTS || "10",
      10
    ),
    // API Rate Limit (1분 윈도우)
    apiWindowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || "60000", 10), // 1분
    apiMaxRequests: parseInt(
      process.env.RATE_LIMIT_API_MAX_REQUESTS || "60",
      10
    ),
    // 개발 환경에서도 Rate Limit 활성화 여부
    enableInDev: process.env.RATE_LIMIT_ENABLE_IN_DEV === "true",
  },
};
