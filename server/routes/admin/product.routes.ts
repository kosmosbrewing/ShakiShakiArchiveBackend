// server/routes/admin/product.routes.ts
// 관리자 상품 관리 라우트 (/api/admin/products/*)

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { insertProductSchema } from "@shared/schema";

const router = Router();

// 상품 목록 조회 (관리자)
router.get("/", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const products = await storage.getProducts();
    res.json(products);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "상품 목록 조회 실패";
    res.status(500).json({ message });
  }
});

// 상품 생성
router.post("/", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const validatedData = insertProductSchema.parse(req.body);
    const product = await storage.createProduct(validatedData);
    res.json(product);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "상품 생성 실패";
    res.status(400).json({ message });
  }
});

// 상품 수정 (UUID 기반)
router.patch("/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const product = await storage.updateProduct(
      req.params.id, // UUID 문자열
      req.body
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "상품 수정 실패";
    res.status(500).json({ message });
  }
});

// 상품 삭제 (UUID 기반)
router.delete("/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    await storage.deleteProduct(req.params.id); // UUID 문자열
    res.json({ message: "Product deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "상품 삭제 실패";
    res.status(500).json({ message });
  }
});

export default router;
