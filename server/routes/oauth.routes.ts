// server/routes/oauth.routes.ts
// OAuth 인증 관련 라우트 (/api/oauth/*)

import { Router, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config";
import { storage } from "../storage";
import { asyncHandler } from "../middleware/error.middleware";
import { establishUserSession } from "../utils/session";
import {
  generateStateToken,
  getAuthorizationUrl,
  getAccessToken,
  getUserProfile,
  NaverOAuthError,
} from "../services/naver.service";
import {
  generateStateToken as generateKakaoStateToken,
  getAuthorizationUrl as getKakaoAuthorizationUrl,
  getAccessToken as getKakaoAccessToken,
  getUserProfile as getKakaoUserProfile,
  KakaoOAuthError,
} from "../services/kakao.service";
import { createLogger } from "../utils/logger";
import { AUTH_MESSAGES } from "@shared/constants/messages";

const router = Router();
const logger = createLogger("OAuth");
const ADMIN_OAUTH_BLOCK_MESSAGE =
  "관리자 계정은 이메일/비밀번호 로그인만 사용할 수 있습니다";

// OAuth state 비교: 길이 동일성 + timing-safe 비교 (timing attack 방지)
function isStateValid(saved: unknown, received: unknown): boolean {
  if (typeof saved !== "string" || typeof received !== "string") return false;
  if (saved.length === 0 || saved.length !== received.length) return false;
  const a = Buffer.from(saved, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function redirectAdminOAuthBlocked(
  res: Response,
  frontendUrl: string,
  provider: "naver" | "kakao",
  userId: string,
) {
  logger.warn("Admin OAuth login blocked", { provider, userId });
  return res.redirect(
    `${frontendUrl}/oauth/callback?error=${encodeURIComponent(
      ADMIN_OAUTH_BLOCK_MESSAGE,
    )}`,
  );
}

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
 * 카카오 prompt 파라미터 검증 (화이트리스트)
 * @see https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#request-code
 */
const KAKAO_PROMPT_WHITELIST = ["login", "none", "create", "select_account"] as const;
function validateKakaoPrompt(prompt: string | undefined): string | undefined {
  if (!prompt || typeof prompt !== "string") return undefined;
  return KAKAO_PROMPT_WHITELIST.includes(prompt as typeof KAKAO_PROMPT_WHITELIST[number])
    ? prompt
    : undefined;
}

/**
 * 네이버 auth_type 파라미터 검증 (화이트리스트)
 * @see https://developers.naver.com/docs/login/api/api.md
 */
const NAVER_AUTH_TYPE_WHITELIST = ["reprompt", "reauthenticate"] as const;
function validateNaverAuthType(authType: string | undefined): string | undefined {
  if (!authType || typeof authType !== "string") return undefined;
  return NAVER_AUTH_TYPE_WHITELIST.includes(authType as typeof NAVER_AUTH_TYPE_WHITELIST[number])
    ? authType
    : undefined;
}

/**
 * GET /api/oauth/naver 또는 /api/oauth/naver/login
 * 네이버 로그인 페이지로 리다이렉트
 */
router.get(["/naver", "/naver/login"], asyncHandler(async (req, res) => {
  // 네이버 OAuth가 비활성화된 경우
  if (!config.naver.isEnabled) {
    return res.status(503).json({
      message: AUTH_MESSAGES.NAVER_LOGIN_NOT_CONFIGURED,
    });
  }

  // returnUrl을 검증 후 세션에 저장
  const returnUrl = validateReturnUrl(req.query.returnUrl as string);
  req.session.oauthReturnUrl = returnUrl;

  // CSRF 방지용 상태 토큰 생성 및 세션에 저장 (비동기)
  const state = await generateStateToken();
  req.session.oauthState = state;

  // 재인증 파라미터 (auth_type=reprompt: 기존 세션 무시하고 재로그인 강제)
  // 화이트리스트 검증으로 허용된 값만 전달
  const authType = validateNaverAuthType(req.query.auth_type as string);

  // 네이버 로그인 페이지로 리다이렉트
  const authUrl = getAuthorizationUrl(state, authType);
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

  // CSRF 검증: 세션의 state와 timing-safe 비교
  const savedState = req.session.oauthState;
  if (!isStateValid(savedState, state)) {
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
      if (user.isAdmin) {
        return redirectAdminOAuthBlocked(res, frontendUrl, "naver", user.id);
      }

      // 기존 네이버 연동 사용자 → 바로 로그인
      // 세션 고정 방어: 로그인 성공 시 세션 재발급
      await establishUserSession(req, user.id);
      const callbackUrl = new URL(`${frontendUrl}/oauth/callback`);
      callbackUrl.searchParams.set("success", "true");
      callbackUrl.searchParams.set("returnUrl", returnUrl);
      return res.redirect(callbackUrl.toString());
    }

    // 4. 이메일로 기존 사용자 검색 (이메일 기준 자동 연동)
    if (profile.email) {
      user = await storage.getUserByEmail(profile.email);

      if (user) {
        if (user.isAdmin) {
          return redirectAdminOAuthBlocked(res, frontendUrl, "naver", user.id);
        }

        // 기존 이메일 사용자에 네이버 계정 연동
        await storage.updateUser(user.id, {
          naverId: profile.id,
          socialProvider: "naver",
          profileImageUrl: profile.profile_image || user.profileImageUrl,
        });

        // 세션 고정 방어: 로그인 성공 시 세션 재발급
        await establishUserSession(req, user.id);
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

    // 세션 고정 방어: 로그인 성공 시 세션 재발급
    await establishUserSession(req, newUser.id);
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

// ====================================================================
// 카카오 OAuth 라우트
// ====================================================================

/**
 * GET /api/oauth/kakao 또는 /api/oauth/kakao/login
 * 카카오 로그인 페이지로 리다이렉트
 */
router.get(["/kakao", "/kakao/login"], asyncHandler(async (req, res) => {
  // 카카오 OAuth가 비활성화된 경우
  if (!config.kakao.isEnabled) {
    return res.status(503).json({
      message: AUTH_MESSAGES.KAKAO_LOGIN_NOT_CONFIGURED,
    });
  }

  // returnUrl을 검증 후 세션에 저장
  const returnUrl = validateReturnUrl(req.query.returnUrl as string);
  req.session.oauthReturnUrl = returnUrl;

  // CSRF 방지용 상태 토큰 생성 및 세션에 저장 (비동기)
  const state = await generateKakaoStateToken();
  req.session.oauthState = state;

  // 재인증 파라미터 (prompt=login: 기존 세션 무시하고 재로그인 강제)
  // 화이트리스트 검증으로 허용된 값만 전달
  const prompt = validateKakaoPrompt(req.query.prompt as string);

  // 카카오 로그인 페이지로 리다이렉트
  const authUrl = getKakaoAuthorizationUrl(state, prompt);
  res.redirect(authUrl);
}));

/**
 * GET /api/oauth/kakao/callback
 * 카카오 인증 콜백 처리
 */
router.get("/kakao/callback", asyncHandler(async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const frontendUrl = config.frontendUrl;

  logger.debug("카카오 OAuth 콜백", { frontendUrl });

  // 에러 응답 처리
  if (error) {
    logger.error("카카오 OAuth 에러", { error, errorDescription: error_description });
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

  // CSRF 검증: 세션의 state와 timing-safe 비교
  const savedState = req.session.oauthState;
  if (!isStateValid(savedState, state)) {
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
    const tokenData = await getKakaoAccessToken(code as string);

    // 2. 액세스 토큰으로 사용자 프로필 조회
    const profile = await getKakaoUserProfile(tokenData.access_token);

    if (!profile.id) {
      throw new KakaoOAuthError("NO_ID", "카카오 ID를 가져올 수 없습니다");
    }

    // 카카오 ID는 숫자이므로 문자열로 변환
    const kakaoId = String(profile.id);
    const kakaoAccount = profile.kakao_account;
    const kakaoProfile = kakaoAccount?.profile;

    // 3. kakaoId로 기존 사용자 검색
    let user = await storage.getUserByKakaoId(kakaoId);

    if (user) {
      if (user.isAdmin) {
        return redirectAdminOAuthBlocked(res, frontendUrl, "kakao", user.id);
      }

      // 기존 카카오 연동 사용자 → 바로 로그인
      // 세션 고정 방어: 로그인 성공 시 세션 재발급
      await establishUserSession(req, user.id);
      const callbackUrl = new URL(`${frontendUrl}/oauth/callback`);
      callbackUrl.searchParams.set("success", "true");
      callbackUrl.searchParams.set("returnUrl", returnUrl);
      return res.redirect(callbackUrl.toString());
    }

    // 4. 이메일로 기존 사용자 검색 (이메일 기준 자동 연동)
    if (kakaoAccount?.email) {
      user = await storage.getUserByEmail(kakaoAccount.email);

      if (user) {
        if (user.isAdmin) {
          return redirectAdminOAuthBlocked(res, frontendUrl, "kakao", user.id);
        }

        // 기존 이메일 사용자에 카카오 계정 연동
        await storage.updateUser(user.id, {
          kakaoId: kakaoId,
          socialProvider: "kakao",
          profileImageUrl: kakaoProfile?.profile_image_url || user.profileImageUrl,
        });

        // 세션 고정 방어: 로그인 성공 시 세션 재발급
        await establishUserSession(req, user.id);
        const callbackUrl = new URL(`${frontendUrl}/oauth/callback`);
        callbackUrl.searchParams.set("success", "true");
        callbackUrl.searchParams.set("returnUrl", returnUrl);
        return res.redirect(callbackUrl.toString());
      }
    }

    // 5. 신규 사용자 생성
    // 전화번호 포맷 변환 (카카오는 +82 10-1234-5678 형식)
    let phone: string | undefined;
    if (kakaoAccount?.phone_number) {
      // +82 10-1234-5678 -> 010-1234-5678
      phone = kakaoAccount.phone_number
        .replace("+82 ", "0")
        .replace(/ /g, "");
    }

    const newUser = await storage.createUser({
      email: kakaoAccount?.email || `kakao_${kakaoId}@kakao.placeholder`, // 이메일 미제공 시 임시 이메일
      passwordHash: null, // 소셜 로그인 사용자는 비밀번호 없음
      userName: kakaoAccount?.name || kakaoProfile?.nickname || "카카오 사용자",
      kakaoId: kakaoId,
      socialProvider: "kakao",
      profileImageUrl: kakaoProfile?.profile_image_url,
      phone: phone,
    });

    // 세션 고정 방어: 로그인 성공 시 세션 재발급
    await establishUserSession(req, newUser.id);
    const callbackUrl = new URL(`${frontendUrl}/oauth/callback`);
    callbackUrl.searchParams.set("success", "true");
    callbackUrl.searchParams.set("returnUrl", returnUrl);
    return res.redirect(callbackUrl.toString());
  } catch (error) {
    logger.error("카카오 로그인 처리 에러", { error: error instanceof Error ? error.message : String(error) });

    const errorMessage =
      error instanceof KakaoOAuthError
        ? error.message
        : "로그인 처리 중 오류가 발생했습니다";

    return res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent(errorMessage)}`
    );
  }
}));

export default router;
