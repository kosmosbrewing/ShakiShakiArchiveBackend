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
 * 관리자 권한을 직접 판정하는 라우트용 헬퍼.
 * 관리자 계정이어도 2차 인증이 끝난 세션만 관리자 권한으로 취급한다.
 */
export function hasVerifiedAdminSession(
  req: Request,
  user: { isAdmin?: boolean } | null | undefined,
): boolean {
  return !!user?.isAdmin && !!req.session?.admin2faVerifiedAt;
}

/**
 * 세션 인증 체크 미들웨어
 * - DB 조회 없이 세션만 확인
 */
export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // 디버깅: 세션 상태 확인 (임시 - 문제 해결 후 제거)
  logger.debug("인증 체크", {
    path: req.path,
    hasSession: !!req.session,
    sessionId: req.session?.id ? req.session.id.slice(0, 8) + "..." : "(없음)",
    userId: req.session?.userId || "(없음)",
    hasCookie: !!req.headers.cookie,
    cookiePreview: req.headers.cookie
      ? req.headers.cookie.slice(0, 50) + "..."
      : "(없음)",
    secure: req.secure,
    protocol: req.protocol,
    xForwardedProto: req.headers["x-forwarded-proto"] || "(없음)",
  });

  if (req.session?.userId) {
    return next();
  }
  res.status(401).json({ message: AUTH_MESSAGES.REQUIRED });
}

/**
 * 관리자 권한 체크 미들웨어
 * - 캐싱 적용으로 DB 조회 최소화
 */
export async function isAdmin(req: Request, res: Response, next: NextFunction) {
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

    if (!req.session.admin2faVerifiedAt) {
      return res.status(403).json({
        message: "관리자 2차 인증이 필요합니다.",
        code: "ADMIN_2FA_REQUIRED",
      });
    }

    req.user = cachedUser;
    next();
  } catch (error) {
    logger.error("관리자 권한 확인 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
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
  next: NextFunction,
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
        if (cachedUser.isAdmin && !req.session.admin2faVerifiedAt) {
          next();
          return;
        }

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
