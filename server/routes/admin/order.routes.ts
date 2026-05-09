// server/routes/admin/order.routes.ts
// 관리자 주문 관리 라우트 (/api/admin/orders/*, /api/admin/order-items/*)

import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import { ORDER_MESSAGES } from "@shared/constants/messages";
import { ORDER_STATUS_ENUM, ORDER_ITEM_STATUS } from "@shared/constants/order";

const router = Router();

// 관리자 주문 상태 수정 검증 스키마
const adminOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUS_ENUM),
  trackingNumber: z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().max(100).optional(),
  ),
});

// 관리자 아이템 상태 수정 검증 스키마
const adminItemStatusSchema = z.object({
  status: z.string().min(1),
  trackingNumber: z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().max(100).optional(),
  ),
  courierCompany: z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().max(50).optional(),
  ),
});

// 전체 주문 목록 조회 (관리자, 페이지네이션 지원)
router.get("/orders", isAuthenticated, isAdmin, cacheStrategies.admin, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 200));

  const { orders, total } = await storage.getAllOrdersWithItems({ page, limit });

  const totalPages = Math.ceil(total / limit);

  res.json({
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}));

// 주문 상태 수정 (관리자, UUID 기반)
router.patch("/orders/:id", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const validation = adminOrderStatusSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "유효하지 않은 요청입니다.", errors: validation.error.errors });
  }

  const { status, trackingNumber } = validation.data;
  const order = await storage.updateOrderStatus(
    req.params.id,
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
  const validation = adminItemStatusSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "유효하지 않은 요청입니다.", errors: validation.error.errors });
  }

  const { trackingNumber, courierCompany } = validation.data;
  let { status } = validation.data;
  const itemId = Number(req.params.id);
  if (isNaN(itemId)) {
    return res.status(400).json({ message: "유효하지 않은 아이템 ID입니다." });
  }

  if (status === ORDER_ITEM_STATUS.PREPARING && trackingNumber?.trim()) {
    status = ORDER_ITEM_STATUS.SHIPPED;
  }

  const item = await storage.updateOrderItemStatus(
    itemId,
    status,
    trackingNumber,
    courierCompany
  );
  if (!item) {
    return res.status(404).json({ message: ORDER_MESSAGES.ITEM_NOT_FOUND });
  }

  // 아이템 상태가 delivered 또는 최종 상태로 변경되면 부모 주문 동기화
  const syncStatuses = [
    ORDER_ITEM_STATUS.DELIVERED,
    ORDER_ITEM_STATUS.PURCHASE_CONFIRMED,
    ORDER_ITEM_STATUS.REFUNDED,
    ORDER_ITEM_STATUS.CANCELLED,
  ];
  if ((syncStatuses as readonly string[]).includes(status)) {
    await storage.syncOrderStatusFromItems(item.orderId);
  }

  res.json(item);
}));

export default router;
