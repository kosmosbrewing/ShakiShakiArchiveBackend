// server/routes/payment.routes.ts
// 토스페이먼츠 결제 라우트

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { paymentRateLimiter } from "../config/security";
import { config } from "../config";
import {
  confirmPayment,
  cancelPayment,
  getPayment,
  TossPaymentError,
} from "../services/toss.service";
import { confirmPaymentSchema, cancelPaymentSchema } from "@shared/schema";
import { createLogger } from "../utils/logger";

const router = Router();
const logger = createLogger("Payment");

/**
 * 클라이언트 키 조회 (결제창 SDK 초기화용)
 * GET /api/payments/client-key
 */
router.get("/client-key", (_req, res) => {
  if (!config.toss.isEnabled) {
    return res
      .status(503)
      .json({ message: "결제 서비스가 비활성화되어 있습니다" });
  }
  res.json({ clientKey: config.toss.clientKey });
});

/**
 * 결제 승인
 * POST /api/payments/confirm
 *
 * 클라이언트에서 토스페이먼츠 결제창 완료 후 호출
 * - paymentKey, orderId, amount 검증
 * - 서버 저장 금액과 클라이언트 금액 비교 (보안)
 * - 토스페이먼츠 결제 승인 API 호출
 * - 소프트 락 기반 재고 확인 및 차감 + 주문 상태 업데이트
 */
router.post("/confirm", paymentRateLimiter, isAuthenticated, asyncHandler(async (req, res) => {
  // 1. 요청 데이터 검증
  const validationResult = confirmPaymentSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({
      message: "잘못된 요청 데이터입니다",
      errors: validationResult.error.flatten().fieldErrors,
    });
  }

  const { paymentKey, orderId, amount } = validationResult.data;
  const userId = req.session.userId!;

  // 2. 서버에 저장된 주문 조회 (orderId는 externalOrderId로 저장됨)
  const order = await storage.getOrderByExternalOrderId(orderId);

  if (!order) {
    return res.status(404).json({ message: "주문을 찾을 수 없습니다" });
  }

  // 3. 주문 소유자 검증
  if (order.userId !== userId) {
    return res.status(403).json({ message: "권한이 없습니다" });
  }

  // 4. 결제 금액 검증 (중요: 클라이언트 조작 방지)
  const serverAmount = parseFloat(order.totalAmount);
  if (serverAmount !== amount) {
    logger.error("금액 불일치", { serverAmount, clientAmount: amount });
    return res.status(400).json({ message: "결제 금액이 일치하지 않습니다" });
  }

  // 5. 이미 결제된 주문인지 확인
  if (order.status !== "pending_payment") {
    return res.status(400).json({ message: "이미 처리된 주문입니다" });
  }

  // 6. 토스페이먼츠 결제 승인 API 호출
  let payment;
  try {
    payment = await confirmPayment(paymentKey, orderId, amount);
  } catch (error) {
    if (error instanceof TossPaymentError) {
      logger.error("결제 에러 (토스)", { code: error.code, message: error.message });
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }
    throw error;
  }

  // 7. 소프트 락 기반 재고 확인 및 차감 + 주문 상태 업데이트
  const stockResult = await storage.confirmOrderWithStockLock(order.id, {
    paymentProvider: "toss",
    paymentKey: payment.paymentKey,
    externalOrderId: payment.orderId,
    paymentMethod: payment.method,
    paidAt: payment.approvedAt ? new Date(payment.approvedAt) : new Date(),
  });

  // 8. 재고 부족 시 PG사 결제 취소 및 에러 반환
  if (!stockResult.success) {
    logger.error("재고 부족으로 결제 취소", {
      orderId: order.id,
      insufficientStock: stockResult.insufficientStock,
    });

    // PG사 결제 취소 시도
    try {
      await cancelPayment(payment.paymentKey, "재고 부족으로 인한 자동 취소");
      logger.info("재고 부족 - PG 결제 취소 완료", { orderId: order.id });
    } catch (cancelError) {
      // 결제 취소 실패 시 로그만 남기고 관리자 알림 필요
      logger.error("재고 부족 - PG 결제 취소 실패", {
        orderId: order.id,
        paymentKey: payment.paymentKey,
        error: cancelError,
      });
    }

    return res.status(409).json({
      success: false,
      message: stockResult.error || "재고가 부족합니다",
      code: "INSUFFICIENT_STOCK",
      insufficientStock: stockResult.insufficientStock,
    });
  }

  // 9. 최종 주문 정보 조회
  const updatedOrder = await storage.getOrder(order.id);

  logger.info("결제 승인 완료 (재고 차감 포함)", { orderId: order.id, paymentKey });

  res.json({
    success: true,
    message: "결제가 완료되었습니다",
    order: updatedOrder,
    payment: {
      paymentKey: payment.paymentKey,
      method: payment.method,
      approvedAt: payment.approvedAt,
      totalAmount: payment.totalAmount,
    },
  });
}));

/**
 * 결제 취소/환불
 * POST /api/payments/:orderId/cancel
 */
router.post("/:orderId/cancel", paymentRateLimiter, isAuthenticated, asyncHandler(async (req, res) => {
  const orderId = req.params.orderId; // UUID 문자열
  const userId = req.session.userId!;

  // 1. 요청 데이터 검증
  const validationResult = cancelPaymentSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({
      message: "잘못된 요청 데이터입니다",
      errors: validationResult.error.flatten().fieldErrors,
    });
  }

  const { cancelReason, cancelAmount, refundReceiveAccount } =
    validationResult.data;

  // 2. 주문 조회 (UUID 기반)
  const order = await storage.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ message: "주문을 찾을 수 없습니다" });
  }

  // 3. 권한 검증 (본인 또는 관리자)
  const user = await storage.getUser(userId);
  if (order.userId !== userId && !user?.isAdmin) {
    return res.status(403).json({ message: "권한이 없습니다" });
  }

  // 4. 결제 키 확인
  if (!order.paymentKey) {
    return res.status(400).json({ message: "결제 정보가 없습니다" });
  }

  // 5. 취소 가능 상태 확인
  const cancelableStatuses = ["payment_confirmed", "preparing"];
  if (!cancelableStatuses.includes(order.status)) {
    return res.status(400).json({
      message: `현재 상태(${order.status})에서는 취소할 수 없습니다`,
    });
  }

  // 6. PG사별 결제 취소 API 호출 (현재 토스페이먼츠만 지원)
  // TODO: 네이버페이 등 다른 PG사 추가 시 order.paymentProvider로 분기
  let payment;
  try {
    payment = await cancelPayment(
      order.paymentKey,
      cancelReason,
      cancelAmount,
      refundReceiveAccount
    );
  } catch (error) {
    if (error instanceof TossPaymentError) {
      logger.error("결제 취소 에러 (토스)", { code: error.code, message: error.message });
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }
    throw error;
  }

  // 7. 주문 상태 업데이트
  const newStatus = payment.status === "CANCELED" ? "cancelled" : order.status;
  const updatedOrder = await storage.cancelOrderPayment(orderId, {
    status: newStatus,
    canceledAt: new Date(),
    cancelReason,
    refundedAmount: cancelAmount?.toString(),
  });

  // 8. 재고 복구 (결제 완료된 주문만 재고가 차감되어 있음)
  if (newStatus === "cancelled") {
    try {
      await storage.restoreStockOnCancel(orderId);
      logger.info("재고 복구 완료", { orderId });
    } catch (restoreError) {
      // 재고 복구 실패 시 로그 남기고 계속 진행 (관리자 수동 처리 필요)
      logger.error("재고 복구 실패", { orderId, error: restoreError });
    }
  }

  logger.info("결제 취소 완료", { orderId });

  res.json({
    message: "결제가 취소되었습니다",
    order: updatedOrder,
    refund: {
      cancelAmount: payment.cancels?.[0]?.cancelAmount,
      refundableAmount: payment.cancels?.[0]?.refundableAmount,
      canceledAt: payment.cancels?.[0]?.canceledAt,
    },
  });
}));

/**
 * 결제 상태 조회
 * GET /api/payments/:orderId/status
 */
router.get("/:orderId/status", isAuthenticated, asyncHandler(async (req, res) => {
  const orderId = req.params.orderId; // UUID 문자열
  const userId = req.session.userId!;

  // 주문 조회 (UUID 기반)
  const order = await storage.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ message: "주문을 찾을 수 없습니다" });
  }

  // 권한 검증
  const user = await storage.getUser(userId);
  if (order.userId !== userId && !user?.isAdmin) {
    return res.status(403).json({ message: "권한이 없습니다" });
  }

  // 결제 키가 없으면 DB 상태만 반환
  if (!order.paymentKey) {
    return res.json({
      orderId: order.id,
      status: order.status,
      paymentInfo: null,
    });
  }

  // PG사에서 최신 결제 정보 조회 (현재 토스페이먼츠만 지원)
  // TODO: 네이버페이 등 다른 PG사 추가 시 order.paymentProvider로 분기
  let payment;
  try {
    payment = await getPayment(order.paymentKey);
  } catch (error) {
    if (error instanceof TossPaymentError) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }
    throw error;
  }

  res.json({
    orderId: order.id,
    status: order.status,
    paymentInfo: {
      paymentKey: payment.paymentKey,
      status: payment.status,
      method: payment.method,
      totalAmount: payment.totalAmount,
      balanceAmount: payment.balanceAmount,
      approvedAt: payment.approvedAt,
      cancels: payment.cancels,
    },
  });
}));

export default router;
