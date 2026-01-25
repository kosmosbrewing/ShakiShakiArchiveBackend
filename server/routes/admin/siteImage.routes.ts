// server/routes/admin/siteImage.routes.ts
// 관리자 사이트 이미지 관리 라우트 (/api/admin/site-images/*)
// Hero 이미지: 최대 3개, Marquee 이미지: 최대 6개

import { Router, Request, Response } from "express";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import { storage } from "../../storage";
import {
  createSiteImageSchema,
  updateSiteImageSchema,
  siteImageTypeEnum,
  type SiteImageType,
} from "@shared/schema";
import { z } from "zod";
import { IMAGE_MESSAGES } from "@shared/constants/messages";

const router = Router();

// 타입별 최대 이미지 개수
const MAX_IMAGES: Record<SiteImageType, number> = {
  hero: 3,
  marquee: 6,
};

// ------------------------------------------------------------------
// GET /api/admin/site-images
// 전체 이미지 목록 조회 (type 쿼리로 필터링 가능)
// ------------------------------------------------------------------
router.get(
  "/",
  isAuthenticated,
  isAdmin,
  cacheStrategies.admin,
  asyncHandler(async (req: Request, res: Response) => {
    const typeQuery = req.query.type as string | undefined;

    // type 파라미터 검증
    let type: SiteImageType | undefined;
    if (typeQuery) {
      if (!siteImageTypeEnum.includes(typeQuery as SiteImageType)) {
        return res.status(400).json({
          message: IMAGE_MESSAGES.INVALID_TYPE,
        });
      }
      type = typeQuery as SiteImageType;
    }

    const images = await storage.getSiteImages(type);

    res.json({
      images,
      limits: MAX_IMAGES,
    });
  })
);

// ------------------------------------------------------------------
// GET /api/admin/site-images/:id
// 특정 이미지 상세 조회
// ------------------------------------------------------------------
router.get(
  "/:id",
  isAuthenticated,
  isAdmin,
  cacheStrategies.admin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ message: IMAGE_MESSAGES.INVALID_ID });
    }

    const image = await storage.getSiteImage(id);
    if (!image) {
      return res.status(404).json({ message: IMAGE_MESSAGES.NOT_FOUND });
    }

    res.json(image);
  })
);

// ------------------------------------------------------------------
// POST /api/admin/site-images
// 새 이미지 추가 (Hero: 최대 3개, Marquee: 최대 6개)
// ------------------------------------------------------------------
router.post(
  "/",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const result = createSiteImageSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: IMAGE_MESSAGES.INVALID_INPUT,
        errors: result.error.errors,
      });
    }
    const data = result.data;

    // 현재 해당 타입 이미지 개수 확인
    const currentCount = await storage.countSiteImagesByType(data.type);
    const maxCount = MAX_IMAGES[data.type];

    if (currentCount >= maxCount) {
      return res.status(400).json({
        message: `${data.type} 이미지는 최대 ${maxCount}개까지만 등록할 수 있습니다. (현재: ${currentCount}개)`,
      });
    }

    const newImage = await storage.createSiteImage({
      type: data.type,
      imageUrl: data.imageUrl,
      linkUrl: data.linkUrl,
      displayOrder: data.displayOrder ?? currentCount,
      isActive: data.isActive ?? true,
    });

    res.status(201).json({
      message: IMAGE_MESSAGES.ADDED,
      image: newImage,
    });
  })
);

// ------------------------------------------------------------------
// PUT /api/admin/site-images/:id
// 이미지 정보 수정
// ------------------------------------------------------------------
router.put(
  "/:id",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ message: IMAGE_MESSAGES.INVALID_ID });
    }

    // 이미지 존재 여부 확인
    const existing = await storage.getSiteImage(id);
    if (!existing) {
      return res.status(404).json({ message: IMAGE_MESSAGES.NOT_FOUND });
    }

    const result = updateSiteImageSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: IMAGE_MESSAGES.INVALID_INPUT,
        errors: result.error.errors,
      });
    }
    const data = result.data;

    const updated = await storage.updateSiteImage(id, data);

    res.json({
      message: IMAGE_MESSAGES.UPDATED,
      image: updated,
    });
  })
);

// ------------------------------------------------------------------
// DELETE /api/admin/site-images/:id
// 이미지 삭제
// ------------------------------------------------------------------
router.delete(
  "/:id",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ message: IMAGE_MESSAGES.INVALID_ID });
    }

    // 이미지 존재 여부 확인
    const existing = await storage.getSiteImage(id);
    if (!existing) {
      return res.status(404).json({ message: IMAGE_MESSAGES.NOT_FOUND });
    }

    await storage.deleteSiteImage(id);

    res.json({ message: IMAGE_MESSAGES.DELETED });
  })
);

// ------------------------------------------------------------------
// PATCH /api/admin/site-images/reorder
// 이미지 순서 일괄 변경
// ------------------------------------------------------------------
const reorderSchema = z.object({
  type: z.enum(siteImageTypeEnum),
  imageIds: z.array(z.number()).min(1, "최소 1개 이상의 이미지 ID가 필요합니다."),
});

router.patch(
  "/reorder",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const result = reorderSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: IMAGE_MESSAGES.INVALID_INPUT,
        errors: result.error.errors,
      });
    }
    const { type, imageIds } = result.data;

    // 순서대로 displayOrder 업데이트
    const updatePromises = imageIds.map((id, index) =>
      storage.updateSiteImage(id, { displayOrder: index })
    );

    await Promise.all(updatePromises);

    // 업데이트된 목록 반환
    const images = await storage.getSiteImages(type);

    res.json({
      message: IMAGE_MESSAGES.ORDER_CHANGED,
      images,
    });
  })
);

export default router;
