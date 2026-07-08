// server/routes/kakaopay.routes.ts
// 카카오페이 결제 라우트
// 참고: https://developers.kakao.com/docs/latest/ko/kakaopay/single-payment

import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db, pool } from "../db";
import { hasVerifiedAdminSession, isAuthenticated } from "../middleware/auth.middleware";
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
import { sendPaymentConfirmEmail } from "../services/email.service";
import { notifyPaymentComplete } from "../services/telegram.service";

const router = Router();
const logger = createLogger("KakaoPay");

/**
 * tid 저장소 (메모리 기반, TTL 자동 정리)
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
const TID_TTL_MS = 15 * 60 * 1000; // 15분 (카카오페이 결제 유효 시간)
const TID_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5분마다 정리

interface TidEntry {
  tid: string;
  partnerUserId: string;
  createdAt: number;
}

const tidStore = new Map<string, TidEntry>();

// tid 정리: 인메모리 + 세션 백업을 함께 삭제 (승인 성공/취소/실패 공통)
function clearTidEntry(req: { session?: { kakaopayTids?: Record<string, TidEntry> } }, orderId: string): void {
  tidStore.delete(orderId);
  if (req.session?.kakaopayTids?.[orderId]) {
    delete req.session.kakaopayTids[orderId];
  }
}

// TTL 만료된 엔트리 자동 정리
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  tidStore.forEach((entry, key) => {
    if (now - entry.createdAt > TID_TTL_MS) {
      tidStore.delete(key);
      cleaned++;
    }
  });
  if (cleaned > 0) {
    logger.debug("만료된 tid 엔트리 정리", { cleaned, remaining: tidStore.size });
  }
}, TID_CLEANUP_INTERVAL_MS);

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
      const tidEntry = {
        tid: readyResult.tid,
        partnerUserId,
        createdAt: Date.now(),
      };
      tidStore.set(orderId, tidEntry);

      // 7-1. 세션(PG 스토어)에도 백업 — 인메모리는 서버 재시작/다중 인스턴스에서
      // 유실되어 배포 순간 결제 진행 사용자가 승인 실패하던 문제를 구제.
      // 콜백에서 쿠키가 유실되는 환경은 기존 Map 경로가 그대로 커버
      const sessionTids = req.session.kakaopayTids ?? {};
      for (const [key, entry] of Object.entries(sessionTids)) {
        if (Date.now() - entry.createdAt > TID_TTL_MS) {
          delete sessionTids[key]; // 만료 엔트리 정리 (세션 비대 방지)
        }
      }
      sessionTids[orderId] = tidEntry;
      req.session.kakaopayTids = sessionTids;

      // 8. 주문 상태를 paying으로 업데이트 (orders + order_items 동시)
      const payingClient = await pool.connect();
      try {
        await payingClient.query("BEGIN");
        await payingClient.query(
          `UPDATE orders SET status = 'paying', updated_at = NOW() WHERE id = $1`,
          [orderId]
        );
        await payingClient.query(
          `UPDATE order_items SET status = 'paying' WHERE order_id = $1`,
          [orderId]
        );
        await payingClient.query("COMMIT");
      } catch (payingError) {
        await payingClient.query("ROLLBACK");
        throw payingError;
      } finally {
        payingClient.release();
      }

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

    // tid 조회: 인메모리 우선, 없으면 세션 백업(재시작/다중 인스턴스 구제)
    let tidInfo = tidStore.get(orderId);
    let tidSource: "memory" | "session" = "memory";
    if (!tidInfo) {
      const sessionEntry = req.session?.kakaopayTids?.[orderId];
      if (sessionEntry && Date.now() - sessionEntry.createdAt <= TID_TTL_MS) {
        tidInfo = sessionEntry;
        tidSource = "session";
      }
    }
    if (!tidInfo) {
      // both-miss: 세션 백업 도입 후에도 발생하면 쿠키 유실+재시작 중첩 케이스 —
      // 빈도 관측 후 orders 컬럼 방식(완전 해결) 도입 판단 근거로 사용
      logger.error("tid 정보 없음 (메모리·세션 모두 miss)", {
        orderId,
        hasSession: !!req.session,
        hasSessionTids: !!req.session?.kakaopayTids,
      });
      const failUrl = new URL("/checkout/fail", config.frontendUrl);
      failUrl.searchParams.set("orderId", orderId);
      failUrl.searchParams.set("message", "결제 정보가 만료되었습니다");
      return res.redirect(failUrl.toString());
    }
    logger.info("카카오페이 tid 조회 성공", { orderId, source: tidSource });

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

        // 선점 패턴 사용: 이미 재고가 차감되어 있으므로 상태만 업데이트.
        // expectedStatuses 가드: 진입부 상태 체크와 이 UPDATE 사이에 다른 콜백이
        // 먼저 확정하면(동시 중복 콜백) 여기서 0건 갱신 → 이중 부작용 방지
        const confirmedOrder = await storage.updateOrderPayment(
          order.id,
          {
            paymentProvider: "kakaopay",
            paymentKey: approveResult.tid,
            externalOrderId: approveResult.partner_order_id,
            paymentMethod: approveResult.payment_method_type.toLowerCase(),
            status: "payment_confirmed",
            // paidAt 생략 시 storage에서 NOW() 사용 (DB 세션 KST)
          },
          { expectedStatuses: payableStatuses }
        );

        if (!confirmedOrder) {
          // 다른 요청이 먼저 확정함 — 알림·장바구니 비우기 등 부작용 스킵하고
          // 기존 "이미 결제된 주문" 처리와 동일하게 success로 안내
          logger.warn("동시 중복 콜백 감지 - 이미 확정된 주문 (카카오페이)", {
            orderId: order.id,
          });
          clearTidEntry(req, orderId);
          const alreadyPaidUrl = new URL("/checkout/success", config.frontendUrl);
          alreadyPaidUrl.searchParams.set("result", "success");
          alreadyPaidUrl.searchParams.set("orderId", orderId);
          alreadyPaidUrl.searchParams.set("provider", "kakaopay");
          alreadyPaidUrl.searchParams.set("externalOrderId", order.externalOrderId || "");
          alreadyPaidUrl.searchParams.set("amount", order.totalAmount);
          alreadyPaidUrl.searchParams.set("alreadyPaid", "true");
          return res.redirect(alreadyPaidUrl.toString());
        }

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

        // 장바구니 비우기 (결제 완료된 상품 제거)
        try {
          await storage.clearCart(order.userId);
          logger.info("장바구니 비우기 완료", {
            userId: order.userId,
            orderId: order.id,
          });
        } catch (cartError) {
          logger.error("장바구니 비우기 실패", {
            userId: order.userId,
            orderId: order.id,
            error: cartError,
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
          // paidAt 생략 시 storage에서 NOW() 사용 (DB 세션 KST)
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

      // tid 저장소에서 제거 (인메모리 + 세션 백업)
      clearTidEntry(req, orderId);

      logger.info("카카오페이 결제 승인 완료", {
        orderId,
        tid: approveResult.tid,
        totalPayAmount: approveResult.amount.total,
      });

      // 결제 완료 알림 발송 (비동기 - fire-and-forget)
      const updatedOrder = await storage.getOrder(order.id);
      const user = await storage.getUser(order.userId);

      if (updatedOrder) {
        const orderItems = await storage.getOrderItemsByOrderId(order.id);
        const orderName = orderItems.length > 1
          ? `${orderItems[0]?.productName} 외 ${orderItems.length - 1}건`
          : orderItems[0]?.productName || '주문';

        // Telegram 관리자 알림 (email 유무와 무관하게 항상 발송)
        notifyPaymentComplete({
          externalOrderId: order.externalOrderId || '',
          userName: user?.userName || '고객',
          orderName,
          totalAmount: parseFloat(updatedOrder.totalAmount),
          paymentMethod: approveResult.payment_method_type || 'CARD',
          paymentProvider: "kakaopay",
        }).catch(err => logger.error("결제 알림 발송 실패", { orderId: order.id, error: err instanceof Error ? err.message : String(err) }));

        // 이메일 알림 (email이 있는 사용자만)
        if (user?.email) {
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
            paymentMethod: approveResult.payment_method_type || 'kakaopay',
          }).catch(err => logger.error("결제 완료 이메일 발송 실패", { orderId: order.id, error: err instanceof Error ? err.message : String(err) }));
        }
      } else {
        logger.warn("결제 완료 알림 스킵: 주문 조회 실패", { orderId: order.id });
      }

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

      // 동시 중복 콜백 보완: 다른 요청이 먼저 승인한 경우 카카오 approve가
      // 에러를 반환하는데, 사용자 결제는 실제로 성공한 상태 — 주문 상태를
      // 재확인해 이미 확정됐으면 실패가 아닌 success로 안내
      // (확정 UPDATE가 approve 직후라 잠깐 기다렸다 한 번 더 확인)
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const recheck = await storage.getOrder(orderId);
        if (recheck?.status === "payment_confirmed") {
          logger.warn("승인 에러였으나 주문은 이미 확정됨 - 중복 콜백으로 판단", {
            orderId,
          });
          clearTidEntry(req, orderId);
          const alreadyPaidUrl = new URL("/checkout/success", config.frontendUrl);
          alreadyPaidUrl.searchParams.set("result", "success");
          alreadyPaidUrl.searchParams.set("orderId", orderId);
          alreadyPaidUrl.searchParams.set("provider", "kakaopay");
          alreadyPaidUrl.searchParams.set("externalOrderId", recheck.externalOrderId || "");
          alreadyPaidUrl.searchParams.set("amount", recheck.totalAmount);
          alreadyPaidUrl.searchParams.set("alreadyPaid", "true");
          return res.redirect(alreadyPaidUrl.toString());
        }
      } catch (recheckError) {
        logger.error("승인 에러 후 주문 상태 재확인 실패", {
          orderId,
          error: recheckError instanceof Error ? recheckError.message : String(recheckError),
        });
      }

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

  // tid 저장소에서 제거 (인메모리 + 세션 백업)
  if (orderId) {
    clearTidEntry(req, orderId);
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

  // tid 저장소에서 제거 (인메모리 + 세션 백업)
  if (orderId) {
    clearTidEntry(req, orderId);
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
    if (order.userId !== userId && !hasVerifiedAdminSession(req, user)) {
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
    if (order.userId !== userId && !hasVerifiedAdminSession(req, user)) {
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

    // canceledAt은 storage에서 NOW() 사용 (DB 세션 KST)
    await storage.cancelOrderPayment(orderId, {
      status: newStatus,
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
