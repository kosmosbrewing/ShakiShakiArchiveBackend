// server/routes/admin/analytics.routes.ts
// 관리자 통계 라우트 (/api/admin/analytics/*)

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import { getVisitorStatsFromGa4 } from "../../services/ga4.service";

const router = Router();

/**
 * 통계 개요 조회
 * GET /api/admin/analytics/overview
 */
router.get(
  "/overview",
  isAuthenticated,
  isAdmin,
  cacheStrategies.admin,
  asyncHandler(async (_req, res) => {
    const [visitors, productViews] = await Promise.all([
      getVisitorStatsFromGa4(),
      storage.getProductViewStats(10),
    ]);

    res.json({
      visitors,
      productViews,
      generatedAt: new Date().toISOString(),
    });
  }),
);

export default router;
