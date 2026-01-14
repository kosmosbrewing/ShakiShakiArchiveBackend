// server/routes/admin/variant.routes.ts
// 관리자 상품 옵션/실측 관리 라우트

import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import {
  insertProductVariantSchema,
  insertProductSizeMeasurementSchema,
} from "@shared/schema";

const router = Router();

// UUID 유효성 검증 스키마
const uuidSchema = z.string().uuid("유효하지 않은 ID 형식입니다");

// UUID 검증 헬퍼 함수
const validateUuid = (id: string, fieldName: string) => {
  const result = uuidSchema.safeParse(id);
  if (!result.success) {
    return { valid: false, error: `유효하지 않은 ${fieldName} 형식입니다` };
  }
  return { valid: true, error: null };
};

// === 상품 옵션(variants) 관리 ===

// 상품별 옵션 조회 (UUID 기반)
router.get(
  "/products/:productId/variants",
  isAuthenticated,
  isAdmin,
  cacheStrategies.admin,
  asyncHandler(async (req, res) => {
    const validation = validateUuid(req.params.productId, "productId");
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    const variants = await storage.getProductVariants(req.params.productId);
    res.json(variants);
  })
);

// 상품 옵션 생성 (UUID 기반)
router.post(
  "/products/:productId/variants",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req, res) => {
    const validation = validateUuid(req.params.productId, "productId");
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    const validatedData = insertProductVariantSchema.parse({
      ...req.body,
      productId: req.params.productId,
    });
    const variant = await storage.createProductVariant(validatedData);
    res.json(variant);
  })
);

// 상품 옵션 수정 (UUID 기반)
router.patch(
  "/products/:productId/variants/:variantId",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req, res) => {
    const variantValidation = validateUuid(req.params.variantId, "variantId");
    if (!variantValidation.valid) {
      return res.status(400).json({ message: variantValidation.error });
    }

    const variant = await storage.updateProductVariant(
      req.params.variantId,
      req.body
    );
    if (!variant) {
      return res.status(404).json({ message: "Variant not found" });
    }
    res.json(variant);
  })
);

// 상품 옵션 삭제 (UUID 기반)
router.delete(
  "/products/:productId/variants/:variantId",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req, res) => {
    const variantValidation = validateUuid(req.params.variantId, "variantId");
    if (!variantValidation.valid) {
      return res.status(400).json({ message: variantValidation.error });
    }

    await storage.deleteProductVariant(req.params.variantId);
    res.json({ message: "Variant deleted" });
  })
);

// === 실측 정보(measurements) 관리 ===

// 옵션별 실측 정보 조회 (UUID 기반)
router.get(
  "/variants/:variantId/measurements",
  isAuthenticated,
  isAdmin,
  cacheStrategies.admin,
  asyncHandler(async (req, res) => {
    const validation = validateUuid(req.params.variantId, "variantId");
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    const measurements = await storage.getProductSizeMeasurements(
      req.params.variantId
    );
    res.json(measurements);
  })
);

// 실측 정보 생성 (UUID 기반)
router.post(
  "/variants/:variantId/measurements",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req, res) => {
    const validation = validateUuid(req.params.variantId, "variantId");
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    const validatedData = insertProductSizeMeasurementSchema.parse({
      ...req.body,
      productVariantId: req.params.variantId,
    });
    const measurement = await storage.createProductSizeMeasurement(
      validatedData
    );
    res.status(201).json(measurement);
  })
);

// 실측 정보 수정 (UUID 기반)
router.patch(
  "/measurements/:measurementId",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req, res) => {
    const validation = validateUuid(req.params.measurementId, "measurementId");
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    const measurement = await storage.updateProductSizeMeasurement(
      req.params.measurementId,
      req.body
    );
    if (!measurement) {
      return res.status(404).json({ message: "Measurement not found" });
    }
    res.json(measurement);
  })
);

// 실측 정보 삭제 (UUID 기반)
router.delete(
  "/measurements/:measurementId",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req, res) => {
    const validation = validateUuid(req.params.measurementId, "measurementId");
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    await storage.deleteProductSizeMeasurement(req.params.measurementId);
    res.json({ message: "Measurement deleted" });
  })
);

export default router;
