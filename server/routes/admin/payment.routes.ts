// server/routes/admin/payment.routes.ts
// 관리자 결제 관리 라우트

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import {
  cancelPayment,
  getPayment,
  TossPaymentError,
} from "../../services/toss.service";

const router = Router();

/**
 * 관리자: 결제 상세 조회
 * GET /api/admin/payments/:orderId
 */
router.get("/:orderId", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const order = await storage.getOrder(Number(req.params.orderId));
    if (!order) {
      return res.status(404).json({ message: "주문을 찾을 수 없습니다" });
    }

    let paymentInfo = null;
    if (order.paymentKey) {
      try {
        // PG사에서 결제 정보 조회 (현재 토스페이먼츠만 지원)
        // TODO: 네이버페이 등 다른 PG사 추가 시 order.paymentProvider로 분기
        paymentInfo = await getPayment(order.paymentKey);
      } catch (error) {
        // PG사 조회 실패 시에도 주문 정보는 반환
        console.error("[Admin Payment] PG사 결제 정보 조회 실패:", error);
      }
    }

    res.json({ order, paymentInfo });
  } catch (error) {
    if (error instanceof TossPaymentError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    const message = error instanceof Error ? error.message : "조회 실패";
    res.status(500).json({ message });
  }
});

/**
 * 관리자: 강제 결제 취소 (환불)
 * POST /api/admin/payments/:orderId/cancel
 */
router.post("/:orderId/cancel", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { cancelReason, cancelAmount, refundReceiveAccount } = req.body;
    const order = await storage.getOrder(Number(req.params.orderId));

    if (!order) {
      return res.status(404).json({ message: "주문을 찾을 수 없습니다" });
    }

    if (!order.paymentKey) {
      return res.status(400).json({ message: "결제 정보가 없습니다" });
    }

    // PG사 결제 취소 API 호출 (현재 토스페이먼츠만 지원)
    // TODO: 네이버페이 등 다른 PG사 추가 시 order.paymentProvider로 분기
    const payment = await cancelPayment(
      order.paymentKey,
      cancelReason || "관리자 취소",
      cancelAmount,
      refundReceiveAccount
    );

    // 주문 상태 업데이트
    const updatedOrder = await storage.cancelOrderPayment(order.id, {
      status: "cancelled",
      canceledAt: new Date(),
      cancelReason: cancelReason || "관리자 취소",
      refundedAmount: cancelAmount?.toString(),
    });

    console.log(
      `[Admin Payment] 결제 취소 완료: orderId=${order.id}, admin 처리`
    );

    res.json({
      message: "결제가 취소되었습니다",
      order: updatedOrder,
      payment,
    });
  } catch (error) {
    if (error instanceof TossPaymentError) {
      console.error(
        `[Admin Payment Cancel Error] ${error.code}: ${error.message}`
      );
      return res
        .status(error.statusCode)
        .json({ message: error.message, code: error.code });
    }
    const message = error instanceof Error ? error.message : "취소 실패";
    res.status(500).json({ message });
  }
});

export default router;
