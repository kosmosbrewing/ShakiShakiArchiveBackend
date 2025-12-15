// server/routes/admin/variant.routes.ts
// 관리자 상품 옵션/실측 관리 라우트

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import {
  insertProductVariantSchema,
  insertProductSizeMeasurementSchema,
} from "@shared/schema";

const router = Router();

// === 상품 옵션(variants) 관리 ===

// 상품별 옵션 조회
router.get(
  "/products/:productId/variants",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      const variants = await storage.getProductVariants(
        Number(req.params.productId)
      );
      res.json(variants);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "옵션 조회 실패";
      res.status(500).json({ message });
    }
  }
);

// 상품 옵션 생성
router.post(
  "/products/:productId/variants",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      const validatedData = insertProductVariantSchema.parse({
        ...req.body,
        productId: Number(req.params.productId),
      });
      const variant = await storage.createProductVariant(validatedData);
      res.json(variant);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "옵션 생성 실패";
      res.status(400).json({ message });
    }
  }
);

// 상품 옵션 수정
router.patch(
  "/products/:productId/variants/:variantId",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      const variant = await storage.updateProductVariant(
        Number(req.params.variantId),
        req.body
      );
      if (!variant) {
        return res.status(404).json({ message: "Variant not found" });
      }
      res.json(variant);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "옵션 수정 실패";
      res.status(400).json({ message });
    }
  }
);

// 상품 옵션 삭제
router.delete(
  "/products/:productId/variants/:variantId",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      await storage.deleteProductVariant(Number(req.params.variantId));
      res.json({ message: "Variant deleted" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "옵션 삭제 실패";
      res.status(500).json({ message });
    }
  }
);

// === 실측 정보(measurements) 관리 ===

// 옵션별 실측 정보 조회
router.get(
  "/variants/:variantId/measurements",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      const measurements = await storage.getProductSizeMeasurements(
        Number(req.params.variantId)
      );
      res.json(measurements);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "실측 정보 조회 실패";
      res.status(500).json({ message });
    }
  }
);

// 실측 정보 생성
router.post(
  "/variants/:variantId/measurements",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      const validatedData = insertProductSizeMeasurementSchema.parse({
        ...req.body,
        productVariantId: Number(req.params.variantId),
      });
      const measurement = await storage.createProductSizeMeasurement(
        validatedData
      );
      res.status(201).json(measurement);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "실측 정보 생성 실패";
      res.status(400).json({ message });
    }
  }
);

// 실측 정보 수정
router.patch(
  "/measurements/:measurementId",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      const measurement = await storage.updateProductSizeMeasurement(
        Number(req.params.measurementId),
        req.body
      );
      if (!measurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }
      res.json(measurement);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "실측 정보 수정 실패";
      res.status(400).json({ message });
    }
  }
);

// 실측 정보 삭제
router.delete(
  "/measurements/:measurementId",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      await storage.deleteProductSizeMeasurement(
        Number(req.params.measurementId)
      );
      res.json({ message: "Measurement deleted" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "실측 정보 삭제 실패";
      res.status(500).json({ message });
    }
  }
);

export default router;
