// server/utils/http-client.ts
// 외부 API 호출 시 요청/응답 로깅을 포함한 HTTP 클라이언트

import { createLogger, maskSensitiveData } from "./logger";

const logger = createLogger("ExternalAPI");

// 요청 옵션 타입
export interface HttpRequestOptions extends RequestInit {
  timeout?: number;
}

// 응답 타입
export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
}

/**
 * 헤더에서 민감 정보 마스킹
 */
function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitiveKeys = [
    "authorization",
    "x-naver-client-secret",
    "x-api-key",
    "api-key",
    "secret",
    "token",
  ];

  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      masked[key] = "[MASKED]";
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

/**
 * 응답 바디 요약 (너무 큰 경우 축약)
 */
function summarizeBody(body: unknown, maxLength = 2000): unknown {
  if (body === undefined || body === null) return body;

  try {
    const stringified = JSON.stringify(body);
    if (stringified.length <= maxLength) {
      return body;
    }
    return {
      _truncated: true,
      _originalLength: stringified.length,
      _preview: stringified.slice(0, maxLength) + "...",
    };
  } catch {
    return "[Unable to serialize]";
  }
}

/**
 * 외부 API 호출 (로깅 포함)
 */
export async function httpRequest<T = unknown>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
  const { timeout = 30000, ...fetchOptions } = options;
  const method = fetchOptions.method || "GET";
  const startTime = Date.now();

  // 요청 바디 파싱
  let requestBody: unknown;
  if (fetchOptions.body) {
    try {
      requestBody =
        typeof fetchOptions.body === "string"
          ? JSON.parse(fetchOptions.body)
          : fetchOptions.body;
    } catch {
      requestBody = fetchOptions.body;
    }
  }

  // 요청 헤더 추출
  const requestHeaders: Record<string, string> = {};
  if (fetchOptions.headers) {
    if (fetchOptions.headers instanceof Headers) {
      fetchOptions.headers.forEach((value, key) => {
        requestHeaders[key] = value;
      });
    } else if (Array.isArray(fetchOptions.headers)) {
      fetchOptions.headers.forEach(([key, value]) => {
        requestHeaders[key] = value;
      });
    } else {
      Object.assign(requestHeaders, fetchOptions.headers);
    }
  }

  // 요청 로그 (문자열 body는 요약해서 로깅)
  let logBody: unknown;
  if (requestBody) {
    if (typeof requestBody === "string") {
      // XML 등 문자열 바디는 길이 제한해서 로깅
      logBody = requestBody.length > 500
        ? `${requestBody.substring(0, 500)}... [truncated, total ${requestBody.length} chars]`
        : requestBody;
    } else {
      logBody = maskSensitiveData(requestBody as Record<string, unknown>);
    }
  }

  logger.info(`→ EXTERNAL ${method} ${url}`, {
    method,
    url,
    headers: maskHeaders(requestHeaders),
    body: logBody,
  });

  // AbortController로 타임아웃 구현
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    // 응답 바디 파싱
    const contentType = response.headers.get("content-type") || "";
    let responseData: T;

    if (contentType.includes("application/json")) {
      responseData = (await response.json()) as T;
    } else {
      responseData = (await response.text()) as unknown as T;
    }

    // 응답 로그
    const logMeta = {
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`,
      response: summarizeBody(responseData),
    };

    if (response.ok) {
      logger.info(`← EXTERNAL ${method} ${url} ${response.status} ${duration}ms`, logMeta);
    } else {
      logger.warn(`← EXTERNAL ${method} ${url} ${response.status} ${duration}ms`, logMeta);
    }

    return {
      data: responseData,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    // 에러 로그
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout =
      error instanceof Error && error.name === "AbortError";

    // 에러 로그 (문자열 body는 요약)
    let errorLogBody: unknown;
    if (requestBody) {
      if (typeof requestBody === "string") {
        errorLogBody = requestBody.length > 500
          ? `${requestBody.substring(0, 500)}... [truncated]`
          : requestBody;
      } else {
        errorLogBody = maskSensitiveData(requestBody as Record<string, unknown>);
      }
    }

    logger.error(`✕ EXTERNAL ${method} ${url} FAILED ${duration}ms`, {
      method,
      url,
      duration: `${duration}ms`,
      error: isTimeout ? "Request timeout" : errorMessage,
      body: errorLogBody,
    });

    throw error;
  }
}

/**
 * JSON POST 요청 헬퍼
 */
export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  options: { timeout?: number } = {}
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    timeout: options.timeout,
  });
}

/**
 * GET 요청 헬퍼
 */
export async function get<T = unknown>(
  url: string,
  headers: Record<string, string> = {}
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, {
    method: "GET",
    headers,
  });
}

/**
 * application/x-www-form-urlencoded POST 요청 헬퍼
 * 네이버페이 등 form-urlencoded 방식을 사용하는 API용
 */
export async function postFormUrlEncoded<T = unknown>(
  url: string,
  body: Record<string, string | number | boolean | undefined>,
  headers: Record<string, string> = {},
  options: { timeout?: number } = {}
): Promise<HttpResponse<T>> {
  // undefined 값 필터링 후 URLSearchParams 생성
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  }

  return httpRequest<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: params.toString(),
    timeout: options.timeout,
  });
}
