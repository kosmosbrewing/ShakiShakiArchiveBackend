// server/routes/admin/category.routes.ts
// 관리자 카테고리 관리 라우트 (/api/admin/categories/*)

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { insertCategorySchema } from "@shared/schema";

const router = Router();

// 카테고리 생성
router.post("/", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const validatedData = insertCategorySchema.parse(req.body);
  const category = await storage.createCategory(validatedData);
  res.json(category);
}));

// 카테고리 수정
router.patch("/:id", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const category = await storage.updateCategory(
    Number(req.params.id),
    req.body
  );
  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }
  res.json(category);
}));

// 카테고리 삭제
router.delete("/:id", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  await storage.deleteCategory(Number(req.params.id));
  res.json({ message: "Category deleted" });
}));

export default router;
