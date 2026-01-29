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
import { calculateRefund, formatRefundSummary } from "@shared/constants/shipping";
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
 *
 * cancelType에 따른 환불 로직:
 * - customer_request: 고객 요청 반품 승인 (배송비 차감 적용)
 * - seller_cancel: 판매자 직권 취소 (전액 환불)
 */
router.post("/:orderId/cancel", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const { cancelReason, cancelType, refundReceiveAccount } = req.body;
  const order = await storage.getOrder(req.params.orderId); // UUID 문자열

  if (!order) {
    return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
  }

  if (!order.paymentKey) {
    return res.status(400).json({ message: ORDER_MESSAGES.NO_PAYMENT_INFO });
  }

  // 환불 금액 계산
  let refundAmount: number;
  let refundDetails: ReturnType<typeof calculateRefund> | null = null;
  let returnShippingDeducted = 0; // 착불 반품비 차감액

  if (cancelType === "customer_request" || cancelType === "customer_request_cod") {
    // 고객 요청 반품 승인: calculateRefund 사용 (배송비 차감)
    const orderItems = await storage.getOrderItemsByOrderId(order.id);
    const itemsAmount = orderItems.reduce(
      (sum: number, item) => sum + parseFloat(item.productPrice) * item.quantity,
      0
    );

    refundDetails = calculateRefund({
      itemsAmount,
      paidShippingFee: parseFloat(order.shippingFee),
      totalOrderAmount: parseFloat(order.itemsAmount),
      alreadyRefundedAmount: parseFloat(order.refundedAmount || "0"),
      isLastItems: true, // 전체 주문 취소
      isSellerFault: false, // 고객 귀책 (단순 변심)
      isAfterShipping: true, // 배송 후 반품
      penaltyAlreadyApplied: (order as any).shippingPenaltyApplied || false,
    });

    refundAmount = refundDetails.totalRefund;

    // 착불 반품비 추가 차감
    if (cancelType === "customer_request_cod") {
      const { SHIPPING } = await import("@shared/constants/shipping");
      returnShippingDeducted = SHIPPING.FEE; // 반품 배송비 (3,500원)
      refundAmount = Math.max(0, refundAmount - returnShippingDeducted);
      logger.info("착불 반품비 추가 차감", {
        orderId: order.id,
        returnShippingDeducted,
        finalRefundAmount: refundAmount,
      });
    }

    logger.info("고객 요청 반품 환불 금액 계산", {
      orderId: order.id,
      refundDetails,
      returnShippingDeducted,
    });
  } else {
    // 판매자 직권 취소: 전액 환불
    refundAmount = Number(order.totalAmount);
    logger.info("판매자 직권 취소 전액 환불", {
      orderId: order.id,
      refundAmount,
    });
  }

  // PG사별 결제 취소 API 호출
  const provider = order.paymentProvider || "toss";
  const reason = cancelReason || "관리자 취소";
  let payment;

  try {
    switch (provider) {
      case "kakaopay":
        // 카카오페이: tid(paymentKey), 취소금액
        payment = await cancelKakaoPayment(order.paymentKey, refundAmount);
        break;

      case "naverpay":
        // 네이버페이: paymentId(paymentKey), 취소금액, 사유, 요청자(2=가맹점관리자)
        payment = await cancelNaverPayment(order.paymentKey, refundAmount, reason, "2");
        break;

      case "toss":
      default:
        // 토스페이먼츠: paymentKey, 사유, 취소금액, 환불계좌
        payment = await cancelTossPayment(
          order.paymentKey,
          reason,
          refundAmount,
          refundReceiveAccount
        );
        break;
    }

    logger.info("PG사 결제 취소 성공", { provider, orderId: order.id, refundAmount });
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
    refundedAmount: refundAmount.toString(),
  });

  // 재고 복구
  try {
    await storage.restoreStockOnCancel(order.id);
    logger.info("재고 복구 완료 (관리자)", { orderId: order.id });
  } catch (restoreError) {
    logger.error("재고 복구 실패 (관리자)", { orderId: order.id, error: restoreError });
  }

  logger.info("결제 취소 완료 (관리자)", { orderId: order.id, cancelType, refundAmount });

  res.json({
    message: PAYMENT_MESSAGES.CANCEL_SUCCESS,
    order: updatedOrder,
    payment,
    refundAmount,
    refundDetails: refundDetails ? {
      ...refundDetails,
      returnShippingDeducted,
      summary: formatRefundSummary(refundDetails) +
        (returnShippingDeducted > 0 ? `\n착불 반품비 차감: -${returnShippingDeducted.toLocaleString()}원\n최종 환불 금액: ${refundAmount.toLocaleString()}원` : ""),
    } : null,
  });
}));

export default router;
