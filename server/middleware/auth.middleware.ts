// server/middleware/auth.middleware.ts
// 인증 미들웨어 (메모리 캐싱 적용)

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { CachedUser } from "../types";

// 메모리 캐시 (TTL: 5분)
const userCache = new Map<number, { user: CachedUser; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5분

/**
 * 캐시에서 사용자 조회
 */
function getCachedUser(userId: number): CachedUser | null {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.user;
  }
  // 만료된 캐시 삭제
  if (cached) {
    userCache.delete(userId);
  }
  return null;
}

/**
 * 캐시에 사용자 저장
 */
function setCachedUser(userId: number, user: CachedUser): void {
  userCache.set(userId, { user, timestamp: Date.now() });
}

/**
 * 캐시 무효화 (로그아웃, 사용자 정보 변경 시 호출)
 */
export function invalidateUserCache(userId: number): void {
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
  if (req.session?.userId) {
    return next();
  }
  res.status(401).json({ message: "인증이 필요합니다" });
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
      return res.status(401).json({ message: "인증이 필요합니다" });
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
      return res.status(403).json({ message: "관리자 권한이 필요합니다" });
    }

    req.user = cachedUser;
    next();
  } catch (error) {
    console.error("[isAdmin Error]", error);
    res.status(500).json({ message: "서버 오류가 발생했습니다" });
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
  } catch {
    // 에러 발생 시에도 요청 계속 처리
    next();
  }
}
