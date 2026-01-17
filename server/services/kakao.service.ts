// server/services/kakao.service.ts
// 카카오 OAuth 2.0 API 클라이언트

import { config } from "../config";
import crypto from "crypto";
import { promisify } from "util";

// crypto.randomBytes 비동기 버전 (Event Loop 블로킹 방지)
const randomBytesAsync = promisify(crypto.randomBytes);

// 카카오 OAuth API 기본 URL
const KAKAO_AUTH_URL = "https://kauth.kakao.com";
const KAKAO_API_URL = "https://kapi.kakao.com";

// 카카오 토큰 응답
export interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  refresh_token_expires_in: number;
  error?: string;
  error_description?: string;
}

// 카카오 사용자 프로필
export interface KakaoUserProfile {
  id: number; // 카카오 고유 ID (숫자)
  connected_at?: string;
  kakao_account?: {
    profile_needs_agreement?: boolean;
    profile?: {
      nickname?: string;
      thumbnail_image_url?: string;
      profile_image_url?: string;
      is_default_image?: boolean;
    };
    email_needs_agreement?: boolean;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    email?: string;
    name_needs_agreement?: boolean;
    name?: string;
    phone_number_needs_agreement?: boolean;
    phone_number?: string;
    gender_needs_agreement?: boolean;
    gender?: string;
    birthday_needs_agreement?: boolean;
    birthday?: string;
  };
}

// 카카오 OAuth 에러 클래스
export class KakaoOAuthError extends Error {
  constructor(
    public code: string,
    public override message: string
  ) {
    super(message);
    this.name = "KakaoOAuthError";
  }
}

/**
 * CSRF 방지용 상태 토큰 생성 (비동기)
 */
export async function generateStateToken(): Promise<string> {
  const bytes = await randomBytesAsync(16);
  return bytes.toString("hex");
}

/**
 * 카카오 로그인 URL 생성
 * 사용자를 이 URL로 리다이렉트하면 카카오 로그인 페이지로 이동
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.kakao.clientId,
    redirect_uri: config.kakao.callbackUrl,
    state: state,
    // 요청할 동의 항목 (닉네임, 이메일만 사용)
    scope: "profile_nickname account_email",
  });

  return `${KAKAO_AUTH_URL}/oauth/authorize?${params.toString()}`;
}

/**
 * 인증 코드로 액세스 토큰 교환
 */
export async function getAccessToken(code: string): Promise<KakaoTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.kakao.clientId,
    redirect_uri: config.kakao.callbackUrl,
    code: code,
  });

  // Client Secret이 설정된 경우 추가
  if (config.kakao.clientSecret) {
    params.append("client_secret", config.kakao.clientSecret);
  }

  const response = await fetch(`${KAKAO_AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: params.toString(),
  });

  const data = (await response.json()) as KakaoTokenResponse;

  if (data.error) {
    throw new KakaoOAuthError(
      data.error,
      data.error_description || "토큰 발급 실패"
    );
  }

  return data;
}

/**
 * 액세스 토큰으로 사용자 프로필 조회
 */
export async function getUserProfile(
  accessToken: string
): Promise<KakaoUserProfile> {
  const response = await fetch(`${KAKAO_API_URL}/v2/user/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });

  if (!response.ok) {
    const errorData = (await response.json()) as { msg?: string; code?: number };
    throw new KakaoOAuthError(
      String(errorData.code || response.status),
      errorData.msg || "프로필 조회 실패"
    );
  }

  const data = (await response.json()) as KakaoUserProfile;
  return data;
}

/**
 * 액세스 토큰 갱신 (리프레시 토큰 사용)
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<KakaoTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.kakao.clientId,
    refresh_token: refreshToken,
  });

  // Client Secret이 설정된 경우 추가
  if (config.kakao.clientSecret) {
    params.append("client_secret", config.kakao.clientSecret);
  }

  const response = await fetch(`${KAKAO_AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: params.toString(),
  });

  const data = (await response.json()) as KakaoTokenResponse;

  if (data.error) {
    throw new KakaoOAuthError(
      data.error,
      data.error_description || "토큰 갱신 실패"
    );
  }

  return data;
}

/**
 * 카카오 연결 해제 (로그아웃 + 앱 연결 끊기)
 */
export async function unlinkUser(accessToken: string): Promise<void> {
  const response = await fetch(`${KAKAO_API_URL}/v1/user/unlink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = (await response.json()) as { msg?: string; code?: number };
    throw new KakaoOAuthError(
      String(errorData.code || response.status),
      errorData.msg || "연결 해제 실패"
    );
  }
}

/**
 * 카카오 로그아웃 (액세스 토큰 만료)
 */
export async function logout(accessToken: string): Promise<void> {
  const response = await fetch(`${KAKAO_API_URL}/v1/user/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = (await response.json()) as { msg?: string; code?: number };
    throw new KakaoOAuthError(
      String(errorData.code || response.status),
      errorData.msg || "로그아웃 실패"
    );
  }
}
