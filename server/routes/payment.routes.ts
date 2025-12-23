// server/routes/payment.routes.ts
// 토스페이먼츠 결제 라우트

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { paymentRateLimiter } from "../config/security";
import { config } from "../config";
import {
  confirmPayment,
  cancelPayment,
  getPayment,
  TossPaymentError,
} from "../services/toss.service";
import { confirmPaymentSchema, cancelPaymentSchema } from "@shared/schema";

const router = Router();

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
 * - 주문 상태 업데이트
 */
router.post("/confirm", paymentRateLimiter, isAuthenticated, async (req, res) => {
  try {
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
      console.error(
        `[Payment] 금액 불일치: server=${serverAmount}, client=${amount}`
      );
      return res.status(400).json({ message: "결제 금액이 일치하지 않습니다" });
    }

    // 5. 이미 결제된 주문인지 확인
    if (order.status !== "pending_payment") {
      return res.status(400).json({ message: "이미 처리된 주문입니다" });
    }

    // 6. 토스페이먼츠 결제 승인 API 호출
    const payment = await confirmPayment(paymentKey, orderId, amount);

    // 7. 주문 상태 업데이트 (PG사 정보 포함)
    const updatedOrder = await storage.updateOrderPayment(order.id, {
      paymentProvider: "toss", // 결제 PG사 식별자
      paymentKey: payment.paymentKey,
      externalOrderId: payment.orderId,
      paymentMethod: payment.method,
      status: "payment_confirmed",
      paidAt: payment.approvedAt ? new Date(payment.approvedAt) : new Date(),
    });

    // 8. 주문 아이템 상태도 업데이트
    const orderWithItems = await storage.getOrder(order.id);
    if (orderWithItems) {
      for (const item of orderWithItems.orderItems) {
        await storage.updateOrderItemStatus(item.id, "payment_confirmed");
      }
    }

    console.log(
      `[Payment] 결제 승인 완료: orderId=${order.id}, paymentKey=${paymentKey}`
    );

    res.json({
      message: "결제가 완료되었습니다",
      order: updatedOrder,
      payment: {
        paymentKey: payment.paymentKey,
        method: payment.method,
        approvedAt: payment.approvedAt,
        totalAmount: payment.totalAmount,
      },
    });
  } catch (error) {
    if (error instanceof TossPaymentError) {
      console.error(`[Payment Error] ${error.code}: ${error.message}`);
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }

    console.error("[Payment Error]", error);
    const message =
      error instanceof Error ? error.message : "결제 처리 중 오류가 발생했습니다";
    res.status(500).json({ message });
  }
});

/**
 * 결제 취소/환불
 * POST /api/payments/:orderId/cancel
 */
router.post("/:orderId/cancel", paymentRateLimiter, isAuthenticated, async (req, res) => {
  try {
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
    const payment = await cancelPayment(
      order.paymentKey,
      cancelReason,
      cancelAmount,
      refundReceiveAccount
    );

    // 7. 주문 상태 업데이트
    const newStatus = payment.status === "CANCELED" ? "cancelled" : order.status;
    const updatedOrder = await storage.cancelOrderPayment(orderId, {
      status: newStatus,
      canceledAt: new Date(),
      cancelReason,
      refundedAmount: cancelAmount?.toString(),
    });

    console.log(`[Payment] 결제 취소 완료: orderId=${orderId}`);

    res.json({
      message: "결제가 취소되었습니다",
      order: updatedOrder,
      refund: {
        cancelAmount: payment.cancels?.[0]?.cancelAmount,
        refundableAmount: payment.cancels?.[0]?.refundableAmount,
        canceledAt: payment.cancels?.[0]?.canceledAt,
      },
    });
  } catch (error) {
    if (error instanceof TossPaymentError) {
      console.error(`[Payment Cancel Error] ${error.code}: ${error.message}`);
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }

    console.error("[Payment Cancel Error]", error);
    const message =
      error instanceof Error ? error.message : "결제 취소 중 오류가 발생했습니다";
    res.status(500).json({ message });
  }
});

/**
 * 결제 상태 조회
 * GET /api/payments/:orderId/status
 */
router.get("/:orderId/status", isAuthenticated, async (req, res) => {
  try {
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
    const payment = await getPayment(order.paymentKey);

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
  } catch (error) {
    if (error instanceof TossPaymentError) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }

    console.error("[Payment Status Error]", error);
    const message =
      error instanceof Error ? error.message : "결제 조회 중 오류가 발생했습니다";
    res.status(500).json({ message });
  }
});

export default router;
