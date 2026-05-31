// server/routes/admin/order.routes.ts
// 관리자 주문 관리 라우트 (/api/admin/orders/*, /api/admin/order-items/*)

import { Router, type Request } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import { ORDER_MESSAGES } from "@shared/constants/messages";
import { ORDER_STATUS_ENUM, ORDER_ITEM_STATUS } from "@shared/constants/order";
import { createLogger } from "../../utils/logger";

const router = Router();
const logger = createLogger("AdminOrder");
const FRESH_ADMIN_2FA_MS = 5 * 60 * 1000;

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
  statusChangeReason: z.string().trim().min(2).max(500).optional(),
  trackingNumber: z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().max(100).optional(),
  ),
  courierCompany: z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().max(50).optional(),
  ),
});

const manualRefundSchema = z.object({
  reason: z.string().trim().min(2).max(500),
});

const MANUAL_REFUND_ALLOWED_STATUSES = new Set<string>([
  ORDER_ITEM_STATUS.SHIPPED,
]);

const ROUTINE_STATUS_TRANSITIONS = new Set([
  `${ORDER_ITEM_STATUS.PAYMENT_CONFIRMED}->${ORDER_ITEM_STATUS.PREPARING}`,
  `${ORDER_ITEM_STATUS.PREPARING}->${ORDER_ITEM_STATUS.SHIPPED}`,
  `${ORDER_ITEM_STATUS.SHIPPED}->${ORDER_ITEM_STATUS.DELIVERED}`,
  `${ORDER_ITEM_STATUS.RETURN_REQUESTED}->${ORDER_ITEM_STATUS.RETURN_RECEIVED}`,
]);

function hasFreshAdmin2FA(req: Request): boolean {
  const verifiedAt = req.session?.admin2faVerifiedAt;
  if (!verifiedAt) return false;

  const verifiedAtMs = Date.parse(verifiedAt);
  return Number.isFinite(verifiedAtMs) && Date.now() - verifiedAtMs <= FRESH_ADMIN_2FA_MS;
}

function isRiskStatusTransition(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) return false;
  return !ROUTINE_STATUS_TRANSITIONS.has(`${fromStatus}->${toStatus}`);
}

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

  const { trackingNumber, courierCompany, statusChangeReason } = validation.data;
  let { status } = validation.data;
  const itemId = Number(req.params.id);
  if (isNaN(itemId)) {
    return res.status(400).json({ message: "유효하지 않은 아이템 ID입니다." });
  }

  const currentItem = await storage.getOrderItemById(itemId);
  if (!currentItem) {
    return res.status(404).json({ message: ORDER_MESSAGES.ITEM_NOT_FOUND });
  }

  if (
    currentItem.status === ORDER_ITEM_STATUS.PREPARING &&
    status === ORDER_ITEM_STATUS.PREPARING &&
    trackingNumber?.trim()
  ) {
    status = ORDER_ITEM_STATUS.SHIPPED;
  }

  if (isRiskStatusTransition(currentItem.status, status)) {
    if (!hasFreshAdmin2FA(req)) {
      return res.status(403).json({
        message: "위험 상태 변경은 최근 관리자 2차 인증이 필요합니다.",
        code: "ADMIN_FRESH_2FA_REQUIRED",
      });
    }

    if (!statusChangeReason) {
      return res.status(400).json({
        message: "위험 상태 변경 사유를 입력해주세요.",
        code: "STATUS_CHANGE_REASON_REQUIRED",
      });
    }

    logger.warn("관리자 위험 상태 변경", {
      adminUserId: req.session.userId,
      orderItemId: itemId,
      fromStatus: currentItem.status,
      toStatus: status,
      statusChangeReason,
    });
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

// 관리자 수기환불 처리 (PG 취소 호출 없음, DB 스키마 변경 없음)
router.post("/order-items/:id/manual-refund", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const validation = manualRefundSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "유효하지 않은 요청입니다.", errors: validation.error.errors });
  }

  if (!hasFreshAdmin2FA(req)) {
    return res.status(403).json({
      message: "수기환불 처리는 최근 관리자 2차 인증이 필요합니다.",
      code: "ADMIN_FRESH_2FA_REQUIRED",
    });
  }

  const itemId = Number(req.params.id);
  if (isNaN(itemId)) {
    return res.status(400).json({ message: "유효하지 않은 아이템 ID입니다." });
  }

  const item = await storage.getOrderItemById(itemId);
  if (!item) {
    return res.status(404).json({ message: ORDER_MESSAGES.ITEM_NOT_FOUND });
  }

  if (!MANUAL_REFUND_ALLOWED_STATUSES.has(item.status)) {
    return res.status(400).json({
      message: "수기환불은 배송중 상품만 처리할 수 있습니다.",
      code: "MANUAL_REFUND_STATUS_NOT_ALLOWED",
    });
  }

  const { reason } = validation.data;
  const refundAmount = Math.round(Number(item.productPrice || 0) * Number(item.quantity || 1));
  if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
    return res.status(400).json({
      message: "수기환불 금액을 계산할 수 없습니다.",
      code: "MANUAL_REFUND_AMOUNT_INVALID",
    });
  }

  const cancelReason = "별도 환불 처리 완료";

  await storage.manualRefundOrderItem({
    orderId: item.orderId,
    orderItemId: itemId,
    refundAmount,
    cancelReason,
  });

  const order = await storage.getOrder(item.orderId);

  logger.warn("관리자 수기환불 처리", {
    adminUserId: req.session.userId,
    orderId: item.orderId,
    orderItemId: itemId,
    refundAmount,
    reason,
  });

  res.json({
    message: "수기환불 처리 완료",
    order,
  });
}));

export default router;
