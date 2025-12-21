// server/routes/admin/siteImage.routes.ts
// 관리자 사이트 이미지 관리 라우트 (/api/admin/site-images/*)
// Hero 이미지: 최대 3개, Marquee 이미지: 최대 6개

import { Router, Request, Response } from "express";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { storage } from "../../storage";
import {
  createSiteImageSchema,
  updateSiteImageSchema,
  siteImageTypeEnum,
  type SiteImageType,
} from "@shared/schema";
import { z } from "zod";

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
  async (req: Request, res: Response) => {
    try {
      const typeQuery = req.query.type as string | undefined;

      // type 파라미터 검증
      let type: SiteImageType | undefined;
      if (typeQuery) {
        if (!siteImageTypeEnum.includes(typeQuery as SiteImageType)) {
          return res.status(400).json({
            message: "유효하지 않은 이미지 타입입니다. (hero 또는 marquee)",
          });
        }
        type = typeQuery as SiteImageType;
      }

      const images = await storage.getSiteImages(type);

      res.json({
        images,
        limits: MAX_IMAGES,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "이미지 목록 조회 실패";
      res.status(500).json({ message });
    }
  }
);

// ------------------------------------------------------------------
// GET /api/admin/site-images/:id
// 특정 이미지 상세 조회
// ------------------------------------------------------------------
router.get(
  "/:id",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "유효하지 않은 이미지 ID입니다." });
      }

      const image = await storage.getSiteImage(id);
      if (!image) {
        return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
      }

      res.json(image);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "이미지 조회 실패";
      res.status(500).json({ message });
    }
  }
);

// ------------------------------------------------------------------
// POST /api/admin/site-images
// 새 이미지 추가 (Hero: 최대 3개, Marquee: 최대 6개)
// ------------------------------------------------------------------
router.post(
  "/",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      const data = createSiteImageSchema.parse(req.body);

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
        message: "이미지가 추가되었습니다.",
        image: newImage,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "입력값이 유효하지 않습니다.",
          errors: error.errors,
        });
      }
      const message =
        error instanceof Error ? error.message : "이미지 추가 실패";
      res.status(500).json({ message });
    }
  }
);

// ------------------------------------------------------------------
// PUT /api/admin/site-images/:id
// 이미지 정보 수정
// ------------------------------------------------------------------
router.put(
  "/:id",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "유효하지 않은 이미지 ID입니다." });
      }

      // 이미지 존재 여부 확인
      const existing = await storage.getSiteImage(id);
      if (!existing) {
        return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
      }

      const data = updateSiteImageSchema.parse(req.body);

      const updated = await storage.updateSiteImage(id, data);

      res.json({
        message: "이미지가 수정되었습니다.",
        image: updated,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "입력값이 유효하지 않습니다.",
          errors: error.errors,
        });
      }
      const message =
        error instanceof Error ? error.message : "이미지 수정 실패";
      res.status(500).json({ message });
    }
  }
);

// ------------------------------------------------------------------
// DELETE /api/admin/site-images/:id
// 이미지 삭제
// ------------------------------------------------------------------
router.delete(
  "/:id",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "유효하지 않은 이미지 ID입니다." });
      }

      // 이미지 존재 여부 확인
      const existing = await storage.getSiteImage(id);
      if (!existing) {
        return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
      }

      await storage.deleteSiteImage(id);

      res.json({ message: "이미지가 삭제되었습니다." });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "이미지 삭제 실패";
      res.status(500).json({ message });
    }
  }
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
  async (req: Request, res: Response) => {
    try {
      const { type, imageIds } = reorderSchema.parse(req.body);

      // 순서대로 displayOrder 업데이트
      const updatePromises = imageIds.map((id, index) =>
        storage.updateSiteImage(id, { displayOrder: index })
      );

      await Promise.all(updatePromises);

      // 업데이트된 목록 반환
      const images = await storage.getSiteImages(type);

      res.json({
        message: "이미지 순서가 변경되었습니다.",
        images,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "입력값이 유효하지 않습니다.",
          errors: error.errors,
        });
      }
      const message =
        error instanceof Error ? error.message : "순서 변경 실패";
      res.status(500).json({ message });
    }
  }
);

export default router;
