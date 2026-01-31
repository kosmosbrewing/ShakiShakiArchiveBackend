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
 * - customer_request_cod: 착불 반품 (배송비 + 반품비 차감)
 * - seller_cancel: 판매자 직권 취소 (전액 환불)
 *
 * orderItemId가 있으면 개별 상품 취소, 없으면 전체 주문 취소
 */
router.post("/:orderId/cancel", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const { cancelReason, cancelType, refundReceiveAccount, orderItemId } = req.body;
  const order = await storage.getOrder(req.params.orderId); // UUID 문자열

  if (!order) {
    return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
  }

  if (!order.paymentKey) {
    return res.status(400).json({ message: ORDER_MESSAGES.NO_PAYMENT_INFO });
  }

  // 주문 아이템 조회
  const orderItems = await storage.getOrderItemsByOrderId(order.id);

  // 취소 대상 아이템 확인
  let targetItem = null;
  if (orderItemId) {
    targetItem = orderItems.find((item) => item.id === orderItemId);
    if (!targetItem) {
      return res.status(404).json({ message: "취소할 주문 상품을 찾을 수 없습니다." });
    }
  }

  // 활성 상태인 아이템 필터링 (취소/환불 완료된 것 제외)
  const activeStatuses = ["payment_confirmed", "preparing", "shipped", "delivered", "return_requested", "return_in_transit", "return_received"];
  const activeItems = orderItems.filter((item) =>
    activeStatuses.includes(item.status) && item.id !== orderItemId
  );
  const isLastItems = activeItems.length === 0;

  // 취소 대상 금액 계산
  const targetItemsAmount = targetItem
    ? parseFloat(targetItem.productPrice) * targetItem.quantity
    : orderItems.reduce((sum: number, item) => sum + parseFloat(item.productPrice) * item.quantity, 0);

  // 환불 금액 계산
  let refundAmount: number;
  let refundDetails: ReturnType<typeof calculateRefund> | null = null;
  let returnShippingDeducted = 0; // 착불 반품비 차감액

  if (cancelType === "customer_request" || cancelType === "customer_request_cod") {
    // 고객 요청 반품 승인: calculateRefund 사용 (배송비 차감)
    refundDetails = calculateRefund({
      itemsAmount: targetItemsAmount,
      paidShippingFee: parseFloat(order.shippingFee),
      totalOrderAmount: parseFloat(order.itemsAmount),
      alreadyRefundedAmount: parseFloat(order.refundedAmount || "0"),
      isLastItems,
      isSellerFault: false, // 고객 귀책 (단순 변심)
      isAfterShipping: true, // 배송 후 반품
      penaltyAlreadyApplied: (order as any).shippingPenaltyApplied || false,
      // 판매자 귀책 취소 금액 (직권 취소로 무료배송 기준 붕괴 시 고객 보호)
      sellerCancelledAmount: parseFloat((order as any).sellerCancelledAmount || "0"),
    });

    refundAmount = refundDetails.totalRefund;

    // 착불 반품비 추가 차감
    if (cancelType === "customer_request_cod") {
      const { SHIPPING } = await import("@shared/constants/shipping");
      returnShippingDeducted = SHIPPING.FEE; // 반품 배송비 (3,500원)
      refundAmount = Math.max(0, refundAmount - returnShippingDeducted);
      logger.info("착불 반품비 추가 차감", {
        orderId: order.id,
        orderItemId,
        returnShippingDeducted,
        finalRefundAmount: refundAmount,
      });
    }

    logger.info("고객 요청 반품 환불 금액 계산", {
      orderId: order.id,
      orderItemId,
      targetItemsAmount,
      isLastItems,
      refundDetails,
      returnShippingDeducted,
    });
  } else {
    // 판매자 직권 취소
    if (isLastItems) {
      // 마지막 상품: 상품값 + 낸 배송비
      refundAmount = targetItemsAmount + parseFloat(order.shippingFee);
    } else {
      // 부분 취소: 상품값만
      refundAmount = targetItemsAmount;
    }
    logger.info("판매자 직권 취소 환불", {
      orderId: order.id,
      orderItemId,
      targetItemsAmount,
      isLastItems,
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

  // 주문/상품 상태 업데이트 및 재고 복구
  let updatedOrder;

  if (orderItemId && targetItem) {
    // 부분 취소: 개별 상품만 처리
    logger.info("부분 취소 처리 시작", { orderId: order.id, orderItemId });

    // 1. 개별 상품 상태 업데이트
    await storage.cancelOrderItemPayment(orderItemId, {
      status: "cancelled",
      cancelReason: cancelReason || "관리자 취소",
    });

    // 2. 개별 상품 재고 복구
    try {
      await storage.restoreStockOnItemCancel(orderItemId);
      logger.info("개별 재고 복구 완료 (관리자)", { orderId: order.id, orderItemId });
    } catch (restoreError) {
      logger.error("개별 재고 복구 실패 (관리자)", { orderId: order.id, orderItemId, error: restoreError });
    }

    // 3. 환불 금액 누적 업데이트 + 페널티 플래그 업데이트
    await storage.addRefundedAmount(
      order.id,
      refundAmount.toString(),
      refundDetails?.shouldUpdatePenaltyFlag
    );

    // 4. 직권 취소인 경우 판매자 귀책 취소 금액 누적 (이후 고객 귀책 반품 시 고객 보호)
    if (cancelType === "seller_cancel") {
      await storage.addSellerCancelledAmount(order.id, targetItemsAmount.toString());
      logger.info("판매자 귀책 취소 금액 누적", {
        orderId: order.id,
        orderItemId,
        amount: targetItemsAmount,
      });
    }

    // 5. 마지막 활성 상품이면 전체 주문 상태도 변경 (orderItems는 건드리지 않음)
    if (isLastItems) {
      updatedOrder = await storage.updateOrderStatusOnly(order.id, {
        status: "cancelled",
        cancelReason: cancelReason || "관리자 취소 (전체)",
      });
      logger.info("마지막 상품 취소로 주문 전체 취소", { orderId: order.id });
    } else {
      // 주문은 유지하되 환불 금액만 업데이트 (위에서 이미 처리)
      updatedOrder = await storage.getOrder(order.id);
      logger.info("부분 취소 완료 - 주문 유지", { orderId: order.id, remainingActiveItems: activeItems.length });
    }
  } else {
    // 전체 취소
    updatedOrder = await storage.cancelOrderPayment(order.id, {
      status: "cancelled",
      cancelReason: cancelReason || "관리자 취소",
      refundedAmount: refundAmount.toString(),
    });

    // 전체 재고 복구
    try {
      await storage.restoreStockOnCancel(order.id);
      logger.info("재고 복구 완료 (관리자)", { orderId: order.id });
    } catch (restoreError) {
      logger.error("재고 복구 실패 (관리자)", { orderId: order.id, error: restoreError });
    }
  }

  logger.info("결제 취소 완료 (관리자)", { orderId: order.id, orderItemId, cancelType, refundAmount, isPartialCancel: !!orderItemId });

  res.json({
    message: PAYMENT_MESSAGES.CANCEL_SUCCESS,
    order: updatedOrder,
    payment,
    refundAmount,
    isPartialCancel: !!orderItemId,
    cancelledItemId: orderItemId || null,
    cancelledItemName: targetItem?.productName || null,
    remainingActiveItems: orderItemId ? activeItems.length : 0,
    refundDetails: refundDetails ? {
      ...refundDetails,
      returnShippingDeducted,
      summary: formatRefundSummary(refundDetails) +
        (returnShippingDeducted > 0 ? `\n착불 반품비 차감: -${returnShippingDeducted.toLocaleString()}원\n최종 환불 금액: ${refundAmount.toLocaleString()}원` : ""),
    } : null,
  });
}));

export default router;
