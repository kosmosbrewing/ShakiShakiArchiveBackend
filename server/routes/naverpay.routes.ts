// server/routes/naverpay.routes.ts
// 네이버페이 결제 라우트

import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { paymentRateLimiter } from "../config/security";
import { config } from "../config";
import {
  reservePayment,
  applyPayment,
  getPayment as getNaverPayPayment,
  cancelPayment as cancelNaverPayPayment,
  NaverPayPaymentError,
  mapNaverPayStatusToOrderStatus,
} from "../services/naverpay.service";

const router = Router();

// 결제 예약 요청 스키마
const reservePaymentSchema = z.object({
  orderId: z.string().uuid("유효한 주문 ID가 아닙니다"),
});

// 결제 취소 요청 스키마
const cancelPaymentSchema = z.object({
  cancelReason: z.string().min(1, "취소 사유를 입력해주세요"),
  cancelAmount: z.number().positive().optional(), // 부분 취소 시
});

/**
 * 네이버페이 활성화 여부 확인 미들웨어
 */
function checkNaverPayEnabled(
  _req: any,
  res: any,
  next: any
) {
  if (!config.naverpay.isEnabled) {
    return res.status(503).json({
      message: "네이버페이 서비스가 비활성화되어 있습니다",
    });
  }
  next();
}

/**
 * 네이버페이 클라이언트 정보 조회
 * GET /api/payments/naverpay/client-info
 */
router.get("/client-info", checkNaverPayEnabled, (_req, res) => {
  res.json({
    clientId: config.naverpay.clientId,
    merchantId: config.naverpay.merchantId,
    mode: config.naverpay.mode,
  });
});

/**
 * 결제 예약 (Reserve)
 * POST /api/payments/naverpay/reserve
 *
 * 주문 ID를 받아서 네이버페이 결제 예약 후 결제 페이지 URL 반환
 */
router.post(
  "/reserve",
  paymentRateLimiter,
  checkNaverPayEnabled,
  isAuthenticated,
  async (req, res) => {
    try {
      // 1. 요청 데이터 검증
      const validationResult = reservePaymentSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "잘못된 요청 데이터입니다",
          errors: validationResult.error.flatten().fieldErrors,
        });
      }

      const { orderId } = validationResult.data;
      const userId = req.session.userId!;

      // 2. 주문 조회
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "주문을 찾을 수 없습니다" });
      }

      // 3. 주문 소유자 검증
      if (order.userId !== userId) {
        return res.status(403).json({ message: "권한이 없습니다" });
      }

      // 4. 결제 대기 상태 확인
      if (order.status !== "pending_payment") {
        return res.status(400).json({ message: "이미 처리된 주문입니다" });
      }

      // 5. 주문 상품명 생성
      const productNames = order.orderItems.map((item) => item.productName);
      const productName =
        productNames.length > 1
          ? `${productNames[0]} 외 ${productNames.length - 1}건`
          : productNames[0] || "상품";

      // 6. 네이버페이 결제 예약
      const totalAmount = parseFloat(order.totalAmount);
      const reserveResult = await reservePayment({
        merchantPayKey: order.externalOrderId || order.id,
        productName,
        productCount: order.orderItems.length,
        totalPayAmount: totalAmount,
        taxScopeAmount: totalAmount, // 전액 과세로 가정
        taxExScopeAmount: 0,
        returnUrl: `${config.naverpay.returnUrl}?orderId=${orderId}`,
      });

      console.log(
        `[NaverPay] 결제 예약 완료: orderId=${orderId}, reserveId=${reserveResult.body?.reserveId}`
      );

      res.json({
        message: "결제 예약이 완료되었습니다",
        reserveId: reserveResult.body?.reserveId,
        paymentUrl: reserveResult.body?.paymentUrl,
      });
    } catch (error) {
      if (error instanceof NaverPayPaymentError) {
        console.error(`[NaverPay Reserve Error] ${error.code}: ${error.message}`);
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }

      console.error("[NaverPay Reserve Error]", error);
      const message =
        error instanceof Error ? error.message : "결제 예약 중 오류가 발생했습니다";
      res.status(500).json({ message });
    }
  }
);

/**
 * 결제 콜백 (Callback)
 * GET /api/payments/naverpay/callback
 *
 * 네이버페이 결제 완료 후 리다이렉트되는 URL
 * paymentId를 받아서 결제 승인 처리 후 프론트엔드로 리다이렉트
 */
router.get("/callback", async (req, res) => {
  try {
    const { orderId, paymentId, resultCode, resultMessage } = req.query as {
      orderId?: string;
      paymentId?: string;
      resultCode?: string;
      resultMessage?: string;
    };

    // 결제 실패 시
    if (resultCode !== "Success" || !paymentId) {
      console.error(
        `[NaverPay Callback] 결제 실패: code=${resultCode}, message=${resultMessage}`
      );
      return res.redirect(
        `${config.frontendUrl}/checkout/fail?message=${encodeURIComponent(resultMessage || "결제가 취소되었습니다")}`
      );
    }

    if (!orderId) {
      return res.redirect(
        `${config.frontendUrl}/checkout/fail?message=${encodeURIComponent("주문 정보가 없습니다")}`
      );
    }

    // 주문 조회
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.redirect(
        `${config.frontendUrl}/checkout/fail?message=${encodeURIComponent("주문을 찾을 수 없습니다")}`
      );
    }

    // 이미 처리된 주문인지 확인
    if (order.status !== "pending_payment") {
      return res.redirect(
        `${config.frontendUrl}/orders/${orderId}?already_paid=true`
      );
    }

    // 결제 승인 API 호출
    const applyResult = await applyPayment(paymentId);

    if (!applyResult.body) {
      throw new Error("결제 승인 응답이 없습니다");
    }

    // 주문 상태 업데이트
    await storage.updateOrderPayment(orderId, {
      paymentProvider: "naverpay",
      paymentKey: applyResult.body.paymentId,
      externalOrderId: applyResult.body.merchantPayKey,
      paymentMethod: applyResult.body.admissionTypeCode.toLowerCase(),
      status: "payment_confirmed",
      paidAt: new Date(),
    });

    // 주문 아이템 상태도 업데이트
    for (const item of order.orderItems) {
      await storage.updateOrderItemStatus(item.id, "payment_confirmed");
    }

    console.log(
      `[NaverPay] 결제 승인 완료: orderId=${orderId}, paymentId=${paymentId}`
    );

    // 프론트엔드 결제 완료 페이지로 리다이렉트
    res.redirect(`${config.frontendUrl}/checkout/success?orderId=${orderId}`);
  } catch (error) {
    console.error("[NaverPay Callback Error]", error);
    const message =
      error instanceof Error ? error.message : "결제 처리 중 오류가 발생했습니다";
    res.redirect(
      `${config.frontendUrl}/checkout/fail?message=${encodeURIComponent(message)}`
    );
  }
});

/**
 * 결제 상태 조회
 * GET /api/payments/naverpay/:orderId/status
 */
router.get(
  "/:orderId/status",
  checkNaverPayEnabled,
  isAuthenticated,
  async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const userId = req.session.userId!;

      // 주문 조회
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "주문을 찾을 수 없습니다" });
      }

      // 권한 검증
      const user = await storage.getUser(userId);
      if (order.userId !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: "권한이 없습니다" });
      }

      // 결제 키가 없거나 네이버페이가 아니면 DB 상태만 반환
      if (!order.paymentKey || order.paymentProvider !== "naverpay") {
        return res.json({
          orderId: order.id,
          status: order.status,
          paymentInfo: null,
        });
      }

      // 네이버페이에서 최신 결제 정보 조회
      const payment = await getNaverPayPayment(order.paymentKey);

      res.json({
        orderId: order.id,
        status: order.status,
        paymentInfo: payment.body
          ? {
              paymentId: payment.body.paymentId,
              status: payment.body.paymentStatus,
              totalPayAmount: payment.body.totalPayAmount,
              remainAmount: payment.body.remainAmount,
              payTime: payment.body.payTime,
              cancelTime: payment.body.cancelTime,
              cancelAmount: payment.body.cancelAmount,
            }
          : null,
      });
    } catch (error) {
      if (error instanceof NaverPayPaymentError) {
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }

      console.error("[NaverPay Status Error]", error);
      const message =
        error instanceof Error ? error.message : "결제 조회 중 오류가 발생했습니다";
      res.status(500).json({ message });
    }
  }
);

/**
 * 결제 취소
 * POST /api/payments/naverpay/:orderId/cancel
 */
router.post(
  "/:orderId/cancel",
  paymentRateLimiter,
  checkNaverPayEnabled,
  isAuthenticated,
  async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const userId = req.session.userId!;

      // 1. 요청 데이터 검증
      const validationResult = cancelPaymentSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "잘못된 요청 데이터입니다",
          errors: validationResult.error.flatten().fieldErrors,
        });
      }

      const { cancelReason, cancelAmount } = validationResult.data;

      // 2. 주문 조회
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "주문을 찾을 수 없습니다" });
      }

      // 3. 권한 검증
      const user = await storage.getUser(userId);
      if (order.userId !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: "권한이 없습니다" });
      }

      // 4. 결제 정보 확인
      if (!order.paymentKey || order.paymentProvider !== "naverpay") {
        return res.status(400).json({
          message: "네이버페이 결제 정보가 없습니다",
        });
      }

      // 5. 취소 가능 상태 확인
      const cancelableStatuses = ["payment_confirmed", "preparing"];
      if (!cancelableStatuses.includes(order.status)) {
        return res.status(400).json({
          message: `현재 상태(${order.status})에서는 취소할 수 없습니다`,
        });
      }

      // 6. 취소 금액 결정 (부분 취소 또는 전체 취소)
      const amount = cancelAmount || parseFloat(order.totalAmount);

      // 7. 네이버페이 결제 취소 API 호출
      const cancelResult = await cancelNaverPayPayment(
        order.paymentKey,
        amount,
        cancelReason,
        user?.isAdmin ? "2" : "1" // 관리자면 가맹점 관리자로 표시
      );

      // 8. 주문 상태 업데이트
      const newStatus =
        cancelResult.body?.remainAmount === 0 ? "cancelled" : order.status;
      await storage.cancelOrderPayment(orderId, {
        status: newStatus,
        canceledAt: new Date(),
        cancelReason,
        refundedAmount: cancelResult.body?.cancelAmount.toString(),
      });

      console.log(`[NaverPay] 결제 취소 완료: orderId=${orderId}`);

      res.json({
        message: "결제가 취소되었습니다",
        refund: {
          cancelAmount: cancelResult.body?.cancelAmount,
          remainAmount: cancelResult.body?.remainAmount,
          cancelTime: cancelResult.body?.cancelTime,
        },
      });
    } catch (error) {
      if (error instanceof NaverPayPaymentError) {
        console.error(`[NaverPay Cancel Error] ${error.code}: ${error.message}`);
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }

      console.error("[NaverPay Cancel Error]", error);
      const message =
        error instanceof Error ? error.message : "결제 취소 중 오류가 발생했습니다";
      res.status(500).json({ message });
    }
  }
);

export default router;
