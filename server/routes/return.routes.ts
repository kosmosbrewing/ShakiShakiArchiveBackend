// server/routes/return.routes.ts
// 반품 관련 라우트 (/api/returns/*)

import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import {
  returnRequestSchema,
  returnTrackingSchema,
  returnInspectionSchema,
} from "@shared/schema";
import {
  ORDER_MESSAGES,
  AUTH_MESSAGES,
  POST_SHIPPING_STATUSES,
  SELLER_FAULT_REASONS,
  ORDER_ITEM_STATUS,
  calculateRefund,
  formatRefundSummary,
} from "../constants";
import {
  cancelPayment as cancelKakaoPayPayment,
  KakaoPayPaymentError,
} from "../services/kakaopay.service";
import {
  cancelPayment as cancelNaverPayPayment,
  NaverPayPaymentError,
} from "../services/naverpay.service";
import {
  cancelPayment as cancelTossPayment,
  TossPaymentError,
} from "../services/toss.service";
import { createLogger } from "../utils/logger";
import { sendReturnRequestEmail } from "../services/email.service";
import { notifyReturnRequest } from "../services/telegram.service";

const router = Router();
const logger = createLogger("Return");

/**
 * 반품 요청 (배송 후)
 * POST /api/returns
 *
 * 배송 완료된 상품에 대해 반품 요청을 생성합니다.
 * - shipped, delivered 상태의 상품만 반품 가능
 * - 배송 완료 후 7일 이내만 가능
 */
router.post(
  "/",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;

    // 1. 요청 검증
    const validation = returnRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.error.errors });
    }

    const { orderItemId, reason, reasonType } = validation.data;

    // 2. 주문 아이템 조회
    const orderItem = await storage.getOrderItemById(orderItemId);
    if (!orderItem) {
      return res.status(404).json({
        message: ORDER_MESSAGES.PARTIAL_CANCEL_ITEM_NOT_FOUND,
      });
    }

    // 3. 주문 조회 및 소유자 확인
    const order = await storage.getOrder(orderItem.orderId);
    if (!order || order.userId !== userId) {
      return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
    }

    // 4. 배송 완료 상태인지 확인
    const postShippingStatuses = ["shipped", "delivered"];
    if (!postShippingStatuses.includes(orderItem.status)) {
      return res.status(400).json({
        message: ORDER_MESSAGES.RETURN_NOT_DELIVERED,
      });
    }

    // 5. 이미 반품 요청된 상품인지 확인
    const existingReturns = await storage.getReturnsByOrderId(order.id);
    const alreadyRequested = existingReturns.some(
      (r) => r.orderItemId === orderItemId && !["rejected"].includes(r.status)
    );
    if (alreadyRequested) {
      return res.status(400).json({
        message: ORDER_MESSAGES.RETURN_ALREADY_REQUESTED,
      });
    }

    // 6. 반품 기간 확인 (배송 완료 후 7일 이내)
    // 아이템별 deliveredAt 기준 (없으면 주문 updatedAt 폴백)
    const deliveredDate = orderItem.deliveredAt || order.updatedAt;
    const daysSinceDelivered = Math.floor(
      (Date.now() - new Date(deliveredDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceDelivered > 7) {
      return res.status(400).json({
        message: ORDER_MESSAGES.RETURN_PERIOD_EXPIRED,
      });
    }

    // 7. 반품 요청 생성
    const returnRequest = await storage.createReturnRequest({
      orderId: order.id,
      orderItemId,
      userId,
      reason,
      reasonType,
    });

    // 8. 아이템 상태 업데이트
    await storage.updateOrderItemStatus(orderItemId, ORDER_ITEM_STATUS.RETURN_REQUESTED);

    logger.info("반품 요청 생성", {
      returnId: returnRequest.id,
      orderId: order.id,
      orderItemId,
      reasonType,
    });

    // 9. 반품 요청 이메일 및 관리자 알림 발송 (비동기 - fire-and-forget)
    const user = await storage.getUser(userId);

    // Telegram 관리자 알림
    notifyReturnRequest({
      externalOrderId: order.externalOrderId || '',
      userName: user?.userName || '고객',
      productName: orderItem.productName,
      reasonType,
      reason: reason || undefined,
    }).catch(err => logger.error("반품 알림 발송 실패", { returnId: returnRequest.id, error: err instanceof Error ? err.message : String(err) }));

    if (user?.email) {
      sendReturnRequestEmail({
        returnId: returnRequest.id,
        orderId: order.id,
        externalOrderId: order.externalOrderId || '',
        userName: user.userName || '고객',
        email: user.email,
        productName: orderItem.productName,
        reason: reason || '',
        reasonType,
        requestedAt: new Date(),
      }).catch(err => logger.error("반품 요청 이메일 발송 실패", { returnId: returnRequest.id, error: err instanceof Error ? err.message : String(err) }));
    }

    return res.json({
      message: ORDER_MESSAGES.RETURN_REQUEST_SUCCESS,
      returnId: returnRequest.id,
      nextStep: ORDER_MESSAGES.RETURN_NEXT_STEP_TRACKING,
    });
  })
);

/**
 * 반품 운송장 등록
 * PATCH /api/returns/:returnId/tracking
 *
 * 고객이 반품 상품을 발송 후 운송장 번호를 등록합니다.
 */
router.patch(
  "/:returnId/tracking",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const { returnId } = req.params;
    const userId = req.session.userId!;

    // 1. 요청 검증
    const validation = returnTrackingSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.error.errors });
    }

    const { trackingNumber, courierCompany } = validation.data;

    // 2. 반품 요청 조회 및 소유자 확인
    const returnRequest = await storage.getReturnRequest(returnId);
    if (!returnRequest) {
      return res.status(404).json({ message: ORDER_MESSAGES.RETURN_NOT_FOUND });
    }
    if (returnRequest.userId !== userId) {
      return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
    }

    // 3. 운송장 등록
    await storage.updateReturnTracking(returnId, {
      trackingNumber,
      courierCompany,
      status: "in_transit",
    });

    // 4. 아이템 상태 업데이트
    await storage.updateOrderItemStatus(
      returnRequest.orderItemId,
      ORDER_ITEM_STATUS.RETURN_IN_TRANSIT
    );

    logger.info("반품 운송장 등록", {
      returnId,
      trackingNumber,
      courierCompany,
    });

    return res.json({
      message: ORDER_MESSAGES.RETURN_TRACKING_UPDATED,
      nextStep: ORDER_MESSAGES.RETURN_NEXT_STEP_INSPECTION,
    });
  })
);

/**
 * 내 반품 목록 조회
 * GET /api/returns
 */
router.get(
  "/",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const returns = await storage.getReturnsByUserId(userId);
    return res.json(returns);
  })
);

/**
 * 반품 상세 조회
 * GET /api/returns/:returnId
 */
router.get(
  "/:returnId",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const { returnId } = req.params;
    const userId = req.session.userId!;

    const returnRequest = await storage.getReturnRequest(returnId);
    if (!returnRequest) {
      return res.status(404).json({ message: ORDER_MESSAGES.RETURN_NOT_FOUND });
    }

    // 본인 또는 관리자만 조회 가능
    const user = await storage.getUser(userId);
    if (returnRequest.userId !== userId && !user?.isAdmin) {
      return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
    }

    return res.json(returnRequest);
  })
);

/**
 * [관리자] 반품 상품 도착 처리
 * PATCH /api/returns/:returnId/receive
 *
 * 반품 상품이 도착했음을 표시합니다.
 */
router.patch(
  "/:returnId/receive",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req, res) => {
    const { returnId } = req.params;

    const returnRequest = await storage.getReturnRequest(returnId);
    if (!returnRequest) {
      return res.status(404).json({ message: ORDER_MESSAGES.RETURN_NOT_FOUND });
    }

    // 상태 업데이트
    await storage.updateReturnTracking(returnId, {
      trackingNumber: returnRequest.returnTrackingNumber || "",
      courierCompany: returnRequest.returnCourierCompany || "",
      status: "received",
    });

    await storage.updateOrderItemStatus(
      returnRequest.orderItemId,
      ORDER_ITEM_STATUS.RETURN_RECEIVED
    );

    logger.info("반품 상품 도착 처리", { returnId });

    return res.json({ message: "반품 상품 도착이 확인되었습니다." });
  })
);

/**
 * [관리자] 반품 검수 완료 및 환불 처리
 * PATCH /api/returns/:returnId/inspect
 *
 * 검수 후 승인 시 환불을 진행합니다.
 */
router.patch(
  "/:returnId/inspect",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (req, res) => {
    const { returnId } = req.params;

    // 1. 요청 검증
    const validation = returnInspectionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.error.errors });
    }

    const { result, note } = validation.data;

    // 2. 반품 요청 조회
    const returnRequest = await storage.getReturnRequest(returnId);
    if (!returnRequest) {
      return res.status(404).json({ message: ORDER_MESSAGES.RETURN_NOT_FOUND });
    }

    // 3. 검수 거절
    if (result === "rejected") {
      await storage.updateReturnInspection(returnId, {
        result: "rejected",
        note,
      });

      // 아이템 상태를 delivered로 복구 (재반품 가능하도록)
      await storage.updateOrderItemStatus(
        returnRequest.orderItemId,
        ORDER_ITEM_STATUS.DELIVERED
      );

      // 부모 주문 상태 동기화
      await storage.syncOrderStatusFromItems(returnRequest.orderId);

      logger.info("반품 검수 거절 - 아이템 상태 복구", {
        returnId,
        orderItemId: returnRequest.orderItemId,
        note,
      });

      return res.json({
        message: ORDER_MESSAGES.RETURN_INSPECTION_REJECTED,
        reason: note,
      });
    }

    // 4. 검수 승인: 환불 진행
    const order = await storage.getOrder(returnRequest.orderId);
    if (!order) {
      return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
    }

    const orderItem = await storage.getOrderItemById(returnRequest.orderItemId);
    if (!orderItem) {
      return res.status(404).json({ message: ORDER_MESSAGES.ITEM_NOT_FOUND });
    }

    const orderItems = await storage.getOrderItemsByOrderId(order.id);

    // 마지막 상품인지 확인
    const activeItems = orderItems.filter(
      (i) => !["refunded", "cancelled"].includes(i.status) && i.id !== orderItem.id
    );
    const isLastItem = activeItems.length === 0;

    // 판매자 귀책 여부
    const isSellerFault = (SELLER_FAULT_REASONS as readonly string[]).includes(
      returnRequest.reasonType
    );

    // 환불 금액 계산
    const itemAmount = parseFloat(orderItem.productPrice) * orderItem.quantity;

    const refundResult = calculateRefund({
      itemsAmount: itemAmount,
      paidShippingFee: parseFloat(order.shippingFee),
      totalOrderAmount: parseFloat(order.itemsAmount),
      alreadyRefundedAmount: parseFloat(order.refundedAmount || "0"),
      isLastItems: isLastItem,
      isSellerFault,
      isAfterShipping: true,
      penaltyAlreadyApplied: (order as any).shippingPenaltyApplied || false,
    });

    logger.info("반품 환불 금액 계산", {
      returnId,
      orderId: order.id,
      itemAmount,
      refundResult,
      isLastItem,
      isSellerFault,
    });

    // 5. PG사 환불 호출
    const provider = order.paymentProvider;
    const supportedProviders = ["kakaopay", "naverpay", "toss"];

    if (!order.paymentKey || !supportedProviders.includes(provider || "")) {
      return res.status(400).json({
        message: "환불을 지원하지 않는 결제 수단입니다.",
        code: "RETURN_REFUND_NOT_SUPPORTED",
      });
    }

    try {
      if (provider === "kakaopay") {
        await cancelKakaoPayPayment({
          tid: order.paymentKey,
          cancel_amount: refundResult.totalRefund,
          cancel_tax_free_amount: 0,
        });
      } else if (provider === "naverpay") {
        await cancelNaverPayPayment({
          paymentId: order.paymentKey,
          cancelAmount: refundResult.totalRefund,
          cancelReason: `반품 환불: ${returnRequest.reason}`,
          cancelRequester: "2", // 2: 가맹점 관리자
          taxScopeAmount: refundResult.totalRefund,
          taxExScopeAmount: 0,
        });
      } else if (provider === "toss") {
        await cancelTossPayment(
          order.paymentKey,
          `반품 환불: ${returnRequest.reason}`,
          refundResult.totalRefund
        );
      }

      logger.info("반품 환불 완료", {
        returnId,
        provider,
        cancelAmount: refundResult.totalRefund,
      });
    } catch (error) {
      if (error instanceof KakaoPayPaymentError) {
        logger.error("카카오페이 반품 환불 실패", {
          returnId,
          error: error.message,
          code: error.code,
        });
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }
      if (error instanceof NaverPayPaymentError) {
        logger.error("네이버페이 반품 환불 실패", {
          returnId,
          error: error.message,
          code: error.code,
        });
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }
      if (error instanceof TossPaymentError) {
        logger.error("토스페이먼츠 반품 환불 실패", {
          returnId,
          error: error.message,
          code: error.code,
        });
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }
      throw error;
    }

    // 6. DB 업데이트
    await storage.completeReturn(returnId, {
      refundAmount: refundResult.totalRefund,
      inspectionResult: "approved",
      inspectionNote: note,
      updatePenaltyFlag: refundResult.shouldUpdatePenaltyFlag,
      isLastItem,
    });

    logger.info("반품 완료", {
      returnId,
      orderId: order.id,
      refundAmount: refundResult.totalRefund,
    });

    return res.json({
      message: ORDER_MESSAGES.RETURN_INSPECTION_APPROVED,
      refundDetails: refundResult,
      summary: formatRefundSummary(refundResult),
    });
  })
);

/**
 * [관리자] 전체 반품 목록 조회
 * GET /api/returns/admin/all
 */
router.get(
  "/admin/all",
  isAuthenticated,
  isAdmin,
  asyncHandler(async (_req, res) => {
    // 모든 주문의 반품 목록을 조회하려면 별도 쿼리 필요
    // 현재는 간단히 구현
    return res.json({
      message: "관리자 전체 반품 목록 조회 API",
      note: "추후 구현 예정",
    });
  })
);

export default router;
