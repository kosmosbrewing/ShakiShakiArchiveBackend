// server/routes/kakaopay.routes.ts
// 카카오페이 결제 라우트
// 참고: https://developers.kakao.com/docs/latest/ko/kakaopay/single-payment

import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { paymentRateLimiter } from "../config/security";
import { config } from "../config";
import { stockReservations } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  readyPayment,
  approvePayment,
  getPayment as getKakaoPayPayment,
  cancelPayment as cancelKakaoPayPayment,
  cancelPaymentSimple,
  KakaoPayPaymentError,
} from "../services/kakaopay.service";
import { createLogger } from "../utils/logger";
import { ORDER_MESSAGES, AUTH_MESSAGES, PAYMENT_MESSAGES } from "@shared/constants/messages";

const router = Router();
const logger = createLogger("KakaoPay");

/**
 * tid 저장소 (메모리 기반)
 *
 * ⚠️ 주의사항:
 * - 서버 재시작 시 tid 정보가 손실됩니다
 * - 다중 인스턴스(로드밸런서) 환경에서는 Redis 등 외부 저장소 사용 권장
 * - 카카오페이 결제 유효 시간(기본 15분) 내에 승인해야 합니다
 *
 * 대안:
 * 1. Redis 사용: tidStore를 Redis로 교체 (TTL 15분 설정)
 * 2. DB 사용: orders 테이블에 kakaopay_tid 컬럼 추가
 */
const tidStore = new Map<string, { tid: string; partnerUserId: string }>();

/**
 * 카카오페이 에러 코드를 사용자 친화적인 메시지로 변환
 */
const kakaoPayErrorMessages: Record<string, string> = {
  // 공식 에러 코드
  "-1": "카카오페이 서버 오류입니다. 잠시 후 다시 시도해주세요.",
  "-2": "필수 파라미터가 누락되었습니다.",
  "-3": "결제 준비 API 호출 시 CID가 없습니다.",
  "-4": "결제 준비 API에서 요청한 정보가 없습니다.",
  "-5": "상점 서버와 카카오페이 서버 간 통신 오류입니다.",
  "-6": "결제 승인 API 호출 시 TID가 없습니다.",
  "-7": "결제 승인 요청 실패입니다.",
  "-9": "결제 요청이 만료되었습니다. 다시 시도해주세요.",
  "-10": "승인 대기 중인 결제를 취소할 수 없습니다.",
  "-11": "이미 취소된 결제입니다.",
  "-12": "부분 취소할 금액이 취소 가능 금액을 초과합니다.",
  "-13": "결제 상태가 SUCCESS_PAYMENT가 아닙니다.",
  "-14": "결제 금액이 불일치합니다.",
  "-15": "결제 승인 중입니다. 잠시 후 결과를 확인해주세요.",
  "-16": "결제 수단을 확인해주세요.",
  "-17": "결제 비밀번호 인증에 실패했습니다.",
  "-18": "결제 한도를 초과했습니다.",
  "-19": "결제 가능 횟수를 초과했습니다.",
  "-20": "계좌 잔액이 부족합니다.",
  "-21": "카드 잔액/한도가 부족합니다.",
  "-22": "분실/도난 신고된 카드입니다.",
  "-23": "정지/해지된 카드입니다.",
  "-24": "카드 비밀번호 오류입니다.",
  "-25": "카드 유효기간이 만료되었습니다.",
  "-26": "이용 정지된 카드입니다.",
  "-90": "알 수 없는 결제 오류입니다. 고객센터에 문의해주세요.",
  // 일반적인 에러
  UserCancel: "결제가 취소되었습니다.",
  Timeout: "결제 시간이 만료되었습니다. 다시 시도해주세요.",
};

// 결제 준비 요청 스키마
const readyPaymentSchema = z.object({
  orderId: z.string().min(1, "주문 ID가 필요합니다"),
});

// 결제 취소 요청 스키마
const cancelPaymentSchema = z.object({
  cancelReason: z.string().min(1, "취소 사유를 입력해주세요").max(256),
  cancelAmount: z.number().positive().optional(), // 부분 취소 시
  cancelTaxFreeAmount: z.number().nonnegative().optional(), // 비과세 금액
});

/**
 * 카카오페이 활성화 여부 확인 미들웨어
 */
function checkKakaoPayEnabled(_req: any, res: any, next: any) {
  if (!config.kakaopay.isEnabled) {
    return res.status(503).json({
      message: PAYMENT_MESSAGES.KAKAOPAY_DISABLED,
    });
  }
  next();
}

/**
 * 카카오페이 클라이언트 정보 조회
 * GET /api/payments/kakaopay/client-info
 *
 * 프론트엔드에서 카카오페이 활성화 여부 확인용
 */
router.get("/client-info", (_req, res) => {
  res.json({
    isEnabled: config.kakaopay.isEnabled,
    mode: config.kakaopay.mode,
  });
});

/**
 * 카카오페이 결제 준비
 * POST /api/payments/kakaopay/ready
 *
 * 결제 준비 요청을 보내고 tid와 redirect URL 반환
 */
router.post(
  "/ready",
  paymentRateLimiter,
  checkKakaoPayEnabled,
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;

    // 1. 요청 데이터 검증
    const validationResult = readyPaymentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: PAYMENT_MESSAGES.INVALID_REQUEST,
        errors: validationResult.error.flatten().fieldErrors,
      });
    }

    const { orderId } = validationResult.data;

    // 2. 주문 조회
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
    }

    // 3. 권한 검증
    if (order.userId !== userId) {
      return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
    }

    // 4. 결제 가능 상태 확인
    const payableStatuses = ["pending_payment", "paying"];
    if (!payableStatuses.includes(order.status)) {
      logger.warn("결제 불가능한 주문 상태 (카카오페이)", {
        orderId: order.id,
        currentStatus: order.status,
        payableStatuses,
      });

      if (order.status === "payment_confirmed") {
        return res.status(400).json({
          message: PAYMENT_MESSAGES.ALREADY_PAID,
        });
      }

      return res.status(400).json({
        message: PAYMENT_MESSAGES.INVALID_ORDER_STATUS,
      });
    }

    // 5. 주문 상품 정보 조회 (상품명 생성용)
    const orderItems = order.orderItems;
    const itemName =
      orderItems.length > 1
        ? `${orderItems[0].productName} 외 ${orderItems.length - 1}건`
        : orderItems[0]?.productName || "ShakiShaki 상품";

    // 6. 결제 준비 API 호출
    const totalAmount = parseFloat(order.totalAmount);
    const partnerUserId = userId.toString();

    try {
      // returnUrl에서 cancel, fail URL 자동 생성 (네이버페이와 동일한 패턴)
      const baseCallbackUrl = config.kakaopay.returnUrl.replace(/\/callback$/, "");

      const readyResult = await readyPayment({
        partner_order_id: order.externalOrderId || orderId,
        partner_user_id: partnerUserId,
        item_name: itemName.substring(0, 100), // 최대 100자
        quantity: orderItems.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0),
        total_amount: totalAmount,
        tax_free_amount: 0, // 과세 상품 (비과세 금액 0)
        approval_url: `${config.kakaopay.returnUrl}?orderId=${orderId}`,
        cancel_url: `${baseCallbackUrl}/cancel-callback?orderId=${orderId}`,
        fail_url: `${baseCallbackUrl}/fail-callback?orderId=${orderId}`,
      });

      // 7. tid 저장 (승인 시 필요)
      tidStore.set(orderId, {
        tid: readyResult.tid,
        partnerUserId,
      });

      // 8. 주문 상태를 paying으로 업데이트
      await storage.updateOrderStatus(orderId, "paying");

      logger.info("카카오페이 결제 준비 완료", {
        orderId,
        tid: readyResult.tid,
        totalAmount,
      });

      // 9. 클라이언트에 응답
      res.json({
        tid: readyResult.tid,
        next_redirect_pc_url: readyResult.next_redirect_pc_url,
        next_redirect_mobile_url: readyResult.next_redirect_mobile_url,
        next_redirect_app_url: readyResult.next_redirect_app_url,
        created_at: readyResult.created_at,
      });
    } catch (error) {
      logger.error("카카오페이 결제 준비 실패", {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof KakaoPayPaymentError) {
        const userMessage =
          kakaoPayErrorMessages[error.code] || error.message;
        return res.status(error.statusCode).json({
          message: userMessage,
          code: error.code,
        });
      }

      throw error;
    }
  })
);

/**
 * 결제 콜백 (Callback)
 * GET /api/payments/kakaopay/callback
 *
 * 카카오페이 결제 완료 후 리다이렉트되는 URL
 * pg_token을 받아서 결제 승인 처리 후 프론트엔드로 리다이렉트
 */
router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const { orderId, pg_token } = req.query as {
      orderId?: string;
      pg_token?: string;
    };

    logger.info("카카오페이 콜백 진입", {
      orderId,
      pg_token: pg_token ? "SET" : "MISSING",
      frontendUrl: config.frontendUrl,
    });

    // 결제 토큰 확인
    if (!pg_token) {
      const failUrl = new URL("/checkout/fail", config.frontendUrl);
      failUrl.searchParams.set("message", "결제 인증 토큰이 없습니다");
      if (orderId) failUrl.searchParams.set("orderId", orderId);
      return res.redirect(failUrl.toString());
    }

    if (!orderId) {
      const failUrl = new URL("/checkout/fail", config.frontendUrl);
      failUrl.searchParams.set("message", "주문 정보가 없습니다");
      return res.redirect(failUrl.toString());
    }

    // tid 조회
    const tidInfo = tidStore.get(orderId);
    if (!tidInfo) {
      logger.error("tid 정보 없음", { orderId });
      const failUrl = new URL("/checkout/fail", config.frontendUrl);
      failUrl.searchParams.set("orderId", orderId);
      failUrl.searchParams.set("message", "결제 정보가 만료되었습니다");
      return res.redirect(failUrl.toString());
    }

    // 주문 조회
    const order = await storage.getOrder(orderId);
    if (!order) {
      const failUrl = new URL("/checkout/fail", config.frontendUrl);
      failUrl.searchParams.set("orderId", orderId);
      failUrl.searchParams.set("message", ORDER_MESSAGES.NOT_FOUND);
      return res.redirect(failUrl.toString());
    }

    // 결제 가능 상태 확인
    const payableStatuses = ["pending_payment", "paying"];
    if (!payableStatuses.includes(order.status)) {
      logger.warn("결제 불가능한 주문 상태 (카카오페이)", {
        orderId: order.id,
        currentStatus: order.status,
        payableStatuses,
      });

      // 이미 결제된 주문: /checkout/success로 리다이렉트
      const alreadyPaidUrl = new URL("/checkout/success", config.frontendUrl);
      alreadyPaidUrl.searchParams.set("result", "success");
      alreadyPaidUrl.searchParams.set("orderId", orderId);
      alreadyPaidUrl.searchParams.set("provider", "kakaopay");
      alreadyPaidUrl.searchParams.set("externalOrderId", order.externalOrderId || "");
      alreadyPaidUrl.searchParams.set("amount", order.totalAmount);
      alreadyPaidUrl.searchParams.set("alreadyPaid", "true");

      return res.redirect(alreadyPaidUrl.toString());
    }

    try {
      // 결제 승인 API 호출
      const approveResult = await approvePayment({
        tid: tidInfo.tid,
        partner_order_id: order.externalOrderId || orderId,
        partner_user_id: tidInfo.partnerUserId,
        pg_token,
      });

      // 금액 검증 (보안)
      const serverAmount = parseFloat(order.totalAmount);
      if (approveResult.amount.total !== serverAmount) {
        logger.error("금액 불일치", {
          serverAmount,
          receivedAmount: approveResult.amount.total,
        });
        throw new Error("결제 금액이 일치하지 않습니다");
      }

      // 재고 처리 분기
      logger.info("카카오페이 결제 승인 - 재고 처리 분기 확인", {
        orderId: order.id,
        externalOrderId: order.externalOrderId,
        isStockReserved: order.isStockReserved,
        status: order.status,
        willSkipStockCheck: !!order.isStockReserved,
      });

      if (order.isStockReserved) {
        logger.info("재고 이미 차감됨 - updateOrderPayment만 호출 (카카오페이)", {
          orderId: order.id,
        });

        // 선점 패턴 사용: 이미 재고가 차감되어 있으므로 상태만 업데이트
        await storage.updateOrderPayment(order.id, {
          paymentProvider: "kakaopay",
          paymentKey: approveResult.tid,
          externalOrderId: approveResult.partner_order_id,
          paymentMethod: approveResult.payment_method_type.toLowerCase(),
          status: "payment_confirmed",
          paidAt: new Date(),
        });

        // 재고 선점 기록 삭제
        try {
          await db
            .delete(stockReservations)
            .where(eq(stockReservations.userId, order.userId));
          logger.info("재고 선점 기록 삭제 완료", {
            userId: order.userId,
            orderId: order.id,
          });
        } catch (deleteError) {
          logger.error("재고 선점 기록 삭제 실패", {
            userId: order.userId,
            orderId: order.id,
            error: deleteError,
          });
        }

        logger.info("결제 승인 완료 (선점 패턴 - 재고 이미 차감됨)", {
          orderId: order.id,
        });
      } else {
        logger.warn("소프트 락 방식 실행 (deprecated) - 이중 차감 위험! (카카오페이)", {
          orderId: order.id,
          isStockReserved: order.isStockReserved,
          warning: "주문 생성 시 isStockReserved를 true로 설정해야 합니다!",
        });

        // 기존 방식: 소프트 락 기반 재고 확인 및 차감 + 주문 상태 업데이트
        const stockResult = await storage.confirmOrderWithStockLock(order.id, {
          paymentProvider: "kakaopay",
          paymentKey: approveResult.tid,
          externalOrderId: approveResult.partner_order_id,
          paymentMethod: approveResult.payment_method_type.toLowerCase(),
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
              approveResult.tid,
              approveResult.amount.total,
              approveResult.amount.tax_free
            );
            logger.info("재고 부족 - PG 결제 취소 완료", { orderId: order.id });
          } catch (cancelError) {
            logger.error("재고 부족 - PG 결제 취소 실패", {
              orderId: order.id,
              tid: approveResult.tid,
              error: cancelError,
            });
          }

          const failUrl = new URL("/checkout/fail", config.frontendUrl);
          failUrl.searchParams.set("orderId", orderId);
          failUrl.searchParams.set("message", "재고가 부족합니다");
          failUrl.searchParams.set("code", "INSUFFICIENT_STOCK");
          return res.redirect(failUrl.toString());
        }
      }

      // tid 저장소에서 제거
      tidStore.delete(orderId);

      logger.info("카카오페이 결제 승인 완료", {
        orderId,
        tid: approveResult.tid,
        totalPayAmount: approveResult.amount.total,
      });

      // 성공 페이지로 리다이렉트
      const successUrl = new URL("/checkout/success", config.frontendUrl);
      successUrl.searchParams.set("result", "success");
      successUrl.searchParams.set("orderId", orderId);
      successUrl.searchParams.set("provider", "kakaopay");
      successUrl.searchParams.set(
        "externalOrderId",
        approveResult.partner_order_id || approveResult.tid
      );
      successUrl.searchParams.set("orderName", "ShakiShaki 주문");
      successUrl.searchParams.set("amount", approveResult.amount.total.toString());

      return res.redirect(successUrl.toString());
    } catch (error) {
      logger.error("카카오페이 결제 승인 에러", {
        errorType: error?.constructor?.name,
        isKakaoPayError: error instanceof KakaoPayPaymentError,
        error: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
      });

      let message = "결제 처리 중 오류가 발생했습니다";

      if (error instanceof KakaoPayPaymentError) {
        message = kakaoPayErrorMessages[error.code] || error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }

      const failUrl = new URL("/checkout/fail", config.frontendUrl);
      failUrl.searchParams.set("orderId", orderId);
      failUrl.searchParams.set("message", message);

      return res.redirect(failUrl.toString());
    }
  })
);

/**
 * 결제 취소 콜백
 * GET /api/payments/kakaopay/cancel-callback
 *
 * 사용자가 카카오페이 결제창에서 취소 버튼을 눌렀을 때
 */
router.get("/cancel-callback", (req, res) => {
  const { orderId } = req.query as { orderId?: string };

  logger.info("카카오페이 결제 취소 콜백", { orderId });

  // tid 저장소에서 제거
  if (orderId) {
    tidStore.delete(orderId);
  }

  const failUrl = new URL("/checkout/fail", config.frontendUrl);
  if (orderId) failUrl.searchParams.set("orderId", orderId);
  failUrl.searchParams.set("message", "결제가 취소되었습니다");

  return res.redirect(failUrl.toString());
});

/**
 * 결제 실패 콜백
 * GET /api/payments/kakaopay/fail-callback
 *
 * 결제 진행 중 오류가 발생했을 때
 */
router.get("/fail-callback", (req, res) => {
  const { orderId } = req.query as { orderId?: string };

  logger.info("카카오페이 결제 실패 콜백", { orderId });

  // tid 저장소에서 제거
  if (orderId) {
    tidStore.delete(orderId);
  }

  const failUrl = new URL("/checkout/fail", config.frontendUrl);
  if (orderId) failUrl.searchParams.set("orderId", orderId);
  failUrl.searchParams.set("message", "결제 처리 중 오류가 발생했습니다");

  return res.redirect(failUrl.toString());
});

/**
 * 결제 상태 조회
 * GET /api/payments/kakaopay/:orderId/status
 */
router.get(
  "/:orderId/status",
  checkKakaoPayEnabled,
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const orderId = req.params.orderId;
    const userId = req.session.userId!;

    // 주문 조회
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
    }

    // 권한 검증
    const user = await storage.getUser(userId);
    if (order.userId !== userId && !user?.isAdmin) {
      return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
    }

    // 결제 키가 없거나 카카오페이가 아니면 DB 상태만 반환
    if (!order.paymentKey || order.paymentProvider !== "kakaopay") {
      return res.json({
        orderId: order.id,
        status: order.status,
        paymentInfo: null,
      });
    }

    // 카카오페이에서 최신 결제 정보 조회
    let payment;
    try {
      payment = await getKakaoPayPayment(order.paymentKey);
    } catch (error) {
      logger.error("결제 상태 조회 에러 (카카오페이)", {
        errorType: error?.constructor?.name,
        isKakaoPayError: error instanceof KakaoPayPaymentError,
        error: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
      });

      if (error instanceof KakaoPayPaymentError) {
        const userMessage = kakaoPayErrorMessages[error.code] || error.message;
        return res.status(error.statusCode).json({
          message: userMessage,
          code: error.code,
        });
      }

      throw error;
    }

    res.json({
      orderId: order.id,
      status: order.status,
      paymentInfo: {
        tid: payment.tid,
        status: payment.status,
        totalAmount: payment.amount?.total,
        canceledAmount: payment.canceled_amount?.total,
        cancelAvailableAmount: payment.cancel_available_amount?.total,
        createdAt: payment.created_at,
        approvedAt: payment.approved_at,
        canceledAt: payment.canceled_at,
      },
    });
  })
);

/**
 * 결제 취소
 * POST /api/payments/kakaopay/:orderId/cancel
 */
router.post(
  "/:orderId/cancel",
  paymentRateLimiter,
  checkKakaoPayEnabled,
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const orderId = req.params.orderId;
    const userId = req.session.userId!;

    // 1. 요청 데이터 검증
    const validationResult = cancelPaymentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: PAYMENT_MESSAGES.INVALID_REQUEST,
        errors: validationResult.error.flatten().fieldErrors,
      });
    }

    const { cancelReason, cancelAmount, cancelTaxFreeAmount } =
      validationResult.data;

    // 2. 주문 조회
    const order = await storage.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
    }

    // 3. 권한 검증
    const user = await storage.getUser(userId);
    if (order.userId !== userId && !user?.isAdmin) {
      return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
    }

    // 4. 결제 정보 확인
    if (!order.paymentKey || order.paymentProvider !== "kakaopay") {
      return res.status(400).json({
        message: PAYMENT_MESSAGES.KAKAOPAY_NO_PAYMENT_INFO,
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
    const taxFreeAmount = cancelTaxFreeAmount || 0;

    // 7. 카카오페이 결제 취소 API 호출
    let cancelResult;
    try {
      cancelResult = await cancelKakaoPayPayment({
        tid: order.paymentKey,
        cancel_amount: amount,
        cancel_tax_free_amount: taxFreeAmount,
      });
    } catch (error) {
      logger.error("결제 취소 에러 (카카오페이)", {
        errorType: error?.constructor?.name,
        isKakaoPayError: error instanceof KakaoPayPaymentError,
        error: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
      });

      if (error instanceof KakaoPayPaymentError) {
        const userMessage = kakaoPayErrorMessages[error.code] || error.message;
        return res.status(error.statusCode).json({
          message: userMessage,
          code: error.code,
        });
      }

      throw error;
    }

    // 8. 주문 상태 업데이트
    const isFullCancel = cancelResult.cancel_available_amount.total === 0;
    const newStatus = isFullCancel ? "cancelled" : order.status;

    await storage.cancelOrderPayment(orderId, {
      status: newStatus,
      canceledAt: new Date(),
      cancelReason,
      refundedAmount: cancelResult.approved_cancel_amount.total.toString(),
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

    logger.info("카카오페이 결제 취소 완료", {
      orderId,
      cancelAmount: cancelResult.approved_cancel_amount.total,
      remainAmount: cancelResult.cancel_available_amount.total,
    });

    res.json({
      message: PAYMENT_MESSAGES.CANCEL_SUCCESS,
      refund: {
        cancelAmount: cancelResult.approved_cancel_amount.total,
        remainAmount: cancelResult.cancel_available_amount.total,
        cancelTime: cancelResult.canceled_at,
        detail: {
          totalCancelAmount: cancelResult.approved_cancel_amount.total,
          taxFreeCancelAmount: cancelResult.approved_cancel_amount.tax_free,
          vatCancelAmount: cancelResult.approved_cancel_amount.vat,
          pointCancelAmount: cancelResult.approved_cancel_amount.point,
          discountCancelAmount: cancelResult.approved_cancel_amount.discount,
        },
      },
    });
  })
);

export default router;
