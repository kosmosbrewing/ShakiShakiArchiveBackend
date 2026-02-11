// server/config/security.ts
// 보안 미들웨어 설정 (Helmet, Rate Limiting)

import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./index";
import { createLogger } from "../utils/logger";
import { RATE_LIMIT, HSTS, RATE_LIMIT_MESSAGES } from "../constants";

const logger = createLogger("RateLimit");

/** 보안 사항
 * Helmet 보안 헤더 설정
 * - XSS 공격 방지
 * - Clickjacking 방지
 * - MIME 타입 스니핑 방지
 * - 기타 보안 헤더 설정
 */
export const helmetMiddleware = helmet({
  // Content-Security-Policy 설정
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // 필요시 외부 스크립트 도메인 추가
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", "https:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  // X-Frame-Options: DENY (Clickjacking 방지)
  frameguard: { action: "deny" },
  // X-Content-Type-Options: nosniff
  noSniff: true,
  // X-XSS-Protection (레거시 브라우저용)
  xssFilter: true,
  // Referrer-Policy
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // HSTS (프로덕션에서만 활성화)
  hsts: config.isProd
    ? {
        maxAge: HSTS.MAX_AGE,
        includeSubDomains: true,
        preload: true,
      }
    : false,
  // X-Powered-By 헤더 제거 (서버 정보 노출 방지)
  hidePoweredBy: true,
  // DNS Prefetch 제어
  dnsPrefetchControl: { allow: false },
  // IE에서 다운로드 실행 방지
  ieNoOpen: true,
  // Cross-Origin-Embedder-Policy
  crossOriginEmbedderPolicy: false, // API 서버이므로 비활성화
  // Cross-Origin-Opener-Policy
  crossOriginOpenerPolicy: { policy: "same-origin" },
  // Cross-Origin-Resource-Policy
  crossOriginResourcePolicy: { policy: "cross-origin" }, // API 접근 허용
});

/**
 * 전역 Rate Limiter
 * - 모든 API 요청에 적용
 * - 기본: 15분당 1000회 (이커머스 브라우징 패턴: 페이지당 15~25 요청 고려)
 * - 환경변수로 오버라이드 가능
 */
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit?.windowMs ?? RATE_LIMIT.GLOBAL.WINDOW_MS,
  max: config.rateLimit?.maxRequests ?? RATE_LIMIT.GLOBAL.MAX_REQUESTS,
  message: {
    success: false,
    error: RATE_LIMIT_MESSAGES.GLOBAL,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  handler: (req, res, next, options) => {
    logger.warn("Rate limit 초과", { ip: req.ip, url: req.originalUrl });
    res.status(429).json(options.message);
  },
  skipFailedRequests: false,
  skip: (req) => {
    // 헬스체크는 로드밸런서가 빈번히 호출하므로 카운트 제외
    if (req.path === '/health' || req.path === '/api/health') {
      return true;
    }
    // 관리자 API는 전역 제한 우회 (별도 adminRateLimiter 적용)
    if (req.path === '/api/admin' || req.path.startsWith('/api/admin/')) {
      return true;
    }
    // 개발 환경 스킵
    return config.isDev && !config.rateLimit?.enableInDev;
  },
});

/**
 * 인증 관련 Rate Limiter (Brute Force 방지)
 * - 로그인, 회원가입, 비밀번호 재설정/변경, 이메일 인증 확인에 적용
 * - 15분당 15회 (회원가입 플로우 4회 + 재시도 여유)
 * - 이메일 발송은 별도 emailSendRateLimiter로 분리
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit?.authWindowMs ?? RATE_LIMIT.AUTH.WINDOW_MS,
  max: config.rateLimit?.authMaxRequests ?? RATE_LIMIT.AUTH.MAX_REQUESTS,
  message: {
    success: false,
    error: RATE_LIMIT_MESSAGES.AUTH,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  handler: (req, res, next, options) => {
    logger.warn("Auth rate limit 초과", { ip: req.ip, url: req.originalUrl });
    res.status(429).json(options.message);
  },
  skip: () => config.isDev && !config.rateLimit?.enableInDev,
});

/**
 * 이메일 발송 Rate Limiter (인증 리미터와 분리)
 * - 인증 메일 발송(send-verification)에만 적용
 * - 5분당 3회 (발송 비용 절감 + 어뷰징 방지)
 * - IP 기반: 미인증 상태에서 호출되므로
 */
export const emailSendRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.EMAIL_SEND.WINDOW_MS,
  max: RATE_LIMIT.EMAIL_SEND.MAX_REQUESTS,
  message: {
    success: false,
    error: RATE_LIMIT_MESSAGES.EMAIL_SEND,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  handler: (req, res, next, options) => {
    logger.warn("Email send rate limit 초과", { ip: req.ip, url: req.originalUrl });
    res.status(429).json(options.message);
  },
  // 이메일 발송은 개발 환경에서도 제한 (외부 API 비용)
  skip: () => false,
});

/**
 * 결제 관련 Rate Limiter
 * - 결제 승인/취소 요청에 적용
 * - 1분당 10회 (결제 실패 재시도 여유 확보)
 */
export const paymentRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.PAYMENT.WINDOW_MS,
  max: RATE_LIMIT.PAYMENT.MAX_REQUESTS,
  message: {
    success: false,
    error: RATE_LIMIT_MESSAGES.PAYMENT,
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 세션 기반 인증: rate limiter가 isAuthenticated보다 먼저 실행되므로
  // req.user가 아닌 req.session.userId 사용
  keyGenerator: (req) => {
    const userId = (req as any).session?.userId;
    if (userId) {
      return `payment_user_${userId}`;
    }
    return `payment_ip_${req.ip || "unknown"}`;
  },
  validate: { xForwardedForHeader: false, forwardedHeader: false, keyGeneratorIpFallback: false },
  handler: (req, res, next, options) => {
    logger.warn("Payment rate limit 초과", {
      ip: req.ip,
      url: req.originalUrl,
      userId: (req as any).session?.userId,
    });
    res.status(429).json(options.message);
  },
  skip: () => false,
});

/**
 * 관리자 전용 Rate Limiter (높은 제한)
 * - 관리자 API에 적용
 * - 5분당 300회 제한
 * - userId 기반으로 제한 (IP 독립적)
 * - 전역 Rate Limiter를 skip하고 이 제한만 적용됨
 */
export const adminRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.ADMIN.WINDOW_MS,
  max: RATE_LIMIT.ADMIN.MAX_REQUESTS,
  message: {
    success: false,
    error: RATE_LIMIT_MESSAGES.ADMIN,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // 세션에서 userId 가져오기 (인증된 경우)
    const userId = (req as any).session?.userId;
    if (userId) {
      return `admin_user_${userId}`;
    }
    // 인증 전이면 IP 기반 (로그인 시도 등)
    return `admin_ip_${req.ip || "unknown"}`;
  },
  validate: { xForwardedForHeader: false, forwardedHeader: false, keyGeneratorIpFallback: false },
  handler: (req, res, next, options) => {
    logger.warn("Admin rate limit 초과", {
      ip: req.ip,
      url: req.originalUrl,
      userId: (req as any).session?.userId,
    });
    res.status(429).json(options.message);
  },
  // 관리자는 개발 환경에서도 제한 적용 (보안 강화)
  skip: () => false,
});
