// server/routes/variant.routes.ts
// 상품 옵션 실측 정보 공개 라우트 (/api/variants/*)

import { Router } from "express";
import { storage } from "../storage";

const router = Router();

// 옵션별 실측 정보 조회
router.get("/:id/measurements", async (req, res) => {
  try {
    const measurements = await storage.getProductSizeMeasurements(
      Number(req.params.id)
    );
    res.json(measurements);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "실측 정보 조회 실패";
    res.status(500).json({ message });
  }
});

export default router;
