// server/routes/cart.routes.ts
// 장바구니 관련 라우트 (/api/cart/*)

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { cacheStrategies } from "../middleware";
import { insertCartItemSchema } from "@shared/schema";
import { CART_MESSAGES } from "@shared/constants/messages";

const router = Router();

// 장바구니 조회
router.get("/", isAuthenticated, cacheStrategies.private, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const cartItems = await storage.getCartItems(userId);
  res.json(cartItems);
}));

// 장바구니 추가
router.post("/", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const validatedData = insertCartItemSchema.parse({
    ...req.body,
    userId,
  });

  if (!validatedData.variantId) {
    return res.status(400).json({
      message: "상품 옵션을 선택해주세요.",
      code: "VARIANT_REQUIRED",
    });
  }

  const cartItem = await storage.addCartItem(validatedData);
  res.json(cartItem);
}));

// 장바구니 수량 변경 (UUID 기반)
router.patch("/:id", isAuthenticated, asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  if (typeof quantity !== "number" || quantity < 1) {
    return res.status(400).json({ message: CART_MESSAGES.INVALID_QUANTITY });
  }
  const cartItem = await storage.updateCartItem(
    req.params.id, // UUID 문자열
    quantity
  );
  if (!cartItem) {
    return res.status(404).json({ message: CART_MESSAGES.ITEM_NOT_FOUND });
  }
  res.json(cartItem);
}));

// 장바구니 아이템 삭제 (UUID 기반)
router.delete("/:id", isAuthenticated, asyncHandler(async (req, res) => {
  await storage.deleteCartItem(req.params.id); // UUID 문자열
  res.json({ message: CART_MESSAGES.ITEM_DELETED });
}));

export default router;
