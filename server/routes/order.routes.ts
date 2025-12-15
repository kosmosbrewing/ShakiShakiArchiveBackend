// server/routes/order.routes.ts
// 주문 관련 라우트 (/api/orders/*)

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { insertOrderSchema } from "@shared/schema";
import type { OrderItemCreateData } from "../types";

const router = Router();

// 주문 생성
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;

    // 장바구니 아이템 조회
    const cartItems = await storage.getCartItems(userId);

    if (cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // 총 결제 금액 계산
    const totalAmount = cartItems.reduce(
      (sum, item) => sum + parseFloat(item.product.price) * item.quantity,
      0
    );

    // 주문 데이터 생성
    const orderData = insertOrderSchema.parse({
      userId,
      totalAmount: totalAmount.toString(),
      status: "pending_payment",
      shippingName: req.body.shippingName,
      shippingPhone: req.body.shippingPhone,
      shippingAddress: req.body.shippingAddress,
      shippingPostalCode: req.body.shippingPostalCode,
    });

    // 주문 아이템 데이터 생성 (타입 안전성 강화)
    const orderItemsData: OrderItemCreateData[] = cartItems.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      productPrice: item.product.price,
      quantity: item.quantity,
      options: item.variant ? `Size: ${item.variant.size}` : null,
    }));

    // 주문 생성 (트랜잭션 적용됨)
    const orderId = await storage.createOrder(orderData, orderItemsData);

    // 장바구니 비우기
    await storage.clearCart(userId);

    res.json({ orderId });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "주문 생성 실패";
    res.status(500).json({ message });
  }
});

// 주문 목록 조회
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const orders = await storage.getOrders(userId);
    res.json(orders);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "주문 목록 조회 실패";
    res.status(500).json({ message });
  }
});

// 주문 상세 조회
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const order = await storage.getOrder(Number(req.params.id));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 본인 주문 확인
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (order.userId !== userId && !user?.isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json(order);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "주문 조회 실패";
    res.status(500).json({ message });
  }
});

export default router;
