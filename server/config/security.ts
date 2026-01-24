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
 * - 기본: 15분당 100회 요청 제한
 */
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit?.windowMs || RATE_LIMIT.GLOBAL.WINDOW_MS,
  max: config.rateLimit?.maxRequests || RATE_LIMIT.GLOBAL.MAX_REQUESTS,
  message: {
    success: false,
    error: RATE_LIMIT_MESSAGES.GLOBAL,
  },
  standardHeaders: true, // RateLimit-* 헤더 포함
  legacyHeaders: false, // X-RateLimit-* 헤더 비활성화
  // 프록시 환경에서 Forwarded/X-Forwarded-For 경고 비활성화
  // Express trust proxy 설정으로 req.ip가 이미 클라이언트 IP를 반환함
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  // 제한 초과 시 로깅
  handler: (req, res, next, options) => {
    logger.warn("Rate limit 초과", { ip: req.ip, url: req.originalUrl });
    res.status(429).json(options.message);
  },
  // 성공한 요청만 카운트 (4xx, 5xx 제외)
  skipFailedRequests: false,
  // 개발 환경에서는 완화된 제한 적용
  // 관리자 API는 전역 제한 우회 (별도 adminRateLimiter 적용)
  skip: (req) => {
    // 관리자 API는 전역 제한 우회 (정확한 경로 매칭)
    // /api/admin 또는 /api/admin/으로 시작하는 경로만 매칭
    // /api/administrator, /api/admins 등은 우회 불가
    if (req.path === '/api/admin' || req.path.startsWith('/api/admin/')) {
      return true;
    }
    // 개발 환경 스킵
    return config.isDev && !config.rateLimit?.enableInDev;
  },
});

/**
 * 인증 관련 Rate Limiter (더 엄격한 제한)
 * - 로그인, 회원가입, 비밀번호 재설정 등에 적용
 * - 15분당 10회 제한 (Brute Force 방지)
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit?.authWindowMs || RATE_LIMIT.AUTH.WINDOW_MS,
  max: config.rateLimit?.authMaxRequests || RATE_LIMIT.AUTH.MAX_REQUESTS,
  message: {
    success: false,
    error: RATE_LIMIT_MESSAGES.AUTH,
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 프록시 환경에서 Forwarded/X-Forwarded-For 경고 비활성화
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  handler: (req, res, next, options) => {
    logger.warn("Auth rate limit 초과", { ip: req.ip, url: req.originalUrl });
    res.status(429).json(options.message);
  },
  // 개발 환경에서는 스킵
  skip: () => config.isDev && !config.rateLimit?.enableInDev,
});

/**
 * API Rate Limiter (일반 API용)
 * - 인증된 사용자의 API 요청에 적용
 * - 1분당 60회 제한
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit?.apiWindowMs || RATE_LIMIT.API.WINDOW_MS,
  max: config.rateLimit?.apiMaxRequests || RATE_LIMIT.API.MAX_REQUESTS,
  message: {
    success: false,
    error: RATE_LIMIT_MESSAGES.API,
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 인증된 사용자는 userId 기반, 그 외는 IP 기반
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    if (userId) {
      return `user_${userId}`;
    }
    return req.ip || "unknown";
  },
  validate: { xForwardedForHeader: false, forwardedHeader: false, keyGeneratorIpFallback: false },
  // 개발 환경에서는 스킵
  skip: () => config.isDev && !config.rateLimit?.enableInDev,
});

/**
 * 결제 관련 Rate Limiter (매우 엄격한 제한)
 * - 결제 요청에 적용
 * - 1분당 5회 제한
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
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
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
      userId: (req as any).user?.id,
    });
    res.status(429).json(options.message);
  },
  // 결제는 개발 환경에서도 제한 적용
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
