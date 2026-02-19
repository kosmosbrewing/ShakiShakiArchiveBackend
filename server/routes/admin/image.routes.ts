// server/routes/admin/image.routes.ts
// 관리자 이미지 업로드 라우트 (/api/admin/images/*)

import { Router, Request, Response } from "express";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import {
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  isCloudinaryConfigured,
} from "../../config/cloudinary";
import { z } from "zod";
import { IMAGE_MESSAGES } from "@shared/constants/messages";

const router = Router();

// 이미지 업로드 응답 타입
interface UploadedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

/**
 * slug 기반 Cloudinary public_id 생성
 * - productSlug가 없으면 undefined 반환 (Cloudinary 자동 생성)
 * - 영소문자·숫자·하이픈만 허용 (최대 50자)
 * - 동일 slug 중복 방지를 위해 타임스탬프 + 인덱스 suffix 추가
 */
function buildPublicId(productSlug: unknown, suffix: string): string | undefined {
  if (!productSlug || typeof productSlug !== "string") return undefined;
  const cleanSlug = productSlug.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 50);
  // 영숫자가 하나도 없으면 (한국어 slug 등) Cloudinary 자동 생성으로 fallback
  if (!cleanSlug || !/[a-z0-9]/.test(cleanSlug)) return undefined;
  return `${cleanSlug}-${suffix}-${Date.now()}`;
}

// 삭제 요청 스키마
const deleteImageSchema = z.object({
  publicId: z.string().min(1, "publicId가 필요합니다"),
});

const deleteMultipleSchema = z.object({
  publicIds: z.array(z.string()).min(1, "삭제할 이미지가 없습니다"),
});

// Cloudinary 설정 확인 미들웨어
const checkCloudinaryConfig = (req: Request, res: Response, next: Function) => {
  if (!isCloudinaryConfigured) {
    return res.status(503).json({
      message: IMAGE_MESSAGES.SERVICE_NOT_CONFIGURED,
      error: "CLOUDINARY_NOT_CONFIGURED",
    });
  }
  next();
};

// 단일 상품 이미지 업로드
// POST /api/admin/images/product
router.post(
  "/product",
  isAuthenticated,
  isAdmin,
  checkCloudinaryConfig,
  upload.single("image"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: IMAGE_MESSAGES.FILE_REQUIRED });
    }

    const result = await uploadToCloudinary(req.file.buffer, {
      folder: "shakishaki/products",
      publicId: buildPublicId(req.body.productSlug, "main"),
    });

    res.json({
      message: IMAGE_MESSAGES.UPLOAD_SUCCESS,
      image: result,
    });
  })
);

// 여러 상품 이미지 업로드 (최대 10개)
// POST /api/admin/images/products
router.post(
  "/products",
  isAuthenticated,
  isAdmin,
  checkCloudinaryConfig,
  upload.array("images", 10),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ message: IMAGE_MESSAGES.FILE_REQUIRED });
    }

    // 병렬로 모든 이미지 업로드 (중복 방지: 인덱스를 suffix에 포함)
    const uploadPromises = files.map((file, i) =>
      uploadToCloudinary(file.buffer, {
        folder: "shakishaki/products",
        publicId: buildPublicId(req.body.productSlug, String(i + 1)),
      })
    );

    const results = await Promise.all(uploadPromises);

    res.json({
      message: `${results.length}개 이미지 업로드 성공`,
      images: results,
    });
  })
);

// 상품 상세 이미지 업로드 (최대 10개)
// POST /api/admin/images/product-details
router.post(
  "/product-details",
  isAuthenticated,
  isAdmin,
  checkCloudinaryConfig,
  upload.array("images", 10),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ message: IMAGE_MESSAGES.FILE_REQUIRED });
    }

    // 병렬로 모든 이미지 업로드 (상세 이미지용 폴더, 인덱스 포함)
    const uploadPromises = files.map((file, i) =>
      uploadToCloudinary(file.buffer, {
        folder: "shakishaki/products/details",
        publicId: buildPublicId(req.body.productSlug, `detail-${i + 1}`),
      })
    );

    const results = await Promise.all(uploadPromises);

    res.json({
      message: `${results.length}개 상세 이미지 업로드 성공`,
      images: results,
    });
  })
);

// 단일 이미지 삭제
// DELETE /api/admin/images
router.delete(
  "/",
  isAuthenticated,
  isAdmin,
  checkCloudinaryConfig,
  asyncHandler(async (req: Request, res: Response) => {
    const { publicId } = deleteImageSchema.parse(req.body);

    await deleteFromCloudinary(publicId);

    res.json({ message: IMAGE_MESSAGES.DELETE_SUCCESS });
  })
);

// 여러 이미지 삭제
// DELETE /api/admin/images/bulk
router.delete(
  "/bulk",
  isAuthenticated,
  isAdmin,
  checkCloudinaryConfig,
  asyncHandler(async (req: Request, res: Response) => {
    const { publicIds } = deleteMultipleSchema.parse(req.body);

    await deleteMultipleFromCloudinary(publicIds);

    res.json({
      message: `${publicIds.length}개 이미지 삭제 성공`,
    });
  })
);

export default router;
