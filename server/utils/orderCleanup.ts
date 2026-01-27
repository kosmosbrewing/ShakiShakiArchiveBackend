// server/utils/orderCleanup.ts
// 유령 주문 자동 정리 (5분 이상 pending_payment/paying 상태 주문 삭제)
// cancelled, refunded 상태는 영구 보관 (사용자가 인지한 액션)

import { db } from "../db";
import { orders } from "../../shared/schema";
import { eq, and, lt, or, sql } from "drizzle-orm";
import { storage } from "../storage";
import { createLogger } from "./logger";
import { ORDER_CLEANUP_SCHEDULER } from "@shared/constants";

const logger = createLogger("OrderCleanup");

// 상수에서 설정값 가져오기
const { INTERVAL_MS: CLEANUP_INTERVAL_MS, MAX_PENDING_AGE_MS: ORDER_EXPIRY_MS } = ORDER_CLEANUP_SCHEDULER;

/**
 * 만료된 유령 주문 정리 함수
 * - 5분 이상 pending_payment 또는 paying 상태인 주문 삭제
 * - cancelled, refunded 상태는 유지 (사용자가 인지한 액션은 영구 보관)
 * - 재고 복구 수행 (브라우저 강제 종료 대응)
 */
async function cleanupExpiredOrders(): Promise<void> {
  // SQL의 NOW()를 사용하여 DB 시간 기준으로 비교 (timezone 문제 해결)
  const expirySeconds = ORDER_EXPIRY_MS / 1000;

  try {
    // 🔒 유령 주문만 조회 (cancelled 상태는 제외)
    // NOW() - INTERVAL 사용으로 timezone 변환 문제 해결
    const expiredOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          or(
            eq(orders.status, "pending_payment"),
            eq(orders.status, "paying")
          ),
          sql`${orders.createdAt} < NOW() - INTERVAL '${sql.raw(expirySeconds.toString())} seconds'`
        )
      );

    if (expiredOrders.length === 0) {
      logger.debug("정리할 만료된 주문 없음", {
        expiryMinutes: ORDER_EXPIRY_MS / 1000 / 60,
        query: `created_at < NOW() - INTERVAL '${expirySeconds} seconds'`,
      });
      return;
    }

    logger.info("만료된 유령 주문 발견", {
      count: expiredOrders.length,
      expiryMinutes: ORDER_EXPIRY_MS / 1000 / 60,
      statuses: expiredOrders.map(o => o.status),
    });

    // 각 주문 삭제 및 재고 복구
    let successCount = 0;
    let failCount = 0;

    for (const order of expiredOrders) {
      try {
        // 🔒 Option A: 주문 생성 시 즉시 재고 차감하므로 항상 재고 복구 필요
        // 재고 복구 + 주문 삭제를 하나의 트랜잭션으로 처리 (중복 재고 복구 방지)
        logger.debug("유령 주문 처리 시작 (재고 복구 + 삭제)", {
          orderId: order.id,
          externalOrderId: order.externalOrderId,
          status: order.status,
          userId: order.userId,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt,
        });

        // 원자적 트랜잭션: 재고 복구 성공 시에만 주문 삭제
        await storage.restoreStockAndDeleteOrder(order.id);

        logger.debug("유령 주문 처리 완료 (재고 복구 + 삭제)", {
          orderId: order.id,
          externalOrderId: order.externalOrderId,
        });

        successCount++;
      } catch (error) {
        logger.error("유령 주문 처리 실패", {
          orderId: order.id,
          externalOrderId: order.externalOrderId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        failCount++;
      }
    }

    logger.info("주문 정리 완료", {
      total: expiredOrders.length,
      success: successCount,
      failed: failCount,
    });
  } catch (error) {
    logger.error("주문 정리 중 오류 발생", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 자동 정리 인터벌
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * 유령 주문 자동 정리 시작
 * 서버 시작 시 호출됨 (server/index.ts)
 */
export function startOrderCleanup(): void {
  if (cleanupInterval) {
    logger.warn("주문 정리가 이미 실행 중입니다");
    return;
  }

  // 즉시 한 번 실행
  cleanupExpiredOrders();

  // 주기적 실행
  cleanupInterval = setInterval(async () => {
    try {
      await cleanupExpiredOrders();
    } catch (error) {
      logger.error("주문 정리 실패", { error });
    }
  }, CLEANUP_INTERVAL_MS);

  logger.info("유령 주문 자동 정리 시작 (고속 모드)", {
    intervalMs: CLEANUP_INTERVAL_MS,
    expiryMs: ORDER_EXPIRY_MS,
    intervalMinutes: CLEANUP_INTERVAL_MS / 1000 / 60,
    expiryMinutes: ORDER_EXPIRY_MS / 1000 / 60,
    note: "브라우저 강제 종료 대응 - 1분 간격, 5분 만료",
  });
}

/**
 * 유령 주문 자동 정리 중지
 * 서버 종료 시 또는 테스트용
 */
export function stopOrderCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("주문 정리 중지");
  }
}

/**
 * 수동 정리 실행 (관리자 API 또는 CLI 스크립트용)
 */
export async function cleanupNow(): Promise<void> {
  logger.info("수동 주문 정리 시작");
  await cleanupExpiredOrders();
}
