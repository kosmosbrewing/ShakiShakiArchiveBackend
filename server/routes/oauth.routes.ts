// server/routes/oauth.routes.ts
// OAuth 인증 관련 라우트 (/api/oauth/*)

import { Router } from "express";
import { config } from "../config";
import { storage } from "../storage";
import { asyncHandler } from "../middleware/error.middleware";
import {
  generateStateToken,
  getAuthorizationUrl,
  getAccessToken,
  getUserProfile,
  NaverOAuthError,
} from "../services/naver.service";
import { createLogger } from "../utils/logger";

const router = Router();
const logger = createLogger("OAuth");

/**
 * returnUrl 검증 함수 (Open Redirect 방지)
 * 상대 경로만 허용하고, 프로토콜 상대 URL은 차단
 */
function validateReturnUrl(returnUrl: string | undefined): string {
  // returnUrl이 없거나 상대 경로가 아닌 경우 기본값 반환
  if (!returnUrl || typeof returnUrl !== "string" || !returnUrl.startsWith("/")) {
    return "/";
  }
  // 프로토콜 상대 URL 차단 (예: //evil.com)
  if (returnUrl.startsWith("//")) {
    return "/";
  }
  return returnUrl;
}

/**
 * GET /api/oauth/naver 또는 /api/oauth/naver/login
 * 네이버 로그인 페이지로 리다이렉트
 */
router.get(["/naver", "/naver/login"], asyncHandler(async (req, res) => {
  // 네이버 OAuth가 비활성화된 경우
  if (!config.naver.isEnabled) {
    return res.status(503).json({
      message: "네이버 로그인이 설정되지 않았습니다",
    });
  }

  // returnUrl을 검증 후 세션에 저장
  const returnUrl = validateReturnUrl(req.query.returnUrl as string);
  req.session.oauthReturnUrl = returnUrl;

  // CSRF 방지용 상태 토큰 생성 및 세션에 저장 (비동기)
  const state = await generateStateToken();
  req.session.oauthState = state;

  // 네이버 로그인 페이지로 리다이렉트
  const authUrl = getAuthorizationUrl(state);
  res.redirect(authUrl);
}));

/**
 * GET /api/oauth/naver/callback
 * 네이버 인증 콜백 처리
 */
router.get("/naver/callback", asyncHandler(async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const frontendUrl = config.frontendUrl;

  logger.debug("OAuth 콜백", { frontendUrl });

  // 에러 응답 처리
  if (error) {
    logger.error("네이버 OAuth 에러", { error, errorDescription: error_description });
    return res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent(
        (error_description as string) || "로그인 취소"
      )}`
    );
  }

  // 필수 파라미터 확인
  if (!code || !state) {
    return res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent(
        "잘못된 요청입니다"
      )}`
    );
  }

  // CSRF 검증: 세션의 state와 비교
  const savedState = req.session.oauthState;
  if (!savedState || savedState !== state) {
    return res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent(
        "보안 검증에 실패했습니다"
      )}`
    );
  }

  // 사용한 state 삭제 및 returnUrl 복원
  delete req.session.oauthState;
  const returnUrl = req.session.oauthReturnUrl || "/";
  delete req.session.oauthReturnUrl;

  try {
    // 1. 인증 코드로 액세스 토큰 교환
    const tokenData = await getAccessToken(code as string, state as string);

    // 2. 액세스 토큰으로 사용자 프로필 조회
    const profile = await getUserProfile(tokenData.access_token);

    if (!profile.id) {
      throw new NaverOAuthError("NO_ID", "네이버 ID를 가져올 수 없습니다");
    }

    // 3. naverId로 기존 사용자 검색
    let user = await storage.getUserByNaverId(profile.id);

    if (user) {
      // 기존 네이버 연동 사용자 → 바로 로그인
      req.session.userId = user.id;
      const callbackUrl = new URL(`${frontendUrl}/oauth/callback`);
      callbackUrl.searchParams.set("success", "true");
      callbackUrl.searchParams.set("returnUrl", returnUrl);
      return res.redirect(callbackUrl.toString());
    }

    // 4. 이메일로 기존 사용자 검색 (이메일 기준 자동 연동)
    if (profile.email) {
      user = await storage.getUserByEmail(profile.email);

      if (user) {
        // 기존 이메일 사용자에 네이버 계정 연동
        await storage.updateUser(user.id, {
          naverId: profile.id,
          socialProvider: "naver",
          profileImageUrl: profile.profile_image || user.profileImageUrl,
        });

        req.session.userId = user.id;
        const callbackUrl = new URL(`${frontendUrl}/oauth/callback`);
        callbackUrl.searchParams.set("success", "true");
        callbackUrl.searchParams.set("returnUrl", returnUrl);
        return res.redirect(callbackUrl.toString());
      }
    }

    // 5. 신규 사용자 생성
    const newUser = await storage.createUser({
      email: profile.email || `naver_${profile.id}@naver.placeholder`, // 이메일 미제공 시 임시 이메일
      passwordHash: null, // 소셜 로그인 사용자는 비밀번호 없음
      userName: profile.name || profile.nickname || "네이버 사용자",
      naverId: profile.id,
      socialProvider: "naver",
      profileImageUrl: profile.profile_image,
      phone: profile.mobile,
    });

    req.session.userId = newUser.id;
    const callbackUrl = new URL(`${frontendUrl}/oauth/callback`);
    callbackUrl.searchParams.set("success", "true");
    callbackUrl.searchParams.set("returnUrl", returnUrl);
    return res.redirect(callbackUrl.toString());
  } catch (error) {
    logger.error("네이버 로그인 처리 에러", { error: error instanceof Error ? error.message : String(error) });

    const errorMessage =
      error instanceof NaverOAuthError
        ? error.message
        : "로그인 처리 중 오류가 발생했습니다";

    return res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent(errorMessage)}`
    );
  }
}));

export default router;
