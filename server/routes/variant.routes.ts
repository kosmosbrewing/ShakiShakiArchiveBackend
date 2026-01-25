// server/routes/variant.routes.ts
// 상품 옵션 실측 정보 공개 라우트 (/api/variants/*)

import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { asyncHandler } from "../middleware/error.middleware";
import { VALIDATION_MESSAGES } from "@shared/constants/messages";

const router = Router();

// UUID 유효성 검증 스키마
const uuidSchema = z.string().uuid("유효하지 않은 ID 형식입니다");

// 옵션별 실측 정보 조회 (UUID 기반)
router.get(
  "/:id/measurements",
  asyncHandler(async (req, res) => {
    // UUID 유효성 검증
    const parseResult = uuidSchema.safeParse(req.params.id);
    if (!parseResult.success) {
      return res.status(400).json({
        message: VALIDATION_MESSAGES.VARIANT_ID_FORMAT_INVALID,
        error: parseResult.error.errors[0].message,
      });
    }

    const measurements = await storage.getProductSizeMeasurements(
      req.params.id
    );
    res.json(measurements);
  })
);

export default router;
