// server/routes/order.routes.ts
// 주문 관련 라우트 (/api/orders/*)

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { insertOrderSchema, cancelPaymentSchema } from "@shared/schema";
import type { OrderItemCreateData } from "../types";
import { cancelPayment, TossPaymentError } from "../services/toss.service";

const router = Router();

/**
 * PG사 주문번호 생성 (토스페이먼츠, 네이버페이 등 공용)
 * 형식: SHAKI_{timestamp}_{random} (영문 대소문자, 숫자, -, _ 허용, 6-64자)
 */
function generateExternalOrderId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SHAKI_${timestamp}_${random}`;
}

// 주문 생성
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;

    // 장바구니 아이템 조회
    const cartItems = await storage.getCartItems(userId);

    if (cartItems.length === 0) {
      return res.status(400).json({ message: "장바구니가 비어있습니다" });
    }

    // 총 결제 금액 계산
    const totalAmount = cartItems.reduce(
      (sum, item) => sum + parseFloat(item.product.price) * item.quantity,
      0
    );

    // PG사 주문번호 생성 (토스페이먼츠, 네이버페이 등 공용)
    const externalOrderId = generateExternalOrderId();

    // 주문 데이터 생성 (배송 상세주소, 배송요청사항 포함)
    const orderData = insertOrderSchema.parse({
      userId,
      totalAmount: totalAmount.toString(),
      status: "pending_payment",
      shippingName: req.body.shippingName,
      shippingPhone: req.body.shippingPhone,
      shippingPostalCode: req.body.shippingPostalCode,
      shippingAddress: req.body.shippingAddress,
      shippingDetailAddress: req.body.shippingDetailAddress, // 상세 주소
      shippingRequestNote: req.body.shippingRequestNote, // 배송 요청사항
      externalOrderId, // PG사 주문번호
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

    // 주문명 생성 (결제창에 표시)
    const orderName =
      cartItems.length > 1
        ? `${cartItems[0].product.name} 외 ${cartItems.length - 1}건`
        : cartItems[0].product.name;

    res.json({
      orderId,
      externalOrderId, // 클라이언트에서 결제창 호출 시 사용 (토스, 네이버페이 등)
      orderName, // 결제창에 표시할 주문명
      amount: totalAmount, // 결제 금액
    });
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

// 주문 상세 조회 (UUID 기반)
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const order = await storage.getOrder(req.params.id); // UUID 문자열
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

/**
 * 주문 취소
 * POST /api/orders/:id/cancel
 *
 * - pending_payment: 단순 상태 변경으로 취소 (PG사 호출 없음)
 * - payment_confirmed, preparing: PG사 결제 취소 후 상태 변경
 * - shipped, delivered, cancelled: 취소 불가
 */
router.post("/:id/cancel", isAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.id; // UUID 문자열
    const userId = req.session.userId!;

    // 1. 주문 조회
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ message: "주문을 찾을 수 없습니다" });
    }

    // 2. 권한 검증 (본인 또는 관리자)
    const user = await storage.getUser(userId);
    if (order.userId !== userId && !user?.isAdmin) {
      return res.status(403).json({ message: "권한이 없습니다" });
    }

    // 3. 취소 가능 상태 확인
    const nonCancelableStatuses = ["shipped", "delivered", "cancelled"];
    if (nonCancelableStatuses.includes(order.status)) {
      return res.status(400).json({
        message: `현재 상태(${order.status})에서는 취소할 수 없습니다`,
      });
    }

    // 4. 취소 사유 검증 (결제 완료 상태에서만 필수)
    const cancelReason = req.body.cancelReason || "고객 요청에 의한 취소";

    // 5. 결제 대기 상태인 경우: 단순 상태 변경
    if (order.status === "pending_payment") {
      const updatedOrder = await storage.cancelOrderPayment(orderId, {
        status: "cancelled",
        canceledAt: new Date(),
        cancelReason,
      });

      // 주문 아이템 상태도 취소로 변경
      for (const item of order.orderItems) {
        await storage.updateOrderItemStatus(item.id, "cancelled");
      }

      console.log(`[Order] 주문 취소 완료 (결제 전): orderId=${orderId}`);

      return res.json({
        message: "주문이 취소되었습니다",
        order: updatedOrder,
      });
    }

    // 6. 결제 완료/준비 중 상태인 경우: PG사 결제 취소 필요
    if (!order.paymentKey) {
      return res.status(400).json({
        message: "결제 정보가 없어 취소할 수 없습니다",
      });
    }

    // 7. 취소 금액 (부분 취소 지원)
    const cancelAmount = req.body.cancelAmount
      ? Number(req.body.cancelAmount)
      : undefined;

    // 8. PG사별 결제 취소 API 호출
    // TODO: 네이버페이 등 다른 PG사 추가 시 order.paymentProvider로 분기
    const payment = await cancelPayment(
      order.paymentKey,
      cancelReason,
      cancelAmount
    );

    // 9. 주문 상태 업데이트
    const newStatus = payment.status === "CANCELED" ? "cancelled" : order.status;
    const updatedOrder = await storage.cancelOrderPayment(orderId, {
      status: newStatus,
      canceledAt: new Date(),
      cancelReason,
      refundedAmount: cancelAmount?.toString() || order.totalAmount,
    });

    // 10. 주문 아이템 상태도 취소로 변경
    for (const item of order.orderItems) {
      await storage.updateOrderItemStatus(item.id, "cancelled");
    }

    console.log(`[Order] 주문 취소 완료 (결제 취소): orderId=${orderId}`);

    res.json({
      message: "주문이 취소되었습니다",
      order: updatedOrder,
      refund: {
        cancelAmount: payment.cancels?.[0]?.cancelAmount,
        refundableAmount: payment.cancels?.[0]?.refundableAmount,
        canceledAt: payment.cancels?.[0]?.canceledAt,
      },
    });
  } catch (error) {
    // 토스페이먼츠 에러 처리
    if (error instanceof TossPaymentError) {
      console.error(`[Order Cancel Error] ${error.code}: ${error.message}`);
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }

    console.error("[Order Cancel Error]", error);
    const message =
      error instanceof Error ? error.message : "주문 취소 중 오류가 발생했습니다";
    res.status(500).json({ message });
  }
});

export default router;
