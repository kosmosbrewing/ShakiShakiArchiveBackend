import { createSign } from "crypto";
import { createLogger } from "../utils/logger";

type VisitorSource = "ga4" | "unavailable";

export interface VisitorStats {
  source: VisitorSource;
  configured: boolean;
  today: number | null;
  yesterday: number | null;
  last7Days: number | null;
  last30Days: number | null;
  note?: string;
}

interface Ga4Config {
  propertyId: string;
  clientEmail: string;
  privateKey: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

const logger = createLogger("GA4");
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

let cachedToken: { accessToken: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;

function toBase64Url(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input) : input;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getGa4Config(): Ga4Config | null {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const clientEmail = process.env.GA4_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.GA4_PRIVATE_KEY?.trim();

  if (!propertyId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  return {
    propertyId,
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

function createSignedJwt(config: Ga4Config): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: config.clientEmail,
    scope: GA_SCOPE,
    aud: TOKEN_ENDPOINT,
    exp: expiresAt,
    iat: issuedAt,
  };

  const unsignedJwt = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(
    JSON.stringify(payload),
  )}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();

  const signature = signer.sign(config.privateKey);
  return `${unsignedJwt}.${toBase64Url(signature)}`;
}

async function getAccessToken(config: Ga4Config): Promise<string> {
  if (
    cachedToken &&
    Date.now() < cachedToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS
  ) {
    return cachedToken.accessToken;
  }

  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    const assertion = createSignedJwt(config);
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `GA4 토큰 발급 실패 (${response.status}): ${errorText.slice(0, 500)}`,
      );
    }

    const tokenData = (await response.json()) as TokenResponse;
    cachedToken = {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };

    return tokenData.access_token;
  })();

  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
}

async function fetchActiveUsers(
  config: Ga4Config,
  startDate: string,
  endDate: string,
): Promise<number> {
  const accessToken = await getAccessToken(config);
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "activeUsers" }],
      limit: 1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GA4 리포트 조회 실패 (${response.status}): ${errorText.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    rows?: Array<{ metricValues?: Array<{ value?: string }> }>;
    totals?: Array<{ metricValues?: Array<{ value?: string }> }>;
  };

  const value =
    data.rows?.[0]?.metricValues?.[0]?.value ??
    data.totals?.[0]?.metricValues?.[0]?.value ??
    "0";

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getVisitorStatsFromGa4(): Promise<VisitorStats> {
  const config = getGa4Config();

  if (!config) {
    return {
      source: "unavailable",
      configured: false,
      today: null,
      yesterday: null,
      last7Days: null,
      last30Days: null,
      note: "GA4 환경 변수가 설정되지 않았습니다.",
    };
  }

  try {
    const [today, yesterday, last7Days, last30Days] = await Promise.all([
      fetchActiveUsers(config, "today", "today"),
      fetchActiveUsers(config, "yesterday", "yesterday"),
      fetchActiveUsers(config, "7daysAgo", "today"),
      fetchActiveUsers(config, "30daysAgo", "today"),
    ]);

    return {
      source: "ga4",
      configured: true,
      today,
      yesterday,
      last7Days,
      last30Days,
    };
  } catch (error) {
    logger.warn("GA4 방문자 통계 조회 실패", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      source: "unavailable",
      configured: true,
      today: null,
      yesterday: null,
      last7Days: null,
      last30Days: null,
      note: "GA4 통계를 불러오지 못했습니다. 설정 값을 확인해주세요.",
    };
  }
}
