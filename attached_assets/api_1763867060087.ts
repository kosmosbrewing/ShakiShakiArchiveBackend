/**
 * API 클라이언트 유틸리티
 * fetch를 사용한 타입 안전 API 호출
 */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

/**
 * API 요청 헬퍼
 */
export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new ApiError(response.status, data.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * GET 요청
 */
export async function get<T>(url: string): Promise<T> {
  return apiRequest<T>(url, { method: 'GET' });
}

/**
 * POST 요청
 */
export async function post<T>(url: string, body?: any): Promise<T> {
  return apiRequest<T>(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH 요청
 */
export async function patch<T>(url: string, body?: any): Promise<T> {
  return apiRequest<T>(url, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE 요청
 */
export async function del<T>(url: string): Promise<T> {
  return apiRequest<T>(url, { method: 'DELETE' });
}
