// server/config/cloudinary.ts
// Cloudinary 설정 및 multer 업로드 미들웨어

import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { Request } from "express";

// 환경 변수 검증 (선택적 - 이미지 업로드 기능 사용 시에만 필요)
const isCloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

// Cloudinary 설정
if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// 허용되는 이미지 타입
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// 최대 파일 크기 (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// multer 메모리 스토리지 설정 (Cloudinary로 스트림 업로드)
const storage = multer.memoryStorage();

// 파일 필터 (이미지만 허용)
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("지원하지 않는 이미지 형식입니다. (JPEG, PNG, GIF, WebP만 허용)"));
  }
};

// multer 인스턴스 생성
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10, // 최대 10개 파일 동시 업로드
  },
});

// Cloudinary 업로드 옵션 타입
interface UploadOptions {
  folder?: string; // Cloudinary 폴더 경로
  transformation?: Record<string, unknown>; // 이미지 변환 옵션
  publicId?: string; // 커스텀 파일 ID
}

// Cloudinary에 버퍼 업로드 함수
export const uploadToCloudinary = (
  buffer: Buffer,
  options: UploadOptions = {}
): Promise<{ url: string; publicId: string; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured) {
      return reject(new Error("Cloudinary가 설정되지 않았습니다."));
    }

    const uploadOptions: Record<string, unknown> = {
      folder: options.folder || "shakishaki/products",
      resource_type: "image",
      // 기본 이미지 최적화
      transformation: options.transformation || [
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ],
    };

    if (options.publicId) {
      uploadOptions.public_id = options.publicId;
    }

    // 버퍼를 스트림으로 변환하여 업로드
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          return reject(new Error(`Cloudinary 업로드 실패: ${error.message}`));
        }
        if (!result) {
          return reject(new Error("Cloudinary 업로드 응답이 없습니다."));
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      }
    );

    uploadStream.end(buffer);
  });
};

// Cloudinary 이미지 삭제 함수
export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  if (!isCloudinaryConfigured) {
    throw new Error("Cloudinary가 설정되지 않았습니다.");
  }

  await cloudinary.uploader.destroy(publicId);
};

// 여러 이미지 삭제 함수
export const deleteMultipleFromCloudinary = async (
  publicIds: string[]
): Promise<void> => {
  if (!isCloudinaryConfigured) {
    throw new Error("Cloudinary가 설정되지 않았습니다.");
  }

  if (publicIds.length === 0) return;

  await cloudinary.api.delete_resources(publicIds);
};

export { cloudinary, isCloudinaryConfigured };
