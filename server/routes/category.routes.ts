// server/routes/category.routes.ts
// 카테고리 관련 공개 라우트 (/api/categories)

import { Router } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../middleware/error.middleware";
import { cacheStrategies, etagMiddleware } from "../middleware";
import { createLogger } from "../utils/logger";

const router = Router();
const logger = createLogger("Category");

// 카테고리 목록 조회
router.get("/", etagMiddleware(), cacheStrategies.staticData, asyncHandler(async (req, res) => {
  const categories = await storage.getCategories();
  res.json(categories);
}));

export default router;
