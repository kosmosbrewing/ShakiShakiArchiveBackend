// server/routes/wishlist.routes.ts
// 위시리스트 관련 라우트 (/api/wishlist/*)

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { cacheStrategies } from "../middleware";

const router = Router();

// 위시리스트 목록 조회
router.get("/", isAuthenticated, cacheStrategies.userDependent, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const items = await storage.getWishlistItems(userId);
  res.json(items);
}));

// 위시리스트 추가 (UUID 기반)
router.post("/", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ message: "Product ID is required" });
  }

  const item = await storage.addWishlistItem(userId, productId); // UUID 문자열
  res.status(201).json(item);
}));

// 위시리스트 삭제 (UUID 기반)
router.delete("/:productId", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const productId = req.params.productId; // UUID 문자열

  await storage.deleteWishlistItem(userId, productId);
  res.json({ message: "Removed from wishlist" });
}));

export default router;
