// server/utils/shortId.ts
// UUID를 네이버페이 호환 짧은 ID로 변환하는 유틸리티
// 네이버페이 상품ID 제한: 최대 30자

import crypto from "crypto";

/**
 * UUID를 네이버페이 호환 짧은 ID로 변환 (22자)
 * Base62 인코딩 사용 (0-9, a-z, A-Z)
 *
 * @param uuid - 변환할 UUID (예: "aa50010d-1931-4570-b161-597ab86d8eda")
 * @returns 22자 Base62 인코딩된 문자열
 */
export function uuidToShortId(uuid: string): string {
  // UUID에서 하이픈 제거
  const hex = uuid.replace(/-/g, "");

  // 16진수를 BigInt로 변환
  const num = BigInt("0x" + hex);

  // Base62 인코딩
  return bigIntToBase62(num);
}

/**
 * 짧은 ID를 다시 UUID로 변환 (디버깅/로깅용)
 *
 * @param shortId - 22자 Base62 인코딩된 문자열
 * @returns UUID 형식 문자열
 */
export function shortIdToUuid(shortId: string): string {
  // Base62 디코딩
  const num = base62ToBigInt(shortId);

  // BigInt를 16진수로 변환 (32자리로 패딩)
  let hex = num.toString(16).padStart(32, "0");

  // UUID 형식으로 변환 (8-4-4-4-12)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Base62 문자셋 (0-9, A-Z, a-z)
const BASE62_CHARS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE62 = BigInt(62);

/**
 * BigInt를 Base62 문자열로 변환
 */
function bigIntToBase62(num: bigint): string {
  const ZERO = BigInt(0);
  if (num === ZERO) return "0";

  let result = "";
  let n = num;

  while (n > ZERO) {
    const remainder = Number(n % BASE62);
    result = BASE62_CHARS[remainder] + result;
    n = n / BASE62;
  }

  return result;
}

/**
 * Base62 문자열을 BigInt로 변환
 */
function base62ToBigInt(str: string): bigint {
  let result = BigInt(0);

  for (const char of str) {
    const index = BASE62_CHARS.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base62 character: ${char}`);
    }
    result = result * BASE62 + BigInt(index);
  }

  return result;
}

/**
 * 상품 ID를 네이버페이용 짧은 ID로 변환
 * - 네이버페이 상품ID 제한: 최대 30자
 * - UUID(36자) → Base62(22자)
 *
 * @param productId - 상품 UUID
 * @returns 네이버페이 호환 짧은 ID
 */
export function toNaverPayProductId(productId: string): string {
  return uuidToShortId(productId);
}

/**
 * 옵션 관리 코드를 네이버페이용으로 변환
 * - SKU가 있으면 그대로 사용 (30자 이내일 경우)
 * - 없거나 길면 UUID를 짧게 변환
 *
 * @param sku - 상품 SKU (있으면)
 * @param variantId - variant UUID
 * @returns 네이버페이 호환 옵션 관리 코드 (30자 이내)
 */
export function toNaverPayOptionCode(
  sku: string | null | undefined,
  variantId: string
): string {
  // SKU가 있고 30자 이내면 그대로 사용
  if (sku && sku.length <= 30) {
    return sku;
  }

  // UUID를 짧게 변환
  return uuidToShortId(variantId);
}
