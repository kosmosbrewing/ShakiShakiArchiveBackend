// server/utils/validation.ts
// 입력값 검증 유틸리티 함수

import { z } from "zod";

/**
 * UUID v4 형식 검증 (정규식)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID 형식이 유효한지 검증
 * @param id - 검증할 UUID 문자열
 * @returns 유효한 UUID이면 true, 아니면 false
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * UUID Zod 스키마 (재사용 가능)
 */
export const uuidSchema = z.string().uuid("유효한 UUID 형식이 아닙니다");

/**
 * 선택적 UUID Zod 스키마
 */
export const optionalUuidSchema = z.string().uuid("유효한 UUID 형식이 아닙니다").optional();
