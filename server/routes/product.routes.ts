// server/routes/product.routes.ts
// 상품 관련 공개 라우트 (/api/products/*)

import { Router } from "express";
import { storage } from "../storage";

const router = Router();

// 상품 목록 조회
router.get("/", async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const categoryIdParam = req.query.categoryId as string | undefined;
    const categoryId = categoryIdParam ? Number(categoryIdParam) : undefined;
    const products = await storage.getProducts({ search, categoryId });
    res.json(products);
  } catch (error: unknown) {
    console.error("Error fetching products:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch products";
    res.status(500).json({ message });
  }
});

// 상품 상세 조회
router.get("/:id", async (req, res) => {
  try {
    const product = await storage.getProduct(Number(req.params.id));
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "상품 조회 실패";
    res.status(500).json({ message });
  }
});

// 상품 옵션(variants) 조회
router.get("/:id/variants", async (req, res) => {
  try {
    const variants = await storage.getProductVariants(Number(req.params.id));
    res.json(variants);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "옵션 조회 실패";
    res.status(500).json({ message });
  }
});

export default router;
