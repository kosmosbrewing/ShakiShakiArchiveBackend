// server/routes/naverpay.routes.ts
// 네이버페이 결제 라우트
// 참고: 네이버페이는 클라이언트 SDK에서 결제창을 호출하므로
// 서버에서는 결제 승인(apply), 조회, 취소 API만 처리합니다.

import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { paymentRateLimiter } from "../config/security";
import { config } from "../config";
import {
  applyPayment,
  getPayment as getNaverPayPayment,
  cancelPayment as cancelNaverPayPayment,
  cancelPaymentSimple,
  NaverPayPaymentError,
  mapNaverPayStatusToOrderStatus,
  getNaverPaySDKConfig,
} from "../services/naverpay.service";
import { createLogger } from "../utils/logger";

const router = Router();
const logger = createLogger("NaverPay");

// 결제 취소 요청 스키마
const cancelPaymentSchema = z.object({
  cancelReason: z.string().min(1, "취소 사유를 입력해주세요").max(256),
  cancelAmount: z.number().positive().optional(), // 부분 취소 시
  taxScopeAmount: z.number().nonnegative().optional(), // 과세 금액
  taxExScopeAmount: z.number().nonnegative().optional(), // 면세 금액
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
 * 네이버페이 SDK 설정 정보 조회
 * GET /api/payments/naverpay/sdk-config
 *
 * 클라이언트에서 Naver.Pay.create()에 전달할 파라미터 반환
 */
router.get("/sdk-config", checkNaverPayEnabled, (_req, res) => {
  res.json({
    ...getNaverPaySDKConfig(),
    returnUrl: config.naverpay.returnUrl,
  });
});

/**
 * 네이버페이 클라이언트 정보 조회 (기존 호환용)
 * GET /api/payments/naverpay/client-info
 */
router.get("/client-info", checkNaverPayEnabled, (_req, res) => {
  res.json({
    clientId: config.naverpay.clientId,
    chainId: config.naverpay.chainId,
    mode: config.naverpay.mode,
    returnUrl: config.naverpay.returnUrl,
  });
});

/**
 * 결제 콜백 (Callback)
 * GET /api/payments/naverpay/callback
 *
 * 네이버페이 결제 완료 후 리다이렉트되는 URL
 * paymentId를 받아서 결제 승인 처리 후 프론트엔드로 리다이렉트
 *
 * 성공 시: ?resultCode=Success&paymentId={네이버페이 결제번호}
 * 실패 시: ?resultCode={에러코드}&resultMessage={에러메시지}&reserveId={결제 예약 ID}
 */
router.get("/callback", asyncHandler(async (req, res) => {
  const { orderId, paymentId, resultCode, resultMessage } = req.query as {
    orderId?: string;
    paymentId?: string;
    resultCode?: string;
    resultMessage?: string;
  };

  // 결제 실패 시
  if (resultCode !== "Success" || !paymentId) {
    logger.error("결제 콜백 실패", { resultCode, resultMessage });
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

  try {
    // 결제 승인 API 호출 (v2.2)
    const applyResult = await applyPayment(paymentId);

    if (!applyResult.body) {
      throw new Error("결제 승인 응답이 없습니다");
    }

    const detail = applyResult.body.detail;

    // 결제 승인 상태 확인
    if (detail.admissionState !== "SUCCESS") {
      throw new Error("결제 승인이 실패했습니다");
    }

    // 금액 검증 (보안)
    const serverAmount = parseFloat(order.totalAmount);
    if (detail.totalPayAmount !== serverAmount) {
      logger.error("금액 불일치", {
        serverAmount,
        receivedAmount: detail.totalPayAmount,
      });
      throw new Error("결제 금액이 일치하지 않습니다");
    }

    // 소프트 락 기반 재고 확인 및 차감 + 주문 상태 업데이트
    const stockResult = await storage.confirmOrderWithStockLock(order.id, {
      paymentProvider: "naverpay",
      paymentKey: detail.paymentId,
      externalOrderId: detail.merchantPayKey,
      paymentMethod: detail.primaryPayMeans?.toLowerCase() || "naverpay",
      paidAt: new Date(),
    });

    // 재고 부족 시 PG사 결제 취소 및 에러 반환
    if (!stockResult.success) {
      logger.error("재고 부족으로 결제 취소", {
        orderId: order.id,
        insufficientStock: stockResult.insufficientStock,
      });

      // PG사 결제 취소 시도
      try {
        await cancelPaymentSimple(
          detail.paymentId,
          detail.totalPayAmount,
          "재고 부족으로 인한 자동 취소",
          "2", // 가맹점 관리자
          detail.taxScopeAmount,
          detail.taxExScopeAmount
        );
        logger.info("재고 부족 - PG 결제 취소 완료", { orderId: order.id });
      } catch (cancelError) {
        logger.error("재고 부족 - PG 결제 취소 실패", {
          orderId: order.id,
          paymentId: detail.paymentId,
          error: cancelError,
        });
      }

      return res.redirect(
        `${config.frontendUrl}/checkout/fail?message=${encodeURIComponent("재고가 부족합니다")}&code=INSUFFICIENT_STOCK`
      );
    }

    logger.info("결제 승인 완료", {
      orderId,
      paymentId: detail.paymentId,
      totalPayAmount: detail.totalPayAmount,
    });

    // 프론트엔드 결제 완료 페이지로 리다이렉트
    res.redirect(`${config.frontendUrl}/checkout/success?orderId=${orderId}`);
  } catch (error) {
    logger.error("결제 콜백 에러", {
      error: error instanceof Error ? error.message : String(error),
    });
    const message =
      error instanceof Error ? error.message : "결제 처리 중 오류가 발생했습니다";
    res.redirect(
      `${config.frontendUrl}/checkout/fail?message=${encodeURIComponent(message)}`
    );
  }
}));

/**
 * 결제 상태 조회
 * GET /api/payments/naverpay/:orderId/status
 */
router.get(
  "/:orderId/status",
  checkNaverPayEnabled,
  isAuthenticated,
  asyncHandler(async (req, res) => {
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
    let payment;
    try {
      payment = await getNaverPayPayment(order.paymentKey);
    } catch (error) {
      if (error instanceof NaverPayPaymentError) {
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }
      throw error;
    }

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
  })
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
  asyncHandler(async (req, res) => {
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

    const { cancelReason, cancelAmount, taxScopeAmount, taxExScopeAmount } =
      validationResult.data;

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
    let cancelResult;
    try {
      cancelResult = await cancelNaverPayPayment({
        paymentId: order.paymentKey,
        cancelAmount: amount,
        cancelReason,
        cancelRequester: user?.isAdmin ? "2" : "1", // 관리자면 가맹점 관리자로 표시
        taxScopeAmount: taxScopeAmount ?? amount, // 과세 금액 (미지정 시 전액 과세)
        taxExScopeAmount: taxExScopeAmount ?? 0, // 면세 금액
      });
    } catch (error) {
      if (error instanceof NaverPayPaymentError) {
        logger.error("결제 취소 에러", {
          code: error.code,
          message: error.message,
        });
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }
      throw error;
    }

    // 8. 주문 상태 업데이트
    // totalRestAmount가 0이면 전체 취소, 아니면 부분 취소
    const isFullCancel = cancelResult.body?.totalRestAmount === 0;
    const newStatus = isFullCancel ? "cancelled" : order.status;

    // 총 취소 금액 계산
    const totalCancelAmount = cancelResult.body
      ? cancelResult.body.primaryPayCancelAmount +
        cancelResult.body.npointCancelAmount +
        cancelResult.body.giftCardCancelAmount
      : amount;

    await storage.cancelOrderPayment(orderId, {
      status: newStatus,
      canceledAt: new Date(),
      cancelReason,
      refundedAmount: totalCancelAmount.toString(),
    });

    // 9. 전체 취소 시 재고 복구
    if (isFullCancel) {
      try {
        await storage.restoreStockOnCancel(orderId);
        logger.info("재고 복구 완료", { orderId });
      } catch (restoreError) {
        logger.error("재고 복구 실패", { orderId, error: restoreError });
      }
    }

    logger.info("결제 취소 완료", {
      orderId,
      cancelAmount: totalCancelAmount,
      remainAmount: cancelResult.body?.totalRestAmount,
    });

    res.json({
      message: "결제가 취소되었습니다",
      refund: cancelResult.body
        ? {
            cancelAmount: totalCancelAmount,
            remainAmount: cancelResult.body.totalRestAmount,
            cancelTime: cancelResult.body.cancelYmdt,
            // 상세 취소 정보
            detail: {
              primaryPayCancelAmount: cancelResult.body.primaryPayCancelAmount,
              npointCancelAmount: cancelResult.body.npointCancelAmount,
              giftCardCancelAmount: cancelResult.body.giftCardCancelAmount,
              discountCancelAmount: cancelResult.body.discountCancelAmount,
            },
          }
        : null,
    });
  })
);

export default router;
