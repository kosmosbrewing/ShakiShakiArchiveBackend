// server/jobs/auto-confirm.job.ts
// 배송 완료 7일 후 자동 구매확정 스케줄러

import cron from "node-cron";
import { pool } from "../db";
import { createLogger } from "../utils/logger";
import { AUTO_CONFIRM_SCHEDULER, SCHEDULER_TIMEZONE } from "@shared/constants";

const logger = createLogger("AutoConfirm");

/**
 * 자동 구매확정 처리
 *
 * 조건:
 * 1. 주문 상태가 delivered(배송완료)
 * 2. delivered_at으로부터 7일(168시간) 경과
 * 3. 반품 진행 중인 주문 제외 (return_requested, return_in_transit, return_received)
 *
 * 처리:
 * - 주문 상태를 purchase_confirmed로 변경
 * - confirmed_at에 현재 시간 기록
 */
async function processAutoConfirm(): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  const client = await pool.connect();
  const result = { processed: 0, skipped: 0, errors: 0 };

  try {
    await client.query("BEGIN");

    // 1. 자동 구매확정 대상 주문 조회
    // - 배송완료(delivered) 상태
    // - delivered_at으로부터 N일 경과 (상수에서 설정)
    // - 반품 진행 중인 아이템이 없는 주문
    const query = `
      SELECT o.id, o.external_order_id, o.delivered_at, o.user_id
      FROM orders o
      WHERE o.status = 'delivered'
        AND o.delivered_at IS NOT NULL
        AND o.delivered_at <= NOW() - INTERVAL '${AUTO_CONFIRM_SCHEDULER.DAYS_AFTER_DELIVERY} days'
        AND NOT EXISTS (
          SELECT 1 FROM order_items oi
          WHERE oi.order_id = o.id
          AND oi.status IN ('return_requested', 'return_in_transit', 'return_received')
        )
      FOR UPDATE SKIP LOCKED
    `;

    const ordersResult = await client.query(query);
    const orders = ordersResult.rows;

    logger.info("자동 구매확정 대상 조회", {
      count: orders.length,
    });

    if (orders.length === 0) {
      await client.query("COMMIT");
      return result;
    }

    // 2. 각 주문을 구매확정 처리
    for (const order of orders) {
      try {
        // 주문 상태 업데이트
        await client.query(
          `UPDATE orders
           SET status = 'purchase_confirmed',
               confirmed_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [order.id]
        );

        // 주문 아이템 상태도 업데이트 (배송완료 → 구매확정)
        await client.query(
          `UPDATE order_items
           SET status = 'purchase_confirmed',
               updated_at = NOW()
           WHERE order_id = $1 AND status = 'delivered'`,
          [order.id]
        );

        result.processed++;

        logger.info("자동 구매확정 완료", {
          orderId: order.id,
          externalOrderId: order.external_order_id,
          userId: order.user_id,
          deliveredAt: order.delivered_at,
        });
      } catch (orderError) {
        result.errors++;
        logger.error("자동 구매확정 실패", {
          orderId: order.id,
          error: orderError instanceof Error ? orderError.message : String(orderError),
        });
      }
    }

    await client.query("COMMIT");

    logger.info("자동 구매확정 배치 완료", {
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("자동 구매확정 배치 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 자동 구매확정 스케줄러 시작
 *
 * 실행 시간: 상수에서 설정 (기본값: 매일 KST 새벽 3시)
 */
export function startAutoConfirmScheduler(): void {
  const { CRON_EXPRESSION, DESCRIPTION, DAYS_AFTER_DELIVERY } = AUTO_CONFIRM_SCHEDULER;

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      logger.info("자동 구매확정 스케줄러 실행 시작", {
        scheduledTime: new Date().toISOString(),
        kstTime: new Date().toLocaleString("ko-KR", { timeZone: SCHEDULER_TIMEZONE.KST }),
        daysAfterDelivery: DAYS_AFTER_DELIVERY,
      });

      try {
        const result = await processAutoConfirm();
        logger.info("자동 구매확정 스케줄러 실행 완료", {
          result,
        });
      } catch (error) {
        logger.error("자동 구매확정 스케줄러 실행 실패", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    {
      timezone: SCHEDULER_TIMEZONE.KST,
    }
  );

  logger.info("자동 구매확정 스케줄러 등록 완료", {
    schedule: DESCRIPTION,
    cronExpression: CRON_EXPRESSION,
    timezone: SCHEDULER_TIMEZONE.KST,
    daysAfterDelivery: DAYS_AFTER_DELIVERY,
  });
}

/**
 * 수동 실행용 함수 (테스트 또는 관리자 호출용)
 */
export async function runAutoConfirmManually(): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  logger.info("자동 구매확정 수동 실행 시작");
  return processAutoConfirm();
}
