// server/routes/wishlist.routes.ts
// 위시리스트 관련 라우트 (/api/wishlist/*)

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";

const router = Router();

// 위시리스트 목록 조회
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const items = await storage.getWishlistItems(userId);
    res.json(items);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "위시리스트 조회 실패";
    res.status(500).json({ message });
  }
});

// 위시리스트 추가 (UUID 기반)
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    const item = await storage.addWishlistItem(userId, productId); // UUID 문자열
    res.status(201).json(item);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "위시리스트 추가 실패";
    res.status(500).json({ message });
  }
});

// 위시리스트 삭제 (UUID 기반)
router.delete("/:productId", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const productId = req.params.productId; // UUID 문자열

    await storage.deleteWishlistItem(userId, productId);
    res.json({ message: "Removed from wishlist" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "위시리스트 삭제 실패";
    res.status(500).json({ message });
  }
});

export default router;
