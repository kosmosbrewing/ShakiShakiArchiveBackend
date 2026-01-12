// server/utils/cloudinary.ts
// Cloudinary 이미지 URL 최적화 유틸리티

/**
 * Cloudinary URL 최적화 옵션
 */
interface CloudinaryOptimizeOptions {
  width?: number;
  height?: number;
  crop?: "fill" | "fit" | "scale" | "crop" | "thumb";
  quality?: "auto" | "auto:best" | "auto:good" | "auto:eco" | "auto:low";
  format?: "auto";
  dpr?: "auto" | number;
}

/**
 * Cloudinary URL인지 확인
 */
function isCloudinaryUrl(url: string): boolean {
  return url.includes("res.cloudinary.com");
}

/**
 * Cloudinary URL에 최적화 파라미터 추가
 *
 * @param url - 원본 Cloudinary URL
 * @param options - 최적화 옵션
 * @returns 최적화된 Cloudinary URL
 *
 * @example
 * // 기본 최적화
 * optimizeCloudinaryUrl('https://res.cloudinary.com/.../image.jpg')
 * // → https://res.cloudinary.com/.../w_800,c_fill,f_auto,q_auto/image.jpg
 *
 * // 커스텀 최적화
 * optimizeCloudinaryUrl(url, { width: 400, height: 400, quality: 'auto:best' })
 */
export function optimizeCloudinaryUrl(
  url: string,
  options: CloudinaryOptimizeOptions = {}
): string {
  // Cloudinary URL이 아니면 원본 반환
  if (!url || !isCloudinaryUrl(url)) {
    return url;
  }

  // 이미 최적화 파라미터가 있으면 원본 반환 (중복 방지)
  if (url.includes("/upload/w_") || url.includes("/upload/f_auto")) {
    return url;
  }

  // 기본값 설정
  const {
    width,
    height,
    crop = "fill",
    quality = "auto",
    format = "auto",
    dpr,
  } = options;

  // URL을 '/upload/' 기준으로 분리
  const parts = url.split("/upload/");
  if (parts.length !== 2) {
    return url; // '/upload/'가 없거나 형식이 잘못된 경우 원본 반환
  }

  // 변환 파라미터 생성
  const transforms: string[] = [];

  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  if (width || height) transforms.push(`c_${crop}`);
  transforms.push(`f_${format}`);
  transforms.push(`q_${quality}`);
  if (dpr) transforms.push(`dpr_${dpr}`);

  const transformString = transforms.join(",");

  // 최적화된 URL 반환
  return `${parts[0]}/upload/${transformString}/${parts[1]}`;
}

/**
 * OpenGraph 이미지용 최적화 (SNS 공유용)
 * - 크기: 1200x630 (카카오톡, 페이스북 권장)
 * - 품질: 자동 최적화
 */
export function optimizeForOg(url: string): string {
  return optimizeCloudinaryUrl(url, {
    width: 1200,
    height: 630,
    crop: "fill",
    quality: "auto",
  });
}

/**
 * 썸네일 이미지용 최적화
 * - 크기: 400x400
 * - 경량화
 */
export function optimizeForThumbnail(url: string): string {
  return optimizeCloudinaryUrl(url, {
    width: 400,
    height: 400,
    crop: "fill",
    quality: "auto:eco",
  });
}

/**
 * 상품 상세 이미지용 최적화
 * - 크기: 800px (너비 기준)
 * - 고품질
 */
export function optimizeForProductDetail(url: string): string {
  return optimizeCloudinaryUrl(url, {
    width: 800,
    crop: "fit",
    quality: "auto:good",
  });
}

/**
 * 리스트 이미지용 최적화
 * - 크기: 600x600
 * - 균형형 품질
 */
export function optimizeForList(url: string): string {
  return optimizeCloudinaryUrl(url, {
    width: 600,
    height: 600,
    crop: "fill",
    quality: "auto",
  });
}
