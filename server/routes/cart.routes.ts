// server/routes/cart.routes.ts
// 장바구니 관련 라우트 (/api/cart/*)

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { insertCartItemSchema } from "@shared/schema";

const router = Router();

// 장바구니 조회
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const cartItems = await storage.getCartItems(userId);
    res.json(cartItems);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "장바구니 조회 실패";
    res.status(500).json({ message });
  }
});

// 장바구니 추가
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const validatedData = insertCartItemSchema.parse({
      ...req.body,
      userId,
    });
    const cartItem = await storage.addCartItem(validatedData);
    res.json(cartItem);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "장바구니 추가 실패";
    res.status(400).json({ message });
  }
});

// 장바구니 수량 변경
router.patch("/:id", isAuthenticated, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (typeof quantity !== "number" || quantity < 1) {
      return res.status(400).json({ message: "Invalid quantity" });
    }
    const cartItem = await storage.updateCartItem(
      Number(req.params.id),
      quantity
    );
    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }
    res.json(cartItem);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "수량 변경 실패";
    res.status(500).json({ message });
  }
});

// 장바구니 아이템 삭제
router.delete("/:id", isAuthenticated, async (req, res) => {
  try {
    await storage.deleteCartItem(Number(req.params.id));
    res.json({ message: "Cart item deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "삭제 실패";
    res.status(500).json({ message });
  }
});

export default router;
