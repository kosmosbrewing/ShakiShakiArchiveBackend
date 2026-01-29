// server/routes/admin/payment.routes.ts
// 관리자 결제 관리 라우트

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { cacheStrategies } from "../../middleware";
import {
  cancelPayment as cancelTossPayment,
  getPayment,
  TossPaymentError,
} from "../../services/toss.service";
import {
  cancelPaymentSimple as cancelKakaoPayment,
  KakaoPayPaymentError,
} from "../../services/kakaopay.service";
import {
  cancelPaymentSimple as cancelNaverPayment,
  NaverPayPaymentError,
} from "../../services/naverpay.service";
import { createLogger } from "../../utils/logger";
import { ORDER_MESSAGES, PAYMENT_MESSAGES } from "@shared/constants/messages";

const router = Router();
const logger = createLogger("AdminPayment");

/**
 * 관리자: 결제 상세 조회
 * GET /api/admin/payments/:orderId
 */
router.get("/:orderId", isAuthenticated, isAdmin, cacheStrategies.admin, asyncHandler(async (req, res) => {
  const order = await storage.getOrder(req.params.orderId); // UUID 문자열
  if (!order) {
    return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
  }

  let paymentInfo = null;
  if (order.paymentKey) {
    try {
      // PG사에서 결제 정보 조회 (현재 토스페이먼츠만 지원)
      // TODO: 네이버페이 등 다른 PG사 추가 시 order.paymentProvider로 분기
      paymentInfo = await getPayment(order.paymentKey);
    } catch (error) {
      // PG사 조회 실패 시에도 주문 정보는 반환
      logger.error("PG사 결제 정보 조회 실패", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  res.json({ order, paymentInfo });
}));

/**
 * 관리자: 강제 결제 취소 (환불)
 * POST /api/admin/payments/:orderId/cancel
 */
router.post("/:orderId/cancel", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const { cancelReason, cancelAmount, refundReceiveAccount } = req.body;
  const order = await storage.getOrder(req.params.orderId); // UUID 문자열

  if (!order) {
    return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
  }

  if (!order.paymentKey) {
    return res.status(400).json({ message: ORDER_MESSAGES.NO_PAYMENT_INFO });
  }

  // PG사별 결제 취소 API 호출
  const provider = order.paymentProvider || "toss";
  const reason = cancelReason || "관리자 취소";
  const amount = cancelAmount || Number(order.totalAmount);
  let payment;

  try {
    switch (provider) {
      case "kakaopay":
        // 카카오페이: tid(paymentKey), 취소금액
        payment = await cancelKakaoPayment(order.paymentKey, amount);
        break;

      case "naverpay":
        // 네이버페이: paymentId(paymentKey), 취소금액, 사유, 요청자(2=가맹점관리자)
        payment = await cancelNaverPayment(order.paymentKey, amount, reason, "2");
        break;

      case "toss":
      default:
        // 토스페이먼츠: paymentKey, 사유, 취소금액, 환불계좌
        payment = await cancelTossPayment(
          order.paymentKey,
          reason,
          cancelAmount,
          refundReceiveAccount
        );
        break;
    }

    logger.info("PG사 결제 취소 성공", { provider, orderId: order.id });
  } catch (error) {
    // PG사별 에러 처리
    if (error instanceof TossPaymentError) {
      logger.error("토스 결제 취소 에러 (관리자)", { code: error.code, message: error.message });
      return res.status(error.statusCode).json({ message: error.message, code: error.code });
    }
    if (error instanceof KakaoPayPaymentError) {
      logger.error("카카오페이 결제 취소 에러 (관리자)", { code: error.code, message: error.message });
      return res.status(error.statusCode).json({ message: error.message, code: error.code });
    }
    if (error instanceof NaverPayPaymentError) {
      logger.error("네이버페이 결제 취소 에러 (관리자)", { code: error.code, message: error.message });
      return res.status(error.statusCode).json({ message: error.message, code: error.code });
    }
    throw error;
  }

  // 주문 상태 업데이트 (canceledAt은 storage에서 NOW() 사용)
  const updatedOrder = await storage.cancelOrderPayment(order.id, {
    status: "cancelled",
    cancelReason: cancelReason || "관리자 취소",
    refundedAmount: cancelAmount?.toString(),
  });

  // 재고 복구
  try {
    await storage.restoreStockOnCancel(order.id);
    logger.info("재고 복구 완료 (관리자)", { orderId: order.id });
  } catch (restoreError) {
    logger.error("재고 복구 실패 (관리자)", { orderId: order.id, error: restoreError });
  }

  logger.info("결제 취소 완료 (관리자)", { orderId: order.id });

  res.json({
    message: PAYMENT_MESSAGES.CANCEL_SUCCESS,
    order: updatedOrder,
    payment,
  });
}));

export default router;
