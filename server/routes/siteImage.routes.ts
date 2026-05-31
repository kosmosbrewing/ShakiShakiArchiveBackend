// server/routes/siteImage.routes.ts
// 사이트 이미지 공개 API (/api/site-images/*)
// 인증 없이 접근 가능 - 프론트엔드에서 Main, Hero, Marquee, Journal 이미지 조회용

import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../middleware/error.middleware";
import { cacheStrategies, etagMiddleware } from "../middleware";
import { siteImageTypeEnum, type SiteImageType } from "@shared/schema";
import { IMAGE_MESSAGES } from "@shared/constants/messages";

const router = Router();

// ------------------------------------------------------------------
// GET /api/site-images
// 활성화된 이미지 목록 조회 (type 쿼리로 필터링 가능)
// ------------------------------------------------------------------
router.get("/", etagMiddleware(), cacheStrategies.siteImages, asyncHandler(async (req: Request, res: Response) => {
  const typeQuery = req.query.type as string | undefined;

  // type 파라미터 검증
  let type: SiteImageType | undefined;
  if (typeQuery) {
    if (!siteImageTypeEnum.includes(typeQuery as SiteImageType)) {
      return res.status(400).json({
        message: IMAGE_MESSAGES.INVALID_SITE_IMAGE_TYPE,
      });
    }
    type = typeQuery as SiteImageType;
  }

  const allImages = await storage.getSiteImages(type);

  // 활성화된 이미지만 필터링
  const activeImages = allImages.filter((img) => img.isActive);

  res.json({
    images: activeImages,
  });
}));

// ------------------------------------------------------------------
// GET /api/site-images/main-desktop
// 메인 데스크톱 이미지만 조회 (활성화된 것만)
// legacy hero 타입은 관리자 Main PC 탭에서도 같이 표시하므로 공개 API에서도 같이 반환한다.
// ------------------------------------------------------------------
router.get("/main-desktop", etagMiddleware(), cacheStrategies.siteImages, asyncHandler(async (_req: Request, res: Response) => {
  const [heroImages, mainDesktopImages] = await Promise.all([
    storage.getSiteImages("hero"),
    storage.getSiteImages("main_desktop"),
  ]);

  const imagesById = new Map(
    [...heroImages, ...mainDesktopImages]
      .filter((img) => img.isActive)
      .map((img) => [img.id, img] as const)
  );

  const activeImages = Array.from(imagesById.values()).sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id - b.id
  );

  res.json({
    images: activeImages,
  });
}));

// ------------------------------------------------------------------
// GET /api/site-images/main-mobile
// 메인 모바일 이미지만 조회 (활성화된 것만)
// ------------------------------------------------------------------
router.get("/main-mobile", etagMiddleware(), cacheStrategies.siteImages, asyncHandler(async (_req: Request, res: Response) => {
  const images = await storage.getSiteImages("main_mobile");
  const activeImages = images.filter((img) => img.isActive);

  res.json({
    images: activeImages,
  });
}));

// ------------------------------------------------------------------
// GET /api/site-images/hero
// Hero 이미지만 조회 (활성화된 것만)
// ------------------------------------------------------------------
router.get("/hero", etagMiddleware(), cacheStrategies.siteImages, asyncHandler(async (_req: Request, res: Response) => {
  const images = await storage.getSiteImages("hero");
  const activeImages = images.filter((img) => img.isActive);

  res.json({
    images: activeImages,
  });
}));

// ------------------------------------------------------------------
// GET /api/site-images/marquee
// Marquee 이미지만 조회 (활성화된 것만)
// ------------------------------------------------------------------
router.get("/marquee", etagMiddleware(), cacheStrategies.siteImages, asyncHandler(async (_req: Request, res: Response) => {
  const images = await storage.getSiteImages("marquee");
  const activeImages = images.filter((img) => img.isActive);

  res.json({
    images: activeImages,
  });
}));

// ------------------------------------------------------------------
// GET /api/site-images/journal
// Journal 이미지만 조회 (활성화된 것만)
// ------------------------------------------------------------------
router.get("/journal", etagMiddleware(), cacheStrategies.siteImages, asyncHandler(async (_req: Request, res: Response) => {
  const images = await storage.getSiteImages("journal");
  const activeImages = images.filter((img) => img.isActive);

  res.json({
    images: activeImages,
  });
}));

export default router;
