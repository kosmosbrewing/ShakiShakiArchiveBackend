// server/config/index.ts
// 환경 변수 중앙 관리

/**
 * 필수 환경 변수 목록
 * 앱 시작 시 반드시 설정되어 있어야 하는 환경 변수들
 */
const REQUIRED_ENV_VARS = [
  {
    name: "DATABASE_URL",
    description: "PostgreSQL 데이터베이스 연결 문자열",
  },
  {
    name: "SESSION_SECRET",
    description: "세션 암호화에 사용되는 비밀 키 (최소 32자 권장)",
  },
] as const;

/**
 * 필수 환경 변수 검증
 * 누락된 환경 변수가 있으면 명확한 에러 메시지와 함께 앱 실행을 중단
 */
function validateRequiredEnvVars(): void {
  const missingVars = REQUIRED_ENV_VARS.filter((env) => !process.env[env.name]);

  if (missingVars.length > 0) {
    const errorMessages = missingVars
      .map((env) => `  - ${env.name}: ${env.description}`)
      .join("\n");

    throw new Error(
      `\n` +
        `========================================\n` +
        `❌ 필수 환경 변수가 설정되지 않았습니다!\n` +
        `========================================\n` +
        `\n` +
        `누락된 환경 변수:\n` +
        `${errorMessages}\n` +
        `\n` +
        `.env 파일을 확인하거나 환경 변수를 설정해주세요.\n` +
        `예시:\n` +
        `  DATABASE_URL=postgresql://user:password@localhost:5432/dbname\n` +
        `  SESSION_SECRET=your-secure-secret-key-here\n` +
        `========================================\n`
    );
  }
}

// 앱 시작 시 필수 환경 변수 검증 실행
validateRequiredEnvVars();

export const config = {
  // 서버 설정
  port: parseInt(process.env.PORT || "8080", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: process.env.NODE_ENV !== "production",
  isProd: process.env.NODE_ENV === "production",

  // 데이터베이스 (필수 환경 변수, 검증 완료)
  databaseUrl: process.env.DATABASE_URL as string,

  // 세션 (필수 환경 변수, 검증 완료)
  sessionSecret: process.env.SESSION_SECRET as string,
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
      "http://localhost:8080/api/oauth/naver/callback",
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
      "http://localhost:8080/api/payments/naverpay/callback",
  },

  // 프론트엔드 URL (OAuth 콜백 리다이렉트용)
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:8080",

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

  // Meilisearch 검색 엔진 설정
  meilisearch: {
    host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
    apiKey: process.env.MEILISEARCH_API_KEY || "",
    isEnabled: !!process.env.MEILISEARCH_HOST,
    // 인덱스 설정
    indexes: {
      products: process.env.MEILISEARCH_PRODUCTS_INDEX || "products",
    },
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
