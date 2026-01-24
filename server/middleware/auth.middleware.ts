// server/middleware/auth.middleware.ts
// 인증 미들웨어 (메모리 캐싱 적용)

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { CachedUser } from "../types";
import { createLogger } from "../utils/logger";
import { USER_CACHE, AUTH_MESSAGES } from "../constants";

const logger = createLogger("Auth");

// 메모리 캐시 (TTL 기반, UUID 기반)
const userCache = new Map<string, { user: CachedUser; timestamp: number }>();

/**
 * 캐시에서 사용자 조회 (UUID 기반)
 */
function getCachedUser(userId: string): CachedUser | null {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.timestamp < USER_CACHE.TTL) {
    return cached.user;
  }
  // 만료된 캐시 삭제
  if (cached) {
    userCache.delete(userId);
  }
  return null;
}

/**
 * 캐시에 사용자 저장 (UUID 기반)
 */
function setCachedUser(userId: string, user: CachedUser): void {
  userCache.set(userId, { user, timestamp: Date.now() });
}

/**
 * 캐시 무효화 (로그아웃, 사용자 정보 변경 시 호출, UUID 기반)
 */
export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}

/**
 * 세션 인증 체크 미들웨어
 * - DB 조회 없이 세션만 확인
 */
export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // 디버깅: 세션 상태 확인 (DEBUG_AUTH=true 환경변수로 활성화)
  if (process.env.DEBUG_AUTH === "true") {
    logger.error("[DEBUG] 인증 체크", {
      path: req.path,
      hasSession: !!req.session,
      sessionId: req.session?.id?.slice(0, 8) + "...",
      userId: req.session?.userId || "(없음)",
      hasCookie: !!req.headers.cookie,
      cookieHeader: req.headers.cookie ? "[존재]" : "(없음)",
      secure: req.secure,
      protocol: req.protocol,
    });
  }

  if (req.session?.userId) {
    return next();
  }
  res.status(401).json({ message: AUTH_MESSAGES.REQUIRED });
}

/**
 * 관리자 권한 체크 미들웨어
 * - 캐싱 적용으로 DB 조회 최소화
 */
export async function isAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: AUTH_MESSAGES.REQUIRED });
    }

    // 캐시 확인
    let cachedUser = getCachedUser(userId);

    if (!cachedUser) {
      // DB에서 사용자 조회
      const user = await storage.getUser(userId);
      if (user) {
        cachedUser = {
          id: user.id,
          email: user.email,
          isAdmin: user.isAdmin,
        };
        setCachedUser(userId, cachedUser);
      }
    }

    if (!cachedUser?.isAdmin) {
      return res.status(403).json({ message: AUTH_MESSAGES.ADMIN_REQUIRED });
    }

    req.user = cachedUser;
    next();
  } catch (error) {
    logger.error("관리자 권한 확인 실패", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: AUTH_MESSAGES.SERVER_ERROR });
  }
}

/**
 * 사용자 정보 주입 미들웨어
 * - 캐싱 적용으로 DB 조회 최소화
 */
export async function populateUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.session?.userId;
    if (userId) {
      // 캐시 확인
      let cachedUser = getCachedUser(userId);

      if (!cachedUser) {
        // DB에서 사용자 조회
        const user = await storage.getUser(userId);
        if (user) {
          cachedUser = {
            id: user.id,
            email: user.email,
            isAdmin: user.isAdmin,
          };
          setCachedUser(userId, cachedUser);
        }
      }

      if (cachedUser) {
        req.user = cachedUser;
      }
    }
    next();
  } catch (error) {
    // 에러 발생 시에도 요청 계속 처리하되, 로깅은 수행
    logger.error("사용자 정보 주입 실패", {
      userId: req.session?.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    next();
  }
}
