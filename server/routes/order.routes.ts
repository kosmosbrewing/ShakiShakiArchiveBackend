// server/routes/order.routes.ts
// 주문 관련 라우트 (/api/orders/*)

import { Router } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { insertOrderSchema, createOrderRequestSchema, stockReservations, orders } from "@shared/schema";
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
  const { directPurchaseItem } = validatedBody;

  // 🔒 Option A: 재고 선점 제거 - 주문 생성 시 재고 확인 및 차감

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

      // 🔒 보안: 재고 확인은 storage.createOrder()에서 수행 (Self-Lock Bypass 포함)
      // 여기서는 간단한 사전 확인만 수행
      if (variant.stockQuantity < quantity) {
        logger.warn("재고 부족 (사전 확인)", {
          userId,
          productId,
          variantId,
          requested: quantity,
          available: variant.stockQuantity,
          note: "Self-Lock Bypass로 재시도 가능"
        });
        // 재고 부족 경고만 로그에 남기고, 실제 확인은 createOrder에서 수행
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

      // 옵션 재고 확인 (사전 확인, 실제 확인은 storage.createOrder에서 수행)
      if (item.variant) {
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

        // 재고 부족 사전 경고 (Self-Lock Bypass로 재시도 가능하므로 에러는 아님)
        if (item.variant.stockQuantity < item.quantity) {
          logger.warn("장바구니 상품 재고 부족 (사전 확인)", {
            userId,
            productId: item.productId,
            variantId: item.variantId,
            requested: item.quantity,
            available: item.variant.stockQuantity,
            note: "Self-Lock Bypass로 재시도 가능"
          });
          // 실제 재고 확인은 createOrder에서 수행
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
    // 🔒 CRITICAL: 주문 생성 시 재고를 차감하므로 isStockReserved = true
    // - storage.createOrder()가 재고를 차감함
    // - 결제 승인 시 confirmOrderWithStockLock을 호출하지 않음 (이중 차감 방지)
    // - 결제 승인 시 updateOrderPayment만 호출 (상태만 업데이트)
    isStockReserved: true,
  });

  // 🔍 디버깅: isStockReserved 설정 확인
  logger.info("🔍 주문 생성 - isStockReserved 설정", {
    userId,
    externalOrderId,
    isStockReserved: orderData.isStockReserved,
    message: "✅ 주문 생성 시 재고 차감 예정 - 결제 승인 시 재고 체크 건너뜀",
  });

  // 🔒 주문 생성 시 재고 확인 및 차감 (Self-Lock Bypass 포함)
  logger.info("주문 생성 시작 (재고 확인 + 차감 + DB 저장)", {
    userId,
    totalAmount,
    itemCount: orderItemsData.length,
    externalOrderId,
  });

  const orderId = await storage.createOrder(orderData, orderItemsData);

  logger.info("주문 생성 완료 - 재고 차감 및 DB 저장 성공", {
    userId,
    orderId,
    externalOrderId,
    totalAmount,
    status: ORDER_STATUS.PENDING_PAYMENT,
  });

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
 * 주문 상태를 paying으로 변경
 * PUT /api/orders/:id/status/paying
 *
 * 토스페이먼츠 결제창 오픈 직전 호출
 * - pending_payment → paying 전이만 허용
 * - 원자적 업데이트로 중복 호출 방지
 */
router.put("/:id/status/paying", isAuthenticated, asyncHandler(async (req, res) => {
  const orderId = req.params.id;
  const userId = req.session.userId!;

  // 1. 주문 조회 및 권한 확인
  const order = await storage.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
  }

  if (order.userId !== userId) {
    return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
  }

  // 2. 상태 전이 검증
  if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
    logger.warn("잘못된 상태 전이 시도", {
      orderId,
      userId,
      currentStatus: order.status,
      targetStatus: ORDER_STATUS.PAYING,
    });
    return res.status(400).json({
      message: "결제 진행 상태로 변경할 수 없습니다.",
      code: "INVALID_STATUS_TRANSITION",
      currentStatus: order.status,
    });
  }

  // 3. 🔒 트랜잭션으로 주문 및 주문 아이템 상태 동시 업데이트
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 3-1. 주문 상태 업데이트 (원자적 업데이트로 중복 호출 방지)
    const orderResult = await client.query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND status = $3
       RETURNING *`,
      [ORDER_STATUS.PAYING, orderId, ORDER_STATUS.PENDING_PAYMENT]
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      logger.warn("원자적 상태 업데이트 실패 (경쟁 조건)", { orderId, userId });
      return res.status(409).json({
        message: "주문 상태가 이미 변경되었습니다.",
        code: "CONCURRENT_UPDATE_CONFLICT",
      });
    }

    // 3-2. 주문 아이템 상태 일괄 업데이트
    await client.query(
      `UPDATE order_items
       SET status = $1
       WHERE order_id = $2`,
      [ORDER_STATUS.PAYING, orderId]
    );

    await client.query("COMMIT");

    logger.info("주문 상태 변경: paying (주문 + 아이템)", { orderId, userId });

    res.json({
      message: "결제 진행 상태로 변경되었습니다.",
      order: orderResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * 🔒 브라우저 강제 종료 시 Best Effort 정리
 * POST /api/orders/:id/cleanup
 *
 * sendBeacon으로 호출되는 엔드포인트
 * - paying 상태 주문만 처리 (즉시 재고 복구)
 * - 응답을 기다리지 않으므로 빠르게 처리
 * - 실패해도 Cron Job이 5분 후 정리함
 */
router.post("/:id/cleanup", isAuthenticated, asyncHandler(async (req, res) => {
  const orderId = req.params.id;
  const userId = req.session.userId!;

  try {
    // 1. 주문 조회
    const order = await storage.getOrder(orderId);
    if (!order) {
      // 주문이 없어도 성공 응답 (이미 정리되었거나 없는 경우)
      return res.json({ success: true, message: "주문이 존재하지 않습니다" });
    }

    // 2. 권한 검증
    if (order.userId !== userId) {
      return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
    }

    // 3. 🔒 상태 기반 cleanup 로직 (시간 기반 대신 사용)
    //
    // paying 상태: 결제 진행 중 → 무조건 보호
    // - 프론트엔드가 결제창 오픈 직전에 paying으로 변경 (Order.vue:422-428)
    // - 토스/네이버페이 결제창이 열려 있고 사용자가 결제 정보 입력 중
    // - 시간에 관계없이 결제가 완료될 때까지 보호
    //
    // pending_payment 상태: 결제창 열기 전 → cleanup 실행
    // - 주문은 생성했지만 결제창을 아직 열지 않음
    // - 브라우저 이탈 시 즉시 재고 복구 필요
    //
    // 기타 상태 (payment_confirmed, cancelled 등): 무시
    // - 이미 결제 완료되었거나 취소됨

    if (order.status === ORDER_STATUS.PAYING) {
      logger.info("cleanup 요청 무시 (결제 진행 중)", {
        orderId,
        status: order.status,
        message: "결제창이 열려 있어 보호합니다",
      });
      return res.json({
        success: true,
        message: "결제 진행 중입니다. 결제를 완료해주세요."
      });
    }

    if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
      logger.info("cleanup 요청 무시 (정리 대상 상태 아님)", {
        orderId,
        status: order.status,
      });
      return res.json({
        success: true,
        message: `${order.status} 상태는 정리 대상이 아닙니다`
      });
    }

    // 4. pending_payment 상태: cleanup 실행
    logger.info("cleanup 실행 (pending_payment 상태)", {
      orderId,
      status: order.status,
      message: "결제창 열기 전 이탈 - 재고 복구 시작",
    });

    // 5. 재고 복구 + 주문 취소 (트랜잭션)
    // 🔒 Option A: 주문 생성 시 즉시 재고 차감하므로 항상 복구 필요
    const shouldRestoreStock = true;

    await storage.cancelOrderBeforePayment(orderId, {
      cancelReason: "브라우저 강제 종료 (sendBeacon)",
      restoreStock: shouldRestoreStock,
    });

    logger.info("브라우저 강제 종료 - 재고 복구 완료", {
      orderId,
      userId,
      externalOrderId: order.externalOrderId,
    });

    res.json({ success: true, message: "재고 복구 완료" });
  } catch (error) {
    logger.error("cleanup 실패 (Cron이 나중에 처리)", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });

    // 에러가 발생해도 200 응답 (sendBeacon은 응답을 무시하므로)
    res.json({ success: false, message: "cleanup 실패, Cron이 처리합니다" });
  }
}));

/**
 * 주문 취소/환불
 * POST /api/orders/:id/cancel
 *
 * 상태 전이:
 * - pending_payment, paying → cancelled (결제 전 취소, PG사 호출 불필요)
 * - payment_confirmed, preparing → refunded (결제 후 환불, PG사 환불 API 호출)
 * - shipped, delivered, cancelled, refunded: 취소 불가
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

  // 4. 취소 사유 검증
  const cancelReason = req.body.cancelReason || ORDER_MESSAGES.DEFAULT_CANCEL_REASON;

  // 5. 🔒 Critical Issue 1 수정: 결제 전 취소 - 트랜잭션 기반 처리
  if (order.status === ORDER_STATUS.PENDING_PAYMENT || order.status === ORDER_STATUS.PAYING) {
    // 🔒 Option A: 주문 생성 시 즉시 재고 차감하므로 항상 복구 필요
    const shouldRestoreStock = true;

    // 트랜잭션으로 재고 복구 + 주문 상태 + 아이템 상태 업데이트
    const updatedOrder = await storage.cancelOrderBeforePayment(orderId, {
      cancelReason,
      restoreStock: shouldRestoreStock,
    });

    if (!updatedOrder) {
      return res.status(500).json({
        message: "주문 취소 중 오류가 발생했습니다.",
        code: "CANCEL_FAILED",
      });
    }

    logger.info("주문 취소 완료 (결제 전/진행 중)", {
      orderId,
      previousStatus: order.status,
      isStockReserved: shouldRestoreStock,
    });

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

  // 7. 🔒 Critical Issue 3 수정: 부분 취소 차단 (전체 환불만 지원)
  // 모든 형태의 부분 환불 시도를 원천 차단
  if (req.body.cancelAmount || req.body.cancelItems || req.body.itemIds) {
    logger.warn("부분 취소 시도 차단", {
      orderId,
      cancelAmount: req.body.cancelAmount,
      cancelItems: req.body.cancelItems,
      itemIds: req.body.itemIds
    });
    return res.status(400).json({
      message: "부분 취소는 지원하지 않습니다. 전체 환불만 가능합니다.",
      code: "PARTIAL_CANCEL_NOT_SUPPORTED",
    });
  }

  // 8. 🔒 Critical Issue 2 수정: PG사 환불 전 중간 상태로 변경
  // 환불 진행 중 상태로 먼저 변경 (PG사 환불 성공했지만 DB 실패 방지)
  await storage.cancelOrderPayment(orderId, {
    status: "refunding" as any,  // 중간 상태
    canceledAt: new Date(),
    cancelReason: `${cancelReason} (환불 진행 중)`,
  });

  logger.info("환불 진행 중 상태로 변경", { orderId });

  // 9. PG사별 결제 취소 API 호출 (전체 환불)
  // TODO: 네이버페이 등 다른 PG사 추가 시 order.paymentProvider로 분기
  let payment;
  try {
    payment = await cancelPayment(order.paymentKey, cancelReason, undefined);  // 전체 환불
  } catch (error) {
    // PG사 환불 실패 시 상태 되돌리기
    await storage.cancelOrderPayment(orderId, {
      status: order.status,  // 원래 상태로 복구
      canceledAt: new Date(),
      cancelReason: `환불 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
    });

    logger.error("PG사 환불 실패 - 주문 상태 복구", { orderId, originalStatus: order.status });

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

  // 10. 🔒 PG사 환불 성공 후 트랜잭션으로 상태 업데이트 + 재고 복구
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 주문 상태 업데이트
    const newStatus = payment.status === TOSS_PAYMENT_STATUS.CANCELED ? ORDER_STATUS.REFUNDED : order.status;
    await client.query(
      `UPDATE orders
       SET status = $1,
           canceled_at = NOW(),
           cancel_reason = $2,
           refunded_amount = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [newStatus, cancelReason, order.totalAmount, orderId]
    );

    // 주문 아이템 상태 일괄 업데이트
    await client.query(
      `UPDATE order_items
       SET status = $1
       WHERE order_id = $2`,
      [ORDER_STATUS.REFUNDED, orderId]
    );

    // 재고 복구 (결제 완료 후는 항상 재고 차감되어 있음)
    // 🔒 normalizeSize 함수 (createOrder와 동일)
    const normalizeSize = (size: string): string => {
      return size.trim().toLowerCase();
    };

    const itemsResult = await client.query(
      `SELECT oi.product_id, oi.quantity, oi.options
       FROM order_items oi
       WHERE oi.order_id = $1`,
      [orderId]
    );

    logger.info("재고 복구 시작 (결제 후 환불)", {
      orderId,
      itemCount: itemsResult.rows.length,
    });

    for (const item of itemsResult.rows) {
      // 옵션에서 사이즈 추출 (공백 포함된 사이즈도 처리: "X Large", "Free Size" 등)
      let variantSize: string | null = null;
      if (item.options) {
        const match = item.options.match(/Size:\s*(.+?)$/im);
        if (match) {
          // 🔒 normalizeSize 적용 (createOrder와 동일하게)
          variantSize = normalizeSize(match[1]);
        }
      }

      if (variantSize) {
        const updateResult = await client.query(
          `UPDATE product_variants
           SET stock_quantity = stock_quantity + $1, updated_at = NOW()
           WHERE product_id = $2 AND LOWER(TRIM(size)) = $3
           RETURNING id, size, stock_quantity`,
          [item.quantity, item.product_id, variantSize]
        );

        if (updateResult.rows.length > 0) {
          logger.info("재고 복구 완료 (variant)", {
            productId: item.product_id,
            size: updateResult.rows[0].size,
            quantity: item.quantity,
            newStock: updateResult.rows[0].stock_quantity,
          });
        } else {
          logger.warn("재고 복구 실패 - variant 찾을 수 없음", {
            productId: item.product_id,
            size: variantSize,
          });
        }
      } else {
        const updateResult = await client.query(
          `UPDATE product_variants
           SET stock_quantity = stock_quantity + $1, updated_at = NOW()
           WHERE product_id = $2
           AND id = (
             SELECT id FROM product_variants
             WHERE product_id = $2
             ORDER BY created_at ASC
             LIMIT 1
           )
           RETURNING id, size, stock_quantity`,
          [item.quantity, item.product_id]
        );

        if (updateResult.rows.length > 0) {
          logger.info("재고 복구 완료 (기본 variant)", {
            productId: item.product_id,
            size: updateResult.rows[0].size,
            quantity: item.quantity,
            newStock: updateResult.rows[0].stock_quantity,
          });
        }
      }
    }

    logger.info("재고 복구 완료 (결제 후 환불)", { orderId });

    await client.query("COMMIT");
    logger.info("주문 환불 완료 (트랜잭션)", { orderId });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("환불 후 상태 업데이트/재고 복구 실패", { orderId, error });
    throw error;
  } finally {
    client.release();
  }

  // 11. 최종 주문 조회
  const finalOrder = await storage.getOrder(orderId);

  res.json({
    message: ORDER_MESSAGES.CANCEL_SUCCESS,
    order: finalOrder,
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

  // 3. 🔒 임시 조치: 주문 삭제 기능 완전 차단
  // 프론트엔드에서 결제 중 주문을 삭제하는 문제 방지
  logger.warn("주문 삭제 시도 (삭제 기능 차단됨)", {
    orderId,
    userId,
    status: order.status,
    hint: "주문 취소 API (POST /api/orders/:id/cancel)를 사용하세요",
  });

  return res.status(400).json({
    message: "주문 삭제 기능이 비활성화되었습니다. 주문 취소를 이용해주세요.",
    code: "DELETE_DISABLED",
    cancelEndpoint: `/api/orders/${orderId}/cancel`,
  });

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

  // 5. 🔒 원자적 삭제 (WHERE status = 'pending_payment')
  // 삭제 시도와 상태 확인을 원자적으로 처리하여 경쟁 조건 방지
  const deleted = await db
    .delete(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.status, ORDER_STATUS.PENDING_PAYMENT)
      )
    )
    .returning();

  if (deleted.length === 0) {
    logger.warn("원자적 삭제 실패 (상태가 변경됨)", { orderId, userId });
    return res.status(409).json({
      message: "주문 상태가 변경되어 삭제할 수 없습니다.",
      code: "ORDER_STATUS_CHANGED",
    });
  }

  logger.info("주문 삭제 완료", { orderId, userId });

  res.json({
    message: "주문이 삭제되었습니다.",
  });
}));

export default router;
