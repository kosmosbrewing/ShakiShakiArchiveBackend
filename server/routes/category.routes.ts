// server/routes/category.routes.ts
// 카테고리 관련 공개 라우트 (/api/categories)

import { Router } from "express";
import { storage } from "../storage";

const router = Router();

// 카테고리 목록 조회
router.get("/", async (req, res) => {
  try {
    const categories = await storage.getCategories();
    res.json(categories);
  } catch (error: unknown) {
    console.error("Error fetching categories:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch categories";
    res.status(500).json({ message });
  }
});

export default router;
