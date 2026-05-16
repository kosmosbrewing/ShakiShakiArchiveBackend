// server/routes/admin/category.routes.ts
// 관리자 카테고리 관리 라우트 (/api/admin/categories/*)

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import { insertCategorySchema } from "@shared/schema";
import { CATEGORY_MESSAGES } from "@shared/constants/messages";

const router = Router();
const updateCategorySchema = insertCategorySchema.partial();

// 카테고리 목록 조회 (관리자, 캐시 없음)
router.get("/", isAuthenticated, isAdmin, cacheStrategies.admin, asyncHandler(async (_req, res) => {
  const categories = await storage.getCategories();
  res.json(categories);
}));

// 카테고리 생성
router.post("/", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const validatedData = insertCategorySchema.parse(req.body);
  const category = await storage.createCategory(validatedData);
  res.json(category);
}));

// 카테고리 수정
router.patch("/:id", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const validatedData = updateCategorySchema.parse(req.body);
  const category = await storage.updateCategory(
    Number(req.params.id),
    validatedData
  );
  if (!category) {
    return res.status(404).json({ message: CATEGORY_MESSAGES.NOT_FOUND });
  }
  res.json(category);
}));

// 카테고리 삭제
router.delete("/:id", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  await storage.deleteCategory(Number(req.params.id));
  res.json({ message: CATEGORY_MESSAGES.DELETED });
}));

export default router;
