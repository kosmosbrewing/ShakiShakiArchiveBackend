// server/jobs/auto-confirm.job.ts
// 배송 완료 7일 후 자동 구매확정 스케줄러 (아이템 단위)

import cron from "node-cron";
import { pool } from "../db";
import { storage } from "../storage";
import { createLogger } from "../utils/logger";
import { AUTO_CONFIRM_SCHEDULER, SCHEDULER_TIMEZONE } from "@shared/constants";

const logger = createLogger("AutoConfirm");

/**
 * 자동 구매확정 처리 (아이템 단위)
 *
 * 조건:
 * 1. 아이템 상태가 delivered(배송완료)
 * 2. delivered_at으로부터 7일(168시간) 경과
 *
 * 처리:
 * - 아이템 상태를 purchase_confirmed로 변경
 * - 아이템별 SAVEPOINT로 에러 격리
 * - 처리 후 syncOrderStatusFromItems로 부모 주문 동기화
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

    // 1. 자동 구매확정 대상 아이템 조회
    // - 아이템 상태가 delivered
    // - delivered_at으로부터 N일 경과
    // - FOR UPDATE SKIP LOCKED로 동시 실행 방지
    const query = `
      SELECT oi.id, oi.order_id, oi.delivered_at, oi.product_name
      FROM order_items oi
      WHERE oi.status = 'delivered'
        AND oi.delivered_at IS NOT NULL
        AND oi.delivered_at <= NOW() - INTERVAL '${AUTO_CONFIRM_SCHEDULER.DAYS_AFTER_DELIVERY} days'
      FOR UPDATE SKIP LOCKED
    `;

    const itemsResult = await client.query(query);
    const items = itemsResult.rows;

    logger.info("자동 구매확정 대상 아이템 조회", {
      count: items.length,
    });

    if (items.length === 0) {
      await client.query("COMMIT");
      return result;
    }

    // 2. 각 아이템을 SAVEPOINT로 격리하여 구매확정 처리
    // 처리된 주문 ID 수집 (동기화용)
    const affectedOrderIds = new Set<string>();

    for (const item of items) {
      const savepointName = `item_${item.id}`;
      try {
        await client.query(`SAVEPOINT ${savepointName}`);

        // 아이템 상태 업데이트
        await client.query(
          `UPDATE order_items
           SET status = 'purchase_confirmed'
           WHERE id = $1`,
          [item.id]
        );

        await client.query(`RELEASE SAVEPOINT ${savepointName}`);

        affectedOrderIds.add(item.order_id);
        result.processed++;

        logger.info("자동 구매확정 아이템 완료", {
          itemId: item.id,
          orderId: item.order_id,
          productName: item.product_name,
          deliveredAt: item.delivered_at,
        });
      } catch (itemError) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        result.errors++;

        logger.error("자동 구매확정 아이템 실패", {
          itemId: item.id,
          orderId: item.order_id,
          error: itemError instanceof Error ? itemError.message : String(itemError),
        });
      }
    }

    await client.query("COMMIT");

    // 3. 영향받은 주문들의 상태 동기화 (트랜잭션 외부에서 개별 처리)
    const orderIds = Array.from(affectedOrderIds);
    for (const orderId of orderIds) {
      try {
        await storage.syncOrderStatusFromItems(orderId);
      } catch (syncError) {
        logger.error("주문 상태 동기화 실패", {
          orderId,
          error: syncError instanceof Error ? syncError.message : String(syncError),
        });
      }
    }

    logger.info("자동 구매확정 배치 완료", {
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
      affectedOrders: orderIds.length,
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
