// server/config/security.ts
// 보안 미들웨어 설정 (Helmet, Rate Limiting)

import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./index";
import { createLogger } from "../utils/logger";

const logger = createLogger("RateLimit");

/**
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
        maxAge: 31536000, // 1년
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
  windowMs: config.rateLimit?.windowMs || 15 * 60 * 1000, // 15분
  max: config.rateLimit?.maxRequests || 100, // 최대 요청 수
  message: {
    success: false,
    error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  },
  standardHeaders: true, // RateLimit-* 헤더 포함
  legacyHeaders: false, // X-RateLimit-* 헤더 비활성화
  // 기본 keyGenerator 사용 (IPv6 자동 처리)
  // 제한 초과 시 로깅
  handler: (req, res, next, options) => {
    logger.warn("Rate limit 초과", { ip: req.ip, url: req.originalUrl });
    res.status(429).json(options.message);
  },
  // 성공한 요청만 카운트 (4xx, 5xx 제외)
  skipFailedRequests: false,
  // 개발 환경에서는 완화된 제한 적용
  skip: () => config.isDev && !config.rateLimit?.enableInDev,
});

/**
 * 인증 관련 Rate Limiter (더 엄격한 제한)
 * - 로그인, 회원가입, 비밀번호 재설정 등에 적용
 * - 15분당 10회 제한 (Brute Force 방지)
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit?.authWindowMs || 15 * 60 * 1000, // 15분
  max: config.rateLimit?.authMaxRequests || 10, // 최대 10회
  message: {
    success: false,
    error:
      "인증 요청이 너무 많습니다. 15분 후 다시 시도해주세요.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 기본 keyGenerator 사용 (IPv6 자동 처리)
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
  windowMs: config.rateLimit?.apiWindowMs || 1 * 60 * 1000, // 1분
  max: config.rateLimit?.apiMaxRequests || 60, // 최대 60회
  message: {
    success: false,
    error: "API 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
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
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  // 개발 환경에서는 스킵
  skip: () => config.isDev && !config.rateLimit?.enableInDev,
});

/**
 * 결제 관련 Rate Limiter (매우 엄격한 제한)
 * - 결제 요청에 적용
 * - 1분당 5회 제한
 */
export const paymentRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1분
  max: 5, // 최대 5회
  message: {
    success: false,
    error: "결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
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
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  handler: (req, res, next, options) => {
    logger.warn("Payment rate limit 초과", { ip: req.ip, url: req.originalUrl, userId: (req as any).user?.id });
    res.status(429).json(options.message);
  },
  // 결제는 개발 환경에서도 제한 적용
  skip: () => false,
});
