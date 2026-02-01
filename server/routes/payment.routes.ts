// server/routes/payment.routes.ts
// 토스페이먼츠 결제 라우트

import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { paymentRateLimiter } from "../config/security";
import { config } from "../config";
import {
  confirmPayment,
  cancelPayment as cancelTossPayment,
  getPayment as getTossPayment,
  TossPaymentError,
} from "../services/toss.service";
import {
  cancelPayment as cancelNaverPayPayment,
  NaverPayPaymentError,
  normalizeNaverPayCancelResponse,
} from "../services/naverpay.service";
import { confirmPaymentSchema, cancelPaymentSchema, stockReservations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../utils/logger";
import { ORDER_MESSAGES, AUTH_MESSAGES, PAYMENT_MESSAGES } from "@shared/constants/messages";
import { sendPaymentConfirmEmail } from "../services/email.service";
import { notifyPaymentComplete } from "../services/telegram.service";

const router = Router();
const logger = createLogger("Payment");

/**
 * 토스페이먼츠 에러 코드를 사용자 친화적인 메시지로 변환
 * 공식 문서: https://docs.tosspayments.com/reference/error-codes
 */
const tossErrorMessages: Record<string, string> = {
  // 카드 관련 에러
  ALREADY_PROCESSED_PAYMENT: "이미 처리된 결제입니다.",
  INVALID_CARD_NUMBER: "카드번호를 다시 확인해주세요.",
  INVALID_CARD_EXPIRATION: "카드 유효기간을 다시 확인해주세요.",
  INVALID_STOPPED_CARD: "정지된 카드입니다. 다른 카드를 이용해주세요.",
  INVALID_CARD_LOST_OR_STOLEN: "분실 또는 도난 카드입니다. 카드사에 문의해주세요.",
  INVALID_REJECT_CARD: "카드 사용이 거절되었습니다. 카드사에 문의해주세요.",

  // 한도 초과 에러
  EXCEED_MAX_CARD_INSTALLMENT_PLAN: "최대 할부 개월 수를 초과했습니다.",
  EXCEED_MAX_DAILY_PAYMENT_COUNT: "하루 결제 가능 횟수를 초과했습니다.",
  EXCEED_MAX_PAYMENT_AMOUNT: "하루 결제 가능 금액을 초과했습니다.",
  EXCEED_MAX_ONE_DAY_WITHDRAW_AMOUNT: "1일 출금 한도를 초과했습니다.",
  EXCEED_MAX_ONE_TIME_WITHDRAW_AMOUNT: "1회 출금 한도를 초과했습니다.",
  EXCEED_MAX_AMOUNT: "거래 금액 한도를 초과했습니다.",
  EXCEED_MAX_MONTHLY_PAYMENT_AMOUNT: "당월 결제 가능 금액을 초과했습니다.",
  EXCEED_MAX_ONE_DAY_AMOUNT: "일일 한도를 초과했습니다.",

  // 잔액/승인 거부
  REJECT_ACCOUNT_PAYMENT: "계좌 잔액이 부족합니다.",
  REJECT_CARD_PAYMENT: "카드 한도 초과 또는 잔액이 부족합니다.",

  // 할부 관련
  NOT_SUPPORTED_INSTALLMENT_PLAN_CARD_OR_MERCHANT: "할부가 지원되지 않는 카드 또는 가맹점입니다.",
  INVALID_CARD_INSTALLMENT_PLAN: "할부 개월 정보가 잘못되었습니다.",
  NOT_SUPPORTED_MONTHLY_INSTALLMENT_PLAN: "할부가 지원되지 않는 카드입니다.",

  // 인증 관련
  INVALID_PASSWORD: "결제 비밀번호가 일치하지 않습니다.",
  EXCEED_MAX_AUTH_COUNT: "최대 인증 횟수를 초과했습니다. 카드사에 문의해주세요.",
  INVALID_AUTHORIZE_AUTH: "유효하지 않은 인증 방식입니다.",

  // 계좌 관련
  RESTRICTED_TRANSFER_ACCOUNT: "계좌는 등록 후 12시간 뒤부터 결제할 수 있습니다.",
  INVALID_ACCOUNT_INFO_RE_REGISTER: "유효하지 않은 계좌입니다. 계좌를 재등록해주세요.",
  REJECT_TOSSPAY_INVALID_ACCOUNT: "출금 계좌가 등록되지 않았습니다. 계좌를 다시 등록해주세요.",

  // 시스템 에러
  PROVIDER_ERROR: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  CARD_PROCESSING_ERROR: "카드사에서 오류가 발생했습니다.",
  FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING: "결제가 완료되지 않았습니다. 다시 시도해주세요.",
  FAILED_INTERNAL_SYSTEM_PROCESSING: "내부 시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  UNKNOWN_PAYMENT_ERROR: "결제에 실패했습니다. 같은 문제가 반복되면 은행이나 카드사에 문의해주세요.",

  // 요청/인증 에러
  INVALID_REQUEST: "잘못된 요청입니다.",
  INVALID_API_KEY: "잘못된 인증 정보입니다.",
  REJECT_CARD_COMPANY: "결제 승인이 거절되었습니다.",
  FORBIDDEN_REQUEST: "허용되지 않은 요청입니다.",

  // 기타
  NOT_ALLOWED_POINT_USE: "포인트 사용이 불가능한 카드입니다.",
  BELOW_MINIMUM_AMOUNT: "최소 결제 금액은 신용카드 100원, 계좌 200원입니다.",
  NOT_AVAILABLE_PAYMENT: "결제가 불가능한 시간대입니다.",
  NOT_AVAILABLE_BANK: "은행 서비스 시간이 아닙니다.",
  NOT_FOUND_PAYMENT: "존재하지 않는 결제 정보입니다.",
  NOT_FOUND_PAYMENT_SESSION: "결제 시간이 만료되었습니다. 다시 시도해주세요.",
  UNAPPROVED_ORDER_ID: "아직 승인되지 않은 주문입니다.",
  FDS_ERROR: "위험 거래가 감지되었습니다. 문자로 발송된 링크를 통해 본인인증 후 결제해주세요.",
  NOT_FOUND_TERMINAL_ID: "단말기 정보가 없습니다. 고객센터에 문의해주세요.",
  INVALID_UNREGISTERED_SUBMALL: "등록되지 않은 서브몰입니다.",
  NOT_REGISTERED_BUSINESS: "등록되지 않은 사업자번호입니다.",
  UNAUTHORIZED_KEY: "인증되지 않은 키입니다.",
  INCORRECT_BASIC_AUTH_FORMAT: "잘못된 인증 형식입니다.",

  // 결제 취소/환불 관련
  ALREADY_CANCELED_PAYMENT: "이미 취소된 결제입니다.",
  ALREADY_REFUND_PAYMENT: "이미 환불된 결제입니다.",
  NOT_CANCELABLE_PAYMENT: "취소할 수 없는 결제입니다.",
  NOT_CANCELABLE_AMOUNT: "취소할 수 없는 금액입니다.",
  NOT_CANCELABLE_PAYMENT_FOR_DORMANT_USER: "휴면 처리된 회원의 결제는 취소할 수 없습니다.",
  EXCEED_CANCEL_LIMIT: "취소 한도 금액을 초과했습니다.",
  EXCEED_CANCEL_AMOUNT_DISCOUNT_AMOUNT: "즉시할인금액보다 적은 금액은 부분취소가 불가능합니다.",
  EXCEED_MAX_REFUND_DUE: "환불 가능한 기간이 지났습니다.",
  NOT_ALLOWED_PARTIAL_REFUND: "에스크로 주문, 현금 카드 결제는 부분 환불이 불가합니다. 다른 결제 수단도 부분 취소가 안 되면 고객센터에 문의해주세요.",
  NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT: "입금 대기 중인 결제는 부분 환불이 불가합니다.",
  INVALID_REFUND_ACCOUNT_INFO: "환불 계좌번호와 예금주명이 일치하지 않습니다.",
  INVALID_REFUND_ACCOUNT_NUMBER: "잘못된 환불 계좌번호입니다.",
  INVALID_BANK: "유효하지 않은 은행입니다.",
  NOT_MATCHES_REFUNDABLE_AMOUNT: "잔액 결과가 일치하지 않습니다.",
  FORBIDDEN_BANK_REFUND_REQUEST: "고객 계좌가 입금되지 않는 상태입니다.",
  FORBIDDEN_CONSECUTIVE_REQUEST: "반복적인 요청은 허용되지 않습니다. 잠시 후 다시 시도해주세요.",
  REFUND_REJECTED: "환불이 거절되었습니다. 결제사에 문의해주세요.",
  FAILED_REFUND_PROCESS: "은행 응답 지연이나 일시적인 오류로 환불 요청에 실패했습니다.",
  FAILED_METHOD_HANDLING_CANCEL: "취소 중 결제 수단 처리 과정에서 일시적인 오류가 발생했습니다.",
  FAILED_PARTIAL_REFUND: "은행 점검, 해약 계좌 등의 사유로 부분 환불이 실패했습니다.",
  COMMON_ERROR: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
};

/**
 * 클라이언트 키 조회 (결제창 SDK 초기화용)
 * GET /api/payments/client-key
 */
router.get("/client-key", (_req, res) => {
  if (!config.toss.isEnabled) {
    return res
      .status(503)
      .json({ message: PAYMENT_MESSAGES.SERVICE_DISABLED });
  }
  res.json({ clientKey: config.toss.clientKey });
});

/**
 * 결제 승인
 * POST /api/payments/confirm
 *
 * 클라이언트에서 토스페이먼츠 결제창 완료 후 호출
 * - paymentKey, orderId, amount 검증
 * - 서버 저장 금액과 클라이언트 금액 비교 (보안)
 * - 토스페이먼츠 결제 승인 API 호출
 * - 소프트 락 기반 재고 확인 및 차감 + 주문 상태 업데이트
 */
router.post("/confirm", paymentRateLimiter, isAuthenticated, asyncHandler(async (req, res) => {
  // 1. 요청 데이터 검증
  const validationResult = confirmPaymentSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({
      message: PAYMENT_MESSAGES.INVALID_REQUEST,
      errors: validationResult.error.flatten().fieldErrors,
    });
  }

  const { paymentKey, orderId, amount } = validationResult.data;
  const userId = req.session.userId!;

  // 디버깅: 결제 승인 요청 정보
  logger.info("토스 결제 승인 요청", {
    paymentKey,
    orderId,
    amount,
    userId,
  });

  // 2. 서버에 저장된 주문 조회 (orderId는 externalOrderId로 저장됨)
  const order = await storage.getOrderByExternalOrderId(orderId);

  logger.info("주문 조회 결과", {
    found: !!order,
    orderId: order?.id,
    externalOrderId: order?.externalOrderId,
    status: order?.status,
    userId: order?.userId,
  });

  if (!order) {
    // 🔍 디버깅: DB에 있는 모든 주문의 externalOrderId 로그 (개발 환경에서만)
    if (!config.isProd) {
      try {
        const allOrders = await storage.getAllOrders();
        const recentOrderIds = allOrders
          .slice(0, 10)
          .map(o => ({
            id: o.id,
            externalOrderId: o.externalOrderId,
            createdAt: o.createdAt,
            userId: o.userId,
          }));
        logger.debug("최근 주문 10건의 externalOrderId", { recentOrderIds });
      } catch (debugError) {
        logger.warn("디버깅용 주문 조회 실패", { error: debugError });
      }
    }

    logger.error("주문을 찾을 수 없음", {
      searchedExternalOrderId: orderId,
      userId,
      hint: "주문 생성 API (POST /api/orders)가 호출되었는지 확인하세요",
    });
    return res.status(404).json({
      message: ORDER_MESSAGES.NOT_FOUND,
      code: "ORDER_NOT_FOUND",
      details: !config.isProd ? "주문 생성 API (POST /api/orders)가 호출되지 않았거나 실패했을 수 있습니다. 프론트엔드 네트워크 탭을 확인하세요." : undefined,
    });
  }

  // 3. 주문 소유자 검증
  if (order.userId !== userId) {
    return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
  }

  // 4. 결제 금액 검증 (중요: 클라이언트 조작 방지)
  const serverAmount = parseFloat(order.totalAmount);
  if (serverAmount !== amount) {
    logger.error("금액 불일치", { serverAmount, clientAmount: amount });
    return res.status(400).json({ message: PAYMENT_MESSAGES.AMOUNT_MISMATCH });
  }

  // 5. 결제 가능 상태 확인
  // pending_payment: 주문 생성 직후
  // paying: 결제창 오픈 후 (PUT /api/orders/:id/status/paying 호출 후)
  const payableStatuses = ["pending_payment", "paying"];
  if (!payableStatuses.includes(order.status)) {
    logger.warn("결제 불가능한 주문 상태", {
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      currentStatus: order.status,
      payableStatuses,
      userId: order.userId,
    });

    // 취소된 주문에 대한 명확한 메시지
    if (order.status === "cancelled") {
      return res.status(400).json({
        message: PAYMENT_MESSAGES.ORDER_CANCELLED,
        code: "ORDER_CANCELLED",
        currentStatus: order.status,
        hint: "프론트엔드에서 새로운 주문을 생성하고 결제를 다시 시도하세요.",
      });
    }

    // 이미 결제 완료된 주문
    if (order.status === "payment_confirmed") {
      return res.status(400).json({
        message: PAYMENT_MESSAGES.ALREADY_PAID,
        code: "ALREADY_PAID",
        currentStatus: order.status,
      });
    }

    // 기타 상태
    return res.status(400).json({
      message: PAYMENT_MESSAGES.INVALID_ORDER_STATUS,
      code: "INVALID_ORDER_STATUS",
      currentStatus: order.status,
    });
  }

  // 6. 토스페이먼츠 결제 승인 API 호출
  let payment;
  try {
    payment = await confirmPayment(paymentKey, orderId, amount);
  } catch (error) {
    // 디버깅: 에러 타입 확인
    logger.error("결제 에러 (토스) - 상세", {
      errorType: error?.constructor?.name,
      isTossPaymentError: error instanceof TossPaymentError,
      error: error instanceof Error ? error.message : String(error),
      errorCode: (error as any)?.code,
      errorObject: error,
    });

    if (error instanceof TossPaymentError) {
      const userMessage = tossErrorMessages[error.code] || error.message;

      logger.info("토스페이먼츠 에러 메시지 변환", {
        code: error.code,
        original: error.message,
        converted: userMessage
      });

      return res.status(error.statusCode).json({
        message: userMessage,
        code: error.code,
      });
    }

    // TossPaymentError가 아닌 일반 에러
    logger.warn("일반 Error로 처리됨 (TossPaymentError 아님)", {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  // 7. 재고 처리 분기: 선점 패턴 사용 여부에 따라 다르게 처리
  // @ts-ignore - isStockReserved는 새로 추가된 필드

  // 🔍 디버깅: isStockReserved 값과 실행 경로 확인
  logger.info("🔍 결제 승인 - 재고 처리 분기 확인", {
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
    logger.info("✅ 재고 이미 차감됨 - updateOrderPayment만 호출", { orderId: order.id });

    // 선점 패턴 사용: 이미 재고가 차감되어 있으므로 상태만 업데이트
    await storage.updateOrderPayment(order.id, {
      paymentProvider: "toss",
      paymentKey: payment.paymentKey,
      externalOrderId: payment.orderId,
      paymentMethod: payment.method,
      status: "payment_confirmed",
      // paidAt 생략 시 storage에서 NOW() 사용 (DB 세션 KST)
    });

    // 재고 선점 기록 삭제 (중요: 만료 시 이중 복구 방지)
    try {
      await db
        .delete(stockReservations)
        .where(eq(stockReservations.userId, userId));
      logger.info("재고 선점 기록 삭제 완료", { userId, orderId: order.id });
    } catch (deleteError) {
      // 선점 기록 삭제 실패 시 로그만 남기고 계속 진행
      logger.error("재고 선점 기록 삭제 실패", { userId, orderId: order.id, error: deleteError });
    }

    logger.info("결제 승인 완료 (선점 패턴 - 재고 이미 차감됨)", { orderId: order.id });
  } else {
    logger.warn("❌ 소프트 락 방식 실행 (deprecated) - 이중 차감 위험!", {
      orderId: order.id,
      isStockReserved: order.isStockReserved,
      warning: "주문 생성 시 isStockReserved를 true로 설정해야 합니다!",
    });

    // 기존 방식: 소프트 락 기반 재고 확인 및 차감 + 주문 상태 업데이트
    const stockResult = await storage.confirmOrderWithStockLock(order.id, {
      paymentProvider: "toss",
      paymentKey: payment.paymentKey,
      externalOrderId: payment.orderId,
      paymentMethod: payment.method,
      // paidAt 생략 시 storage에서 NOW() 사용 (DB 세션 KST)
    });

    // 8. 재고 부족 시 PG사 결제 취소 및 에러 반환
    if (!stockResult.success) {
      logger.error("재고 부족으로 결제 취소", {
        orderId: order.id,
        insufficientStock: stockResult.insufficientStock,
      });

      // PG사 결제 취소 시도
      try {
        await cancelTossPayment(payment.paymentKey, "재고 부족으로 인한 자동 취소");
        logger.info("재고 부족 - PG 결제 취소 완료", { orderId: order.id });
      } catch (cancelError) {
        // 결제 취소 실패 시 로그만 남기고 관리자 알림 필요
        logger.error("재고 부족 - PG 결제 취소 실패", {
          orderId: order.id,
          paymentKey: payment.paymentKey,
          error: cancelError,
        });
      }

      return res.status(409).json({
        success: false,
        message: stockResult.error || PAYMENT_MESSAGES.OUT_OF_STOCK,
        code: "INSUFFICIENT_STOCK",
        insufficientStock: stockResult.insufficientStock,
      });
    }
  }

  // 9. 장바구니 비우기 (결제 성공 시점에 수행)
  try {
    await storage.clearCart(userId);
    logger.info("장바구니 비우기 완료", { userId, orderId: order.id });
  } catch (cartError) {
    logger.error("장바구니 비우기 실패", { userId, orderId: order.id, error: cartError });
  }

  // 10. 최종 주문 정보 조회
  const updatedOrder = await storage.getOrder(order.id);

  // 11. 결제 완료 이메일 및 관리자 알림 발송 (비동기 - fire-and-forget)
  const user = await storage.getUser(userId);
  if (user?.email && updatedOrder) {
    const orderItems = await storage.getOrderItemsByOrderId(order.id);
    // 주문명 계산: "상품명" 또는 "상품명 외 N건"
    const orderName = orderItems.length > 1
      ? `${orderItems[0]?.productName} 외 ${orderItems.length - 1}건`
      : orderItems[0]?.productName || '주문';

    // Telegram 관리자 알림
    notifyPaymentComplete({
      externalOrderId: order.externalOrderId || '',
      userName: user.userName || '고객',
      orderName,
      totalAmount: parseFloat(updatedOrder.totalAmount),
      paymentMethod: payment.method,
      paymentProvider: "toss",
    }).catch(err => logger.error("결제 알림 발송 실패", { orderId: order.id, error: err instanceof Error ? err.message : String(err) }));

    sendPaymentConfirmEmail({
      orderId: order.id,
      externalOrderId: order.externalOrderId || '',
      userName: user.userName || '고객',
      email: user.email,
      orderName,
      items: orderItems.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        price: parseFloat(item.productPrice) * item.quantity,
        options: item.options,
      })),
      itemsAmount: parseFloat(updatedOrder.itemsAmount),
      shippingFee: parseFloat(updatedOrder.shippingFee),
      totalAmount: parseFloat(updatedOrder.totalAmount),
      shippingName: updatedOrder.shippingName,
      shippingAddress: updatedOrder.shippingAddress,
      shippingDetailAddress: updatedOrder.shippingDetailAddress,
      shippingPhone: updatedOrder.shippingPhone,
      paymentMethod: payment.method,
    }).catch(err => logger.error("결제 완료 이메일 발송 실패", { orderId: order.id, error: err instanceof Error ? err.message : String(err) }));
  }

  logger.info("결제 승인 완료 (재고 차감 + 장바구니 비움)", { orderId: order.id, paymentKey });

  res.json({
    success: true,
    message: PAYMENT_MESSAGES.SUCCESS,
    order: updatedOrder,
    payment: {
      paymentKey: payment.paymentKey,
      method: payment.method,
      approvedAt: payment.approvedAt,
      totalAmount: payment.totalAmount,
    },
  });
}));

/**
 * 결제 취소/환불
 * POST /api/payments/:orderId/cancel
 */
router.post("/:orderId/cancel", paymentRateLimiter, isAuthenticated, asyncHandler(async (req, res) => {
  const orderId = req.params.orderId; // UUID 문자열
  const userId = req.session.userId!;

  // 1. 요청 데이터 검증
  const validationResult = cancelPaymentSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({
      message: PAYMENT_MESSAGES.INVALID_REQUEST,
      errors: validationResult.error.flatten().fieldErrors,
    });
  }

  const { cancelReason, cancelAmount, refundReceiveAccount } =
    validationResult.data;

  // 2. 주문 조회 (UUID 기반)
  const order = await storage.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
  }

  // 3. 권한 검증 (본인 또는 관리자)
  const user = await storage.getUser(userId);
  if (order.userId !== userId && !user?.isAdmin) {
    return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
  }

  // 4. 결제 키 확인
  if (!order.paymentKey) {
    return res.status(400).json({ message: ORDER_MESSAGES.NO_PAYMENT_INFO });
  }

  // 5. 취소 가능 상태 확인
  const cancelableStatuses = ["payment_confirmed", "preparing"];
  if (!cancelableStatuses.includes(order.status)) {
    return res.status(400).json({
      message: `현재 상태(${order.status})에서는 취소할 수 없습니다`,
    });
  }

  // 6. PG사별 결제 취소 API 호출
  let payment: {
    status: string;
    cancels?: Array<{
      cancelAmount: number;
      refundableAmount: number;
      canceledAt: string;
    }>
  };

  try {
    const provider = order.paymentProvider || "toss";

    logger.info("PG사 결제 취소 시작 (payment API)", {
      orderId,
      provider,
      cancelAmount,
    });

    if (provider === "naverpay") {
      // 네이버페이는 부분 취소 지원 여부 확인 필요
      if (cancelAmount !== undefined) {
        logger.warn("네이버페이 부분 취소 시도 차단", { orderId, cancelAmount });
        return res.status(400).json({
          message: PAYMENT_MESSAGES.NAVERPAY_NO_PARTIAL,
          code: "NAVERPAY_PARTIAL_CANCEL_NOT_SUPPORTED",
        });
      }

      const totalAmount = parseFloat(order.totalAmount);
      const naverPayResponse = await cancelNaverPayPayment({
        paymentId: order.paymentKey,
        cancelAmount: totalAmount,
        cancelReason,
        cancelRequester: "2",
        taxScopeAmount: totalAmount,
        taxExScopeAmount: 0,
      });

      payment = normalizeNaverPayCancelResponse(naverPayResponse, totalAmount);
      logger.info("네이버페이 결제 취소 완료 (payment API)", { orderId });
    } else {
      // 토스페이먼츠 취소 (부분 취소 지원)
      payment = await cancelTossPayment(
        order.paymentKey,
        cancelReason,
        cancelAmount,
        refundReceiveAccount
      );
      logger.info("토스페이먼츠 결제 취소 완료 (payment API)", { orderId });
    }
  } catch (error) {
    // PG사별 에러 처리
    if (error instanceof TossPaymentError) {
      const userMessage = tossErrorMessages[error.code] || error.message;
      return res.status(error.statusCode).json({
        message: userMessage,
        code: error.code,
      });
    } else if (error instanceof NaverPayPaymentError) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }

    throw error;
  }

  // 7. 주문 상태 업데이트 (canceledAt은 storage에서 NOW() 사용)
  const newStatus = payment.status === "CANCELED" ? "cancelled" : order.status;
  const updatedOrder = await storage.cancelOrderPayment(orderId, {
    status: newStatus,
    cancelReason,
    refundedAmount: cancelAmount?.toString(),
  });

  // 8. 재고 복구 (결제 완료된 주문만 재고가 차감되어 있음)
  if (newStatus === "cancelled") {
    try {
      await storage.restoreStockOnCancel(orderId);
      logger.info("재고 복구 완료", { orderId });
    } catch (restoreError) {
      // 재고 복구 실패 시 로그 남기고 계속 진행 (관리자 수동 처리 필요)
      logger.error("재고 복구 실패", { orderId, error: restoreError });
    }

    // 🔒 Option A: 재고 선점 패턴 제거로 인해 불필요 (주석 처리)
    // 재고는 restoreStockOnCancel()에서 복구됨
  }

  logger.info("결제 취소 완료", { orderId });

  res.json({
    message: PAYMENT_MESSAGES.CANCEL_SUCCESS,
    order: updatedOrder,
    refund: {
      cancelAmount: payment.cancels?.[0]?.cancelAmount,
      refundableAmount: payment.cancels?.[0]?.refundableAmount,
      canceledAt: payment.cancels?.[0]?.canceledAt,
    },
  });
}));

/**
 * 결제 상태 조회
 * GET /api/payments/:orderId/status
 */
router.get("/:orderId/status", isAuthenticated, asyncHandler(async (req, res) => {
  const orderId = req.params.orderId; // UUID 문자열
  const userId = req.session.userId!;

  // 주문 조회 (UUID 기반)
  const order = await storage.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
  }

  // 권한 검증
  const user = await storage.getUser(userId);
  if (order.userId !== userId && !user?.isAdmin) {
    return res.status(403).json({ message: AUTH_MESSAGES.FORBIDDEN });
  }

  // 결제 키가 없으면 DB 상태만 반환
  if (!order.paymentKey) {
    return res.json({
      orderId: order.id,
      status: order.status,
      paymentInfo: null,
    });
  }

  // PG사에서 최신 결제 정보 조회 (현재 토스페이먼츠만 지원)
  // TODO: 네이버페이 등 다른 PG사 추가 시 order.paymentProvider로 분기
  let payment;
  try {
    payment = await getTossPayment(order.paymentKey);
  } catch (error) {
    // 디버깅: 에러 타입 확인
    logger.error("결제 상태 조회 에러 (토스) - 상세", {
      errorType: error?.constructor?.name,
      isTossPaymentError: error instanceof TossPaymentError,
      error: error instanceof Error ? error.message : String(error),
      errorCode: (error as any)?.code,
      errorObject: error,
    });

    if (error instanceof TossPaymentError) {
      const userMessage = tossErrorMessages[error.code] || error.message;

      logger.info("토스페이먼츠 에러 메시지 변환 (조회)", {
        code: error.code,
        original: error.message,
        converted: userMessage
      });

      return res.status(error.statusCode).json({
        message: userMessage,
        code: error.code,
      });
    }

    // TossPaymentError가 아닌 일반 에러
    logger.warn("일반 Error로 처리됨 (TossPaymentError 아님)", {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  res.json({
    orderId: order.id,
    status: order.status,
    paymentInfo: {
      paymentKey: payment.paymentKey,
      status: payment.status,
      method: payment.method,
      totalAmount: payment.totalAmount,
      balanceAmount: payment.balanceAmount,
      approvedAt: payment.approvedAt,
      cancels: payment.cancels,
    },
  });
}));

export default router;
