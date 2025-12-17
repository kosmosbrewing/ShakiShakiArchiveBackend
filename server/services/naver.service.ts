// server/services/naver.service.ts
// 네이버 OAuth 2.0 API 클라이언트

import { config } from "../config";
import crypto from "crypto";

// 네이버 OAuth API 기본 URL
const NAVER_AUTH_URL = "https://nid.naver.com/oauth2.0";
const NAVER_API_URL = "https://openapi.naver.com/v1/nid/me";

// 네이버 토큰 응답
export interface NaverTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

// 네이버 사용자 프로필
export interface NaverUserProfile {
  id: string; // 네이버 고유 ID
  email?: string;
  name?: string;
  nickname?: string;
  profile_image?: string;
  gender?: string;
  birthday?: string;
  birthyear?: string;
  mobile?: string;
}

// 네이버 프로필 API 응답
export interface NaverProfileResponse {
  resultcode: string;
  message: string;
  response: NaverUserProfile;
}

// 네이버 OAuth 에러 클래스
export class NaverOAuthError extends Error {
  constructor(
    public code: string,
    public override message: string
  ) {
    super(message);
    this.name = "NaverOAuthError";
  }
}

/**
 * CSRF 방지용 상태 토큰 생성
 */
export function generateStateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * 네이버 로그인 URL 생성
 * 사용자를 이 URL로 리다이렉트하면 네이버 로그인 페이지로 이동
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.naver.clientId,
    redirect_uri: config.naver.callbackUrl,
    state: state,
  });

  return `${NAVER_AUTH_URL}/authorize?${params.toString()}`;
}

/**
 * 인증 코드로 액세스 토큰 교환
 */
export async function getAccessToken(
  code: string,
  state: string
): Promise<NaverTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.naver.clientId,
    client_secret: config.naver.clientSecret,
    code: code,
    state: state,
  });

  const response = await fetch(`${NAVER_AUTH_URL}/token?${params.toString()}`, {
    method: "POST",
  });

  const data = (await response.json()) as NaverTokenResponse;

  if (data.error) {
    throw new NaverOAuthError(
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
): Promise<NaverUserProfile> {
  const response = await fetch(NAVER_API_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = (await response.json()) as NaverProfileResponse;

  if (data.resultcode !== "00") {
    throw new NaverOAuthError(data.resultcode, data.message);
  }

  return data.response;
}

/**
 * 액세스 토큰 갱신 (리프레시 토큰 사용)
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<NaverTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.naver.clientId,
    client_secret: config.naver.clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${NAVER_AUTH_URL}/token?${params.toString()}`, {
    method: "POST",
  });

  const data = (await response.json()) as NaverTokenResponse;

  if (data.error) {
    throw new NaverOAuthError(
      data.error,
      data.error_description || "토큰 갱신 실패"
    );
  }

  return data;
}

/**
 * 액세스 토큰 삭제 (연결 해제)
 */
export async function deleteToken(accessToken: string): Promise<void> {
  const params = new URLSearchParams({
    grant_type: "delete",
    client_id: config.naver.clientId,
    client_secret: config.naver.clientSecret,
    access_token: accessToken,
    service_provider: "NAVER",
  });

  const response = await fetch(`${NAVER_AUTH_URL}/token?${params.toString()}`, {
    method: "POST",
  });

  const data = (await response.json()) as NaverTokenResponse;

  if (data.error) {
    throw new NaverOAuthError(
      data.error,
      data.error_description || "토큰 삭제 실패"
    );
  }
}
