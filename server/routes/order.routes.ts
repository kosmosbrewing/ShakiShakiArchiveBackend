// server/routes/order.routes.ts
// 주문 관련 라우트 (/api/orders/*)

import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { insertOrderSchema, createOrderRequestSchema, stockReservations } from "@shared/schema";
import {
  calculateShippingFee,
  generateExternalOrderId,
  NON_CANCELABLE_STATUSES,
  ORDER_STATUS,
  ORDER_MESSAGES,
  AUTH_MESSAGES,
  TOSS_PAYMENT_STATUS,
  STOCK_MESSAGES,
} from "../constants";
import type { OrderItemCreateData } from "../types";
import { cancelPayment, TossPaymentError } from "../services/toss.service";
import { createLogger } from "../utils/logger";
import { eq, and, gt } from "drizzle-orm";

const router = Router();
const logger = createLogger("Order");

// 주문 생성
router.post("/", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;

  // 입력값 검증
  const validatedBody = createOrderRequestSchema.parse(req.body);
  const { directPurchaseItem, reservationId } = validatedBody;

  // 재고 선점 검증 (reservationId가 제공된 경우)
  if (reservationId) {
    const [reservation] = await db
      .select()
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.id, reservationId),
          eq(stockReservations.userId, userId),
          gt(stockReservations.expiresAt, new Date())
        )
      );

    if (!reservation) {
      return res.status(400).json({
        message: STOCK_MESSAGES.RESERVATION_EXPIRED,
        code: "RESERVATION_INVALID",
      });
    }

    logger.info("재고 선점 확인됨", { userId, reservationId });
  }

  let orderItemsData: OrderItemCreateData[];
  let subtotal: number;
  let orderName: string;
  let isDirectPurchase = false;

  // 🔍 디버깅: 주문 모드 확인
  logger.info("주문 모드 확인", {
    directPurchaseItem: !!directPurchaseItem,
    userId
  });

  // 바로 구매 모드
  if (directPurchaseItem) {
    isDirectPurchase = true;
    const { productId, variantId, quantity } = directPurchaseItem;

    // 상품 정보 조회
    const product = await storage.getProduct(productId);
    if (!product) {
      return res.status(400).json({ message: ORDER_MESSAGES.PRODUCT_NOT_FOUND });
    }

    // 🔒 보안: 상품 활성화 상태 확인
    if (!product.isAvailable) {
      logger.warn("비활성화된 상품 주문 시도", { userId, productId, productName: product.name });
      return res.status(400).json({
        message: "현재 판매하지 않는 상품입니다",
        code: "PRODUCT_NOT_AVAILABLE"
      });
    }

    // 🔒 보안: 가격 유효성 검증
    const price = parseFloat(product.price);
    if (price <= 0) {
      logger.error("잘못된 상품 가격 감지", { userId, productId, price });
      return res.status(400).json({
        message: "상품 가격 오류가 발생했습니다",
        code: "INVALID_PRODUCT_PRICE"
      });
    }

    // 옵션 정보 조회 (선택사항)
    let variant = null;
    if (variantId) {
      variant = await storage.getProductVariant(variantId);
      if (!variant) {
        return res.status(400).json({ message: ORDER_MESSAGES.VARIANT_NOT_FOUND });
      }

      // 🔒 보안: 옵션 활성화 상태 확인
      if (!variant.isAvailable) {
        logger.warn("비활성화된 옵션 주문 시도", { userId, productId, variantId, size: variant.size });
        return res.status(400).json({
          message: "선택하신 옵션은 현재 판매하지 않습니다",
          code: "VARIANT_NOT_AVAILABLE"
        });
      }

      // 🔒 보안: 재고 확인 (재고 선점을 사용하지 않는 경우만)
      if (!reservationId && variant.stockQuantity < quantity) {
        logger.warn("재고 부족 주문 시도", {
          userId,
          productId,
          variantId,
          requested: quantity,
          available: variant.stockQuantity
        });
        return res.status(400).json({
          message: `재고가 부족합니다. (요청: ${quantity}개, 재고: ${variant.stockQuantity}개)`,
          code: "INSUFFICIENT_STOCK"
        });
      }
    }

    subtotal = price * quantity;
    orderName = product.name;

    logger.info("바로 구매 주문 검증 완료", {
      userId,
      productId,
      variantId,
      quantity,
      price,
      subtotal
    });

    orderItemsData = [{
      productId: product.id,
      productName: product.name,
      productPrice: product.price,
      quantity,
      options: variant ? `Size: ${variant.size}` : null,
    }];
  }
  // 장바구니 모드
  else {
    logger.info("장바구니 모드: 장바구니 조회 시작", { userId });
    const cartItems = await storage.getCartItems(userId);

    if (cartItems.length === 0) {
      logger.warn("장바구니 비어있음", { userId });
      return res.status(400).json({ message: ORDER_MESSAGES.CART_EMPTY });
    }

    logger.info("장바구니 조회 완료", { userId, itemCount: cartItems.length });

    // 🔒 보안: 장바구니 상품 유효성 검증
    for (const item of cartItems) {
      // 상품 활성화 상태 확인
      if (!item.product.isAvailable) {
        logger.warn("장바구니에 비활성화된 상품 존재", {
          userId,
          productId: item.productId,
          productName: item.product.name
        });
        return res.status(400).json({
          message: `${item.product.name}은(는) 현재 판매하지 않는 상품입니다. 장바구니에서 제거해주세요.`,
          code: "CART_ITEM_NOT_AVAILABLE"
        });
      }

      // 가격 유효성 검증
      const price = parseFloat(item.product.price);
      if (price <= 0) {
        logger.error("장바구니 상품 가격 오류", {
          userId,
          productId: item.productId,
          price
        });
        return res.status(400).json({
          message: "일부 상품의 가격 오류가 발생했습니다. 장바구니를 다시 확인해주세요.",
          code: "INVALID_CART_ITEM_PRICE"
        });
      }

      // 옵션 재고 확인 (재고 선점을 사용하지 않는 경우만)
      if (!reservationId && item.variant) {
        if (!item.variant.isAvailable) {
          logger.warn("장바구니에 비활성화된 옵션 존재", {
            userId,
            productId: item.productId,
            variantId: item.variantId,
            size: item.variant.size
          });
          return res.status(400).json({
            message: `${item.product.name}의 선택하신 옵션은 현재 판매하지 않습니다.`,
            code: "CART_VARIANT_NOT_AVAILABLE"
          });
        }

        if (item.variant.stockQuantity < item.quantity) {
          logger.warn("장바구니 상품 재고 부족", {
            userId,
            productId: item.productId,
            variantId: item.variantId,
            requested: item.quantity,
            available: item.variant.stockQuantity
          });
          return res.status(400).json({
            message: `${item.product.name}의 재고가 부족합니다. (요청: ${item.quantity}개, 재고: ${item.variant.stockQuantity}개)`,
            code: "CART_INSUFFICIENT_STOCK"
          });
        }
      }
    }

    logger.info("장바구니 상품 검증 완료", { userId, itemCount: cartItems.length });

    subtotal = cartItems.reduce(
      (sum, item) => sum + parseFloat(item.product.price) * item.quantity,
      0
    );

    orderName =
      cartItems.length > 1
        ? `${cartItems[0].product.name} 외 ${cartItems.length - 1}건`
        : cartItems[0].product.name;

    orderItemsData = cartItems.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      productPrice: item.product.price,
      quantity: item.quantity,
      options: item.variant ? `Size: ${item.variant.size}` : null,
    }));
  }

  // 배송비 계산 (도서산간 추가 배송비 포함)
  const shippingFee = calculateShippingFee(subtotal, validatedBody.shippingPostalCode);
  const totalAmount = subtotal + shippingFee;

  // 🔒 보안: 총 금액 범위 검증
  if (totalAmount <= 0 || totalAmount > 100000000) {
    logger.error("비정상적인 주문 금액 감지", {
      userId,
      subtotal,
      shippingFee,
      totalAmount,
      itemCount: orderItemsData.length
    });
    return res.status(400).json({
      message: "주문 금액이 올바르지 않습니다",
      code: "INVALID_TOTAL_AMOUNT"
    });
  }

  logger.info("주문 금액 계산 완료", { subtotal, shippingFee, totalAmount });

  // PG사 주문번호 생성
  const externalOrderId = generateExternalOrderId();

  // 주문 데이터 생성
  logger.info("주문 데이터 검증 시작", { userId, externalOrderId });
  const orderData = insertOrderSchema.parse({
    userId,
    totalAmount: totalAmount.toString(),
    status: ORDER_STATUS.PENDING_PAYMENT,
    shippingName: validatedBody.shippingName,
    shippingPhone: validatedBody.shippingPhone,
    shippingPostalCode: validatedBody.shippingPostalCode,
    shippingAddress: validatedBody.shippingAddress,
    shippingDetailAddress: validatedBody.shippingDetailAddress,
    shippingRequestNote: validatedBody.shippingRequestNote,
    externalOrderId,
    // 재고 선점 사용 여부 (결제 승인 시 재고 차감 건너뜀)
    isStockReserved: !!reservationId,
  });

  // 주문 생성 (트랜잭션 적용됨)
  logger.info("주문 생성 시작 (DB 저장)", {
    userId,
    totalAmount,
    itemCount: orderItemsData.length,
    isStockReserved: !!reservationId,
    externalOrderId,
  });

  const orderId = await storage.createOrder(orderData, orderItemsData);

  logger.info("주문 생성 완료 - DB 저장 성공", {
    userId,
    orderId,
    externalOrderId,
    totalAmount,
    status: ORDER_STATUS.PENDING_PAYMENT,
  });

  // 재고 선점 삭제 (주문 생성 성공 시)
  if (reservationId) {
    try {
      await db
        .delete(stockReservations)
        .where(eq(stockReservations.id, reservationId));
      logger.info("재고 선점 삭제 완료", { userId, reservationId, orderId });
    } catch (error) {
      // 선점 삭제 실패해도 주문은 계속 진행 (TTL로 자동 삭제됨)
      logger.warn("재고 선점 삭제 실패", { reservationId, error });
    }
  }

  // 장바구니 비우기는 결제 완료 시점에 수행 (payment.routes.ts)

  logger.info("주문 생성 API 응답 반환", {
    orderId,
    externalOrderId,
    amount: totalAmount,
  });

  res.json({
    orderId,
    externalOrderId,
    orderName,
    amount: totalAmount,
  });
}));

// 주문 목록 조회
router.get("/", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const orders = await storage.getOrders(userId);
  res.json(orders);
}));

// 주문 상세 조회 (UUID 기반)
router.get("/:id", isAuthenticated, asyncHandler(async (req, res) => {
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
}));

/**
 * 주문 취소
 * POST /api/orders/:id/cancel
 *
 * - pending_payment: 단순 상태 변경으로 취소 (PG사 호출 없음)
 * - payment_confirmed, preparing: PG사 결제 취소 후 상태 변경
 * - shipped, delivered, cancelled: 취소 불가
 */
router.post("/:id/cancel", isAuthenticated, asyncHandler(async (req, res) => {
  const orderId = req.params.id; // UUID 문자열
  const userId = req.session.userId!;

  // 1. 주문 조회
  const order = await storage.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
  }

  // 2. 권한 검증 (본인 또는 관리자)
  const user = await storage.getUser(userId);
  if (order.userId !== userId && !user?.isAdmin) {
    return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
  }

  // 3. 취소 가능 상태 확인
  if (NON_CANCELABLE_STATUSES.includes(order.status as typeof NON_CANCELABLE_STATUSES[number])) {
    return res.status(400).json({
      message: ORDER_MESSAGES.CANNOT_CANCEL(order.status),
    });
  }

  // 4. 취소 사유 검증 (결제 완료 상태에서만 필수)
  const cancelReason = req.body.cancelReason || ORDER_MESSAGES.DEFAULT_CANCEL_REASON;

  // 5. 결제 대기 상태인 경우: 단순 상태 변경 (재고 차감 전이므로 복구 불필요)
  if (order.status === ORDER_STATUS.PENDING_PAYMENT) {
    const updatedOrder = await storage.cancelOrderPayment(orderId, {
      status: ORDER_STATUS.CANCELLED,
      canceledAt: new Date(),
      cancelReason,
    });

    // 주문 아이템 상태도 취소로 변경 (Promise.all로 원자성 향상)
    await Promise.all(
      order.orderItems.map((item) =>
        storage.updateOrderItemStatus(item.id, ORDER_STATUS.CANCELLED)
      )
    );

    logger.info("주문 취소 완료 (결제 전)", { orderId });

    return res.json({
      message: ORDER_MESSAGES.CANCEL_SUCCESS,
      order: updatedOrder,
    });
  }

  // 6. 결제 완료/준비 중 상태인 경우: PG사 결제 취소 필요
  if (!order.paymentKey) {
    return res.status(400).json({
      message: ORDER_MESSAGES.NO_PAYMENT_INFO,
    });
  }

  // 7. 취소 금액 (부분 취소 지원)
  const cancelAmount = req.body.cancelAmount
    ? Number(req.body.cancelAmount)
    : undefined;

  // 8. PG사별 결제 취소 API 호출
  // TODO: 네이버페이 등 다른 PG사 추가 시 order.paymentProvider로 분기
  let payment;
  try {
    payment = await cancelPayment(order.paymentKey, cancelReason, cancelAmount);
  } catch (error) {
    // 토스페이먼츠 에러 처리
    if (error instanceof TossPaymentError) {
      logger.error("주문 취소 에러 (토스)", { code: error.code, message: error.message });
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }
    throw error; // 다른 에러는 글로벌 핸들러로 전달
  }

  // 9. 주문 상태 업데이트
  const newStatus = payment.status === TOSS_PAYMENT_STATUS.CANCELED ? ORDER_STATUS.CANCELLED : order.status;
  const updatedOrder = await storage.cancelOrderPayment(orderId, {
    status: newStatus,
    canceledAt: new Date(),
    cancelReason,
    refundedAmount: cancelAmount?.toString() || order.totalAmount,
  });

  // 10. 재고 복구 (결제 완료된 주문만 재고가 차감되어 있음)
  if (newStatus === ORDER_STATUS.CANCELLED) {
    try {
      await storage.restoreStockOnCancel(orderId);
      logger.info("재고 복구 완료", { orderId });
    } catch (restoreError) {
      // 재고 복구 실패 시 로그 남기고 계속 진행 (관리자 수동 처리 필요)
      logger.error("재고 복구 실패", { orderId, error: restoreError });
    }
  }

  // 11. 주문 아이템 상태도 취소로 변경 (Promise.all로 원자성 향상)
  await Promise.all(
    order.orderItems.map((item) =>
      storage.updateOrderItemStatus(item.id, ORDER_STATUS.CANCELLED)
    )
  );

  logger.info("주문 취소 완료 (결제 취소)", { orderId });

  res.json({
    message: ORDER_MESSAGES.CANCEL_SUCCESS,
    order: updatedOrder,
    refund: {
      cancelAmount: payment.cancels?.[0]?.cancelAmount,
      refundableAmount: payment.cancels?.[0]?.refundableAmount,
      canceledAt: payment.cancels?.[0]?.canceledAt,
    },
  });
}));

/**
 * 주문 삭제
 * DELETE /api/orders/:id
 *
 * - pending_payment 상태의 주문만 삭제 가능
 * - 이미 결제된 주문은 삭제 불가 (취소만 가능)
 * - CASCADE로 인해 order_items도 자동 삭제됨
 * - 재고는 stock_reservation 해제로 이미 복구됨
 */
router.delete("/:id", isAuthenticated, asyncHandler(async (req, res) => {
  const orderId = req.params.id; // UUID 문자열
  const userId = req.session.userId!;

  // 1. 주문 조회
  const order = await storage.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  }

  // 2. 권한 검증 (본인만 삭제 가능)
  if (order.userId !== userId) {
    return res.status(403).json({ message: "권한이 없습니다." });
  }

  // 3. 삭제 가능 상태 확인 (pending_payment 상태만 삭제 가능)
  if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
    return res.status(400).json({
      message: "입금 대기 상태의 주문만 삭제할 수 있습니다. 이미 결제된 주문은 취소를 이용해주세요.",
      code: "CANNOT_DELETE_PAID_ORDER",
    });
  }

  // 4. 재고 복구 (재고 선점 사용한 경우)
  // @ts-ignore - isStockReserved는 새로 추가된 필드
  if (order.isStockReserved) {
    try {
      await storage.restoreStockOnCancel(orderId);
      logger.info("재고 복구 완료 (주문 삭제)", { orderId });
    } catch (restoreError) {
      // 재고 복구 실패 시 로그 남기고 계속 진행 (관리자 수동 처리 필요)
      logger.error("재고 복구 실패 (주문 삭제)", { orderId, error: restoreError });
    }
  }

  // 5. 주문 삭제 (CASCADE로 order_items도 자동 삭제됨)
  await storage.deleteOrder(orderId);

  logger.info("주문 삭제 완료", { orderId, userId });

  res.json({
    message: "주문이 삭제되었습니다.",
  });
}));

export default router;
