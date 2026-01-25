// server/routes/admin/order.routes.ts
// 관리자 주문 관리 라우트 (/api/admin/orders/*, /api/admin/order-items/*)

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import { ORDER_MESSAGES } from "@shared/constants/messages";

const router = Router();

// 전체 주문 목록 조회 (관리자)
router.get("/orders", isAuthenticated, isAdmin, cacheStrategies.admin, asyncHandler(async (req, res) => {
  const orders = await storage.getAllOrdersWithItems();
  res.json(orders);
}));

// 주문 상태 수정 (관리자, UUID 기반)
router.patch("/orders/:id", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const { status, trackingNumber } = req.body;
  const order = await storage.updateOrderStatus(
    req.params.id, // UUID 문자열
    status,
    trackingNumber
  );
  if (!order) {
    return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
  }
  res.json(order);
}));

// 주문 아이템 상태 수정 (관리자)
router.patch("/order-items/:id", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const { status, trackingNumber, courierCompany } = req.body;
  const item = await storage.updateOrderItemStatus(
    Number(req.params.id),
    status,
    trackingNumber,
    courierCompany
  );
  if (!item) {
    return res.status(404).json({ message: ORDER_MESSAGES.ITEM_NOT_FOUND });
  }
  res.json(item);
}));

export default router;
