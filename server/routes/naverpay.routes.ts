// server/routes/naverpay.routes.ts
// 네이버페이 결제 라우트
// 참고: 네이버페이는 클라이언트 SDK에서 결제창을 호출하므로
// 서버에서는 결제 승인(apply), 조회, 취소 API만 처리합니다.

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

/**
 * 네이버페이 에러 코드를 사용자 친화적인 메시지로 변환
 * 공식 문서 참고
 */
const naverPayErrorMessages: Record<string, string> = {
  // 공식 문서 에러 코드
  Fail: "결제 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
  InvalidMerchant: "가맹점 정보가 올바르지 않습니다.",
  TimeExpired: "결제 시간이 만료되었습니다. 다시 시도해주세요.",
  AlreadyOnGoing: "이미 진행 중인 결제입니다.",
  AlreadyComplete: "이미 완료된 결제입니다.",
  OwnerAuthFail: "본인 인증에 실패했습니다. 카드 정보를 확인해주세요.",
  BankMaintenance: "은행 시스템 점검 중입니다. 잠시 후 다시 시도해주세요.",
  NotEnoughAccountBalance: "계좌 잔액이 부족합니다. 잔액을 확인해주세요.",
  MaintenanceOngoing: "서비스 점검 중입니다. 잠시 후 다시 시도해주세요.",
  FaultCheckOngoing: "결제 시스템 점검 중입니다. 다른 결제 수단을 이용해주세요.",
  // 일반적인 에러
  UserCancel: "결제가 취소되었습니다.",
  Timeout: "결제 시간이 만료되었습니다. 다시 시도해주세요.",
  ExceedLimit: "카드 한도가 부족합니다. 다른 결제 수단을 이용해주세요.",
  AuthenticationFailed: "인증에 실패했습니다. 다시 시도해주세요.",
  PaymentCanceled: "결제가 취소되었습니다.",
  AlreadyApproved: "이미 승인된 결제입니다.",
  InvalidPaymentId: "결제 정보를 찾을 수 없습니다.",

  // 결제 취소 관련 에러
  AlreadyCanceled: "이미 전체 취소된 결제입니다.",
  OverRemainAmount: "취소 요청 금액이 잔여 결제 금액을 초과했습니다.",
  PreCancelNotComplete: "이전에 요청한 취소가 완료되지 않았습니다. 이전 취소 정보로 재시도해주세요.",
  CancelDeadlineExpired: "취소 기한이 만료되어 취소가 불가합니다. 고객센터에 문의해주세요.",
  TaxScopeAmtGreaterThanRemainError: "취소 가능한 금액보다 큰 금액을 요청했습니다.",
  TaxScopeAmountError: "과면세 금액과 취소 요청 금액이 일치하지 않습니다.",
  RestAmountDiff: "잔여 금액이 일치하지 않습니다. 다시 시도해주세요.",
  CancelNotComplete: "취소 처리 중입니다. 빠른 시일 내에 자동 완료됩니다.",
  InvalidDiscountCancelCondition: "즉시 할인 정책에 따라 취소가 불가합니다.",
};

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
  const sdkConfig = {
    ...getNaverPaySDKConfig(),
    returnUrl: config.naverpay.returnUrl,
  };

  // 🔍 디버깅: SDK 설정 정보 로그
  logger.info("네이버페이 SDK 설정 반환", {
    returnUrl: sdkConfig.returnUrl,
    mode: sdkConfig.mode,
    clientId: sdkConfig.clientId?.substring(0, 10) + '***',
  });

  res.json(sdkConfig);
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

  // 🔍 디버깅: 콜백 진입 로그 (환경 변수 확인)
  logger.info("네이버페이 콜백 진입", {
    orderId,
    paymentId,
    resultCode,
    resultMessage,
    fullQuery: req.query,
    // 중요: 프론트엔드 URL 설정 확인
    frontendUrl: config.frontendUrl,
    naverpayReturnUrl: config.naverpay.returnUrl,
    envFrontendUrl: process.env.FRONTEND_URL || '(미설정 - 기본값 사용)',
  });

  // 결제 실패 시
  if (resultCode !== "Success" || !paymentId) {
    logger.error("결제 콜백 실패 (resultCode 체크)", { resultCode, resultMessage });

    // 네이버페이 resultMessage 정제 (긴 메시지를 간결하게)
    let cleanMessage = resultMessage || "결제가 취소되었습니다";

    if (resultCode && naverPayErrorMessages[resultCode]) {
      cleanMessage = naverPayErrorMessages[resultCode];
    } else if (cleanMessage.length > 50) {
      // 긴 메시지는 간단하게
      cleanMessage = "결제 처리 중 오류가 발생했습니다.";
    }

    logger.info("네이버페이 결제 실패 메시지 정제", {
      resultCode,
      original: resultMessage,
      cleaned: cleanMessage
    });

    // ✅ URL 클래스를 사용한 안전한 리다이렉트 URL 생성
    const failUrl = new URL('/checkout/fail', config.frontendUrl);
    if (orderId) {
      failUrl.searchParams.set('orderId', orderId);
    }
    failUrl.searchParams.set('message', cleanMessage);

    logger.info("🔴 결제 실패 - 프론트엔드로 리다이렉트", {
      redirectUrl: failUrl.toString(),
      frontendUrl: config.frontendUrl,
    });

    return res.redirect(failUrl.toString());
  }

  if (!orderId) {
    // ✅ URL 클래스를 사용한 안전한 리다이렉트 URL 생성
    const failUrl = new URL('/checkout/fail', config.frontendUrl);
    failUrl.searchParams.set('message', '주문 정보가 없습니다');
    return res.redirect(failUrl.toString());
  }

  // 주문 조회
  const order = await storage.getOrder(orderId);
  if (!order) {
    // ✅ URL 클래스를 사용한 안전한 리다이렉트 URL 생성
    const failUrl = new URL('/checkout/fail', config.frontendUrl);
    failUrl.searchParams.set('orderId', orderId);
    failUrl.searchParams.set('message', '주문을 찾을 수 없습니다');
    return res.redirect(failUrl.toString());
  }

  // 결제 가능 상태 확인
  // pending_payment: 주문 생성 직후
  // paying: 결제창 오픈 후
  const payableStatuses = ["pending_payment", "paying"];
  if (!payableStatuses.includes(order.status)) {
    logger.warn("결제 불가능한 주문 상태 (네이버페이)", {
      orderId: order.id,
      currentStatus: order.status,
      payableStatuses,
    });

    // ✅ 이미 결제된 주문: /checkout/success로 리다이렉트 (result=success 필수)
    const alreadyPaidUrl = new URL('/checkout/success', config.frontendUrl);
    alreadyPaidUrl.searchParams.set('result', 'success');
    alreadyPaidUrl.searchParams.set('orderId', orderId);
    alreadyPaidUrl.searchParams.set('provider', 'naverpay');
    alreadyPaidUrl.searchParams.set('externalOrderId', order.externalOrderId || '');
    alreadyPaidUrl.searchParams.set('amount', order.totalAmount);
    alreadyPaidUrl.searchParams.set('alreadyPaid', 'true');

    logger.info("이미 결제된 주문 - 프론트엔드로 리다이렉트", {
      redirectUrl: alreadyPaidUrl.toString(),
      orderId,
      currentStatus: order.status,
    });

    return res.redirect(alreadyPaidUrl.toString());
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
      // admissionState가 SUCCESS가 아니면 에러 코드와 메시지를 포함한 NaverPayPaymentError throw
      const errorCode = applyResult.code || "Fail";
      const errorMessage = applyResult.message || "결제 승인이 실패했습니다";

      logger.error("결제 승인 상태 실패", {
        admissionState: detail.admissionState,
        code: errorCode,
        message: errorMessage,
      });

      throw new NaverPayPaymentError(errorCode, errorMessage, 400);
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

    // 재고 처리 분기: 선점 패턴 사용 여부에 따라 다르게 처리
    // @ts-ignore - isStockReserved는 새로 추가된 필드

    // 🔍 디버깅: isStockReserved 값과 실행 경로 확인
    logger.info("🔍 네이버페이 결제 승인 - 재고 처리 분기 확인", {
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      isStockReserved: order.isStockReserved,
      status: order.status,
      willSkipStockCheck: !!order.isStockReserved,
      message: order.isStockReserved
        ? "✅ 재고 이미 차감됨 - 재고 체크 건너뜀"
        : "❌ 재고 미차감 - 소프트 락 실행",
    });

    if (order.isStockReserved) {
      logger.info("✅ 재고 이미 차감됨 - updateOrderPayment만 호출 (네이버페이)", { orderId: order.id });

      // 선점 패턴 사용: 이미 재고가 차감되어 있으므로 상태만 업데이트
      await storage.updateOrderPayment(order.id, {
        paymentProvider: "naverpay",
        paymentKey: detail.paymentId,
        externalOrderId: detail.merchantPayKey,
        paymentMethod: detail.primaryPayMeans?.toLowerCase() || "naverpay",
        status: "payment_confirmed",
        paidAt: new Date(),
      });

      // 재고 선점 기록 삭제 (중요: 만료 시 이중 복구 방지)
      try {
        await db
          .delete(stockReservations)
          .where(eq(stockReservations.userId, order.userId));
        logger.info("재고 선점 기록 삭제 완료", { userId: order.userId, orderId: order.id });
      } catch (deleteError) {
        // 선점 기록 삭제 실패 시 로그만 남기고 계속 진행
        logger.error("재고 선점 기록 삭제 실패", { userId: order.userId, orderId: order.id, error: deleteError });
      }

      logger.info("결제 승인 완료 (선점 패턴 - 재고 이미 차감됨)", { orderId: order.id });
    } else {
      logger.warn("❌ 소프트 락 방식 실행 (deprecated) - 이중 차감 위험! (네이버페이)", {
        orderId: order.id,
        isStockReserved: order.isStockReserved,
        warning: "주문 생성 시 isStockReserved를 true로 설정해야 합니다!",
      });

      // 기존 방식: 소프트 락 기반 재고 확인 및 차감 + 주문 상태 업데이트
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

        // ✅ URL 클래스를 사용한 안전한 리다이렉트 URL 생성
        const failUrl = new URL('/checkout/fail', config.frontendUrl);
        failUrl.searchParams.set('orderId', orderId);
        failUrl.searchParams.set('message', '재고가 부족합니다');
        failUrl.searchParams.set('code', 'INSUFFICIENT_STOCK');
        return res.redirect(failUrl.toString());
      }
    }

    logger.info("결제 승인 완료", {
      orderId,
      paymentId: detail.paymentId,
      totalPayAmount: detail.totalPayAmount,
    });

    // ✅ URL 클래스를 사용한 안전한 리다이렉트 URL 생성
    const successUrl = new URL('/checkout/success', config.frontendUrl);
    successUrl.searchParams.set('result', 'success');
    successUrl.searchParams.set('orderId', orderId);
    successUrl.searchParams.set('provider', 'naverpay');
    successUrl.searchParams.set('externalOrderId', detail.merchantPayKey || detail.paymentId);
    successUrl.searchParams.set('orderName', 'ShakiShaki 주문');
    successUrl.searchParams.set('amount', detail.totalPayAmount.toString());

    logger.info("✅ 결제 성공 - 프론트엔드로 리다이렉트", {
      redirectUrl: successUrl.toString(),
      frontendUrl: config.frontendUrl,
      orderId,
      amount: detail.totalPayAmount,
    });

    return res.redirect(successUrl.toString());
  } catch (error) {
    // 디버깅: 에러 타입 확인
    logger.error("결제 콜백 에러 (상세)", {
      errorType: error?.constructor?.name,
      isNaverPayError: error instanceof NaverPayPaymentError,
      error: error instanceof Error ? error.message : String(error),
      errorCode: (error as any)?.code,
      errorObject: error,
    });

    // 네이버페이 에러 메시지 정제
    let message = "결제 처리 중 오류가 발생했습니다";

    if (error instanceof NaverPayPaymentError) {
      message = naverPayErrorMessages[error.code] || error.message;
      logger.info("네이버페이 에러 메시지 변환", {
        code: error.code,
        original: error.message,
        converted: message
      });
    } else if (error instanceof Error) {
      message = error.message;
      logger.warn("일반 Error로 처리됨 (NaverPayPaymentError 아님)", {
        errorMessage: error.message
      });
    }

    // ✅ URL 클래스를 사용한 안전한 리다이렉트 URL 생성
    const failUrl = new URL('/checkout/fail', config.frontendUrl);
    failUrl.searchParams.set('orderId', orderId);
    failUrl.searchParams.set('message', message);

    logger.info("🔴 결제 에러 - 프론트엔드로 리다이렉트", {
      message: message,
      redirectUrl: failUrl.toString(),
      frontendUrl: config.frontendUrl,
    });

    return res.redirect(failUrl.toString());
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
      // 디버깅: 에러 타입 확인
      logger.error("결제 상태 조회 에러 (네이버페이) - 상세", {
        errorType: error?.constructor?.name,
        isNaverPayError: error instanceof NaverPayPaymentError,
        error: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
        errorObject: error,
      });

      if (error instanceof NaverPayPaymentError) {
        const userMessage = naverPayErrorMessages[error.code] || error.message;

        logger.info("네이버페이 에러 메시지 변환 (조회)", {
          code: error.code,
          original: error.message,
          converted: userMessage
        });

        return res.status(error.statusCode).json({
          message: userMessage,
          code: error.code,
        });
      }

      // NaverPayPaymentError가 아닌 일반 에러
      logger.warn("일반 Error로 처리됨 (NaverPayPaymentError 아님)", {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
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
      // 디버깅: 에러 타입 확인
      logger.error("결제 취소 에러 (네이버페이) - 상세", {
        errorType: error?.constructor?.name,
        isNaverPayError: error instanceof NaverPayPaymentError,
        error: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
        errorObject: error,
      });

      if (error instanceof NaverPayPaymentError) {
        const userMessage = naverPayErrorMessages[error.code] || error.message;

        logger.info("네이버페이 에러 메시지 변환 (취소)", {
          code: error.code,
          original: error.message,
          converted: userMessage
        });

        return res.status(error.statusCode).json({
          message: userMessage,
          code: error.code,
        });
      }

      // NaverPayPaymentError가 아닌 일반 에러
      logger.warn("일반 Error로 처리됨 (NaverPayPaymentError 아님)", {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
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

      // 🔒 Option A: 재고 선점 패턴 제거로 인해 불필요 (주석 처리)
      // 재고는 restoreStockOnCancel()에서 복구됨
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
