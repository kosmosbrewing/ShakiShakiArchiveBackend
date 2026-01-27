// server/routes/stock.routes.ts
// 재고 선점 관련 라우트 (/api/stock/*)

import { Router } from "express";
import { db, pool } from "../db";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import {
  reserveStockRequestSchema,
  stockReservations,
  products,
  productVariants,
  cartItems,
  type StockReservation,
} from "@shared/schema";
import { STOCK_MESSAGES, STOCK_RESERVATION_CLEANUP_SCHEDULER } from "../constants";
import { eq, and, gt, lt } from "drizzle-orm";
import { createLogger } from "../utils/logger";

const router = Router();
const logger = createLogger("StockReservation");

// 재고 부족 상품 정보
interface InsufficientStockItem {
  productId: string;
  variantId?: string;
  productName: string;
  variantInfo?: string;
  requestedQuantity: number;
  availableStock: number;
}

// 선점 아이템 정보
interface ReservedItem {
  productId: string;
  variantId?: string;
  quantity: number;
  productName: string;
}

/**
 * 재고 선점 요청
 * POST /api/stock/reserve
 *
 * 결제 전 재고를 임시 점유합니다.
 * TTL 시간 내에 주문이 완료되지 않으면 자동 해제됩니다.
 */
router.post(
  "/reserve",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;

    // 입력값 검증
    const validatedBody = reserveStockRequestSchema.parse(req.body);
    const { items, directPurchaseItem } = validatedBody;

    // 바로 구매 모드인 경우 items 대신 directPurchaseItem 사용
    const itemsToReserve = directPurchaseItem
      ? [
          {
            productId: directPurchaseItem.productId,
            variantId: directPurchaseItem.variantId,
            quantity: directPurchaseItem.quantity,
          },
        ]
      : items;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. 🔒 Self-Lock Bypass: 기존 선점 조회 (본인 재고 확인용)
      const existingReservationResult = await client.query(
        `SELECT id, items FROM stock_reservations
         WHERE user_id = $1 AND expires_at > NOW()`,
        [userId]
      );

      // 2. 🔒 Self-Lock Bypass (확장): 본인의 paying 상태 주문 조회
      // 브라우저 강제 종료 후 재진입 시 즉시 재구매 가능하도록
      const payingOrdersResult = await client.query(
        `SELECT oi.product_id, oi.variant_id, oi.quantity, oi.options
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.user_id = $1
           AND o.status = 'paying'
           AND o.created_at > NOW() - INTERVAL '10 minutes'`,
        [userId]
      );

      // 본인의 기존 선점 + paying 주문 아이템을 Map으로 저장 (variantId -> quantity)
      const userReservedStock = new Map<string, number>();

      // 2-1. 재고 선점 아이템 추가
      if (existingReservationResult.rows.length > 0) {
        const existingItems = existingReservationResult.rows[0]
          .items as ReservedItem[];
        for (const item of existingItems) {
          const key = item.variantId || item.productId;
          userReservedStock.set(key, item.quantity);
        }
      }

      // 2-2. paying 주문 아이템 추가 (브라우저 강제 종료 대응)
      for (const item of payingOrdersResult.rows) {
        const key = item.variant_id || item.product_id;
        const existing = userReservedStock.get(key) || 0;
        userReservedStock.set(key, existing + item.quantity);
      }

      logger.info("재고 선점 요청 - 본인 차감 재고 확인", {
        userId,
        reservationCount: existingReservationResult.rows.length,
        payingOrderCount: payingOrdersResult.rows.length,
        totalReservedItems: userReservedStock.size,
      });

      // 3. 기존 만료되지 않은 선점 삭제 (새로운 선점으로 교체)
      await client.query(
        `DELETE FROM stock_reservations WHERE user_id = $1 AND expires_at > NOW()`,
        [userId]
      );

      const insufficientStock: InsufficientStockItem[] = [];
      const reservedItems: ReservedItem[] = [];

      // 4. 각 상품에 대해 재고 확인 및 차감 (소프트 락)
      for (const item of itemsToReserve) {
        let productName = "";
        let variantInfo = "";
        let availableStock = 0;

        if (item.variantId) {
          // variant가 있는 경우: SELECT FOR UPDATE로 행 잠금 후 재고 확인
          const variantResult = await client.query(
            `SELECT pv.id, pv.stock_quantity, pv.size, pv.color, p.name as product_name
             FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
             WHERE pv.id = $1 AND pv.product_id = $2
             FOR UPDATE`,
            [item.variantId, item.productId]
          );

          if (variantResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res
              .status(400)
              .json({ message: STOCK_MESSAGES.VARIANT_NOT_FOUND });
          }

          const variant = variantResult.rows[0];
          productName = variant.product_name;
          variantInfo = `Size: ${variant.size}${
            variant.color ? `, Color: ${variant.color}` : ""
          }`;
          availableStock = variant.stock_quantity;

          // 🔒 Self-Lock Bypass: 본인의 선점 재고를 사용 가능한 재고로 계산
          const userReserved = userReservedStock.get(item.variantId!) || 0;
          const effectiveStock = availableStock + userReserved;

          if (effectiveStock < item.quantity) {
            insufficientStock.push({
              productId: item.productId,
              variantId: item.variantId,
              productName,
              variantInfo,
              requestedQuantity: item.quantity,
              availableStock,
            });
          } else {
            // 소프트 락: 재고 선차감 (결제 실패/취소 시 복구)
            await client.query(
              `UPDATE product_variants
               SET stock_quantity = stock_quantity - $1, updated_at = NOW()
               WHERE id = $2`,
              [item.quantity, item.variantId]
            );

            reservedItems.push({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              productName,
            });
          }
        } else {
          // variant가 없는 경우: products 테이블 재고 확인
          const productResult = await client.query(
            `SELECT id, name, stock_quantity FROM products WHERE id = $1 FOR UPDATE`,
            [item.productId]
          );

          if (productResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res
              .status(400)
              .json({ message: STOCK_MESSAGES.PRODUCT_NOT_FOUND });
          }

          const product = productResult.rows[0];
          productName = product.name;
          availableStock = product.stock_quantity;

          // 🔒 Self-Lock Bypass: 본인의 선점 재고를 사용 가능한 재고로 계산
          const userReserved = userReservedStock.get(item.productId) || 0;
          const effectiveStock = availableStock + userReserved;

          if (effectiveStock < item.quantity) {
            insufficientStock.push({
              productId: item.productId,
              productName,
              requestedQuantity: item.quantity,
              availableStock,
            });
          } else {
            // 소프트 락: 재고 선차감 (결제 실패/취소 시 복구)
            await client.query(
              `UPDATE products
               SET stock_quantity = stock_quantity - $1, updated_at = NOW()
               WHERE id = $2`,
              [item.quantity, item.productId]
            );

            reservedItems.push({
              productId: item.productId,
              quantity: item.quantity,
              productName,
            });
          }
        }
      }

      // 5. 재고 부족 시 롤백 (이미 차감된 재고도 롤백됨)
      if (insufficientStock.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: STOCK_MESSAGES.INSUFFICIENT_STOCK,
          code: "STOCK_SHORTAGE",
          shortageItems: insufficientStock,
        });
      }

      // 6. 재고 선점 기록 생성 (해제/만료 시 재고 복구용)
      const { TTL_SECONDS } = STOCK_RESERVATION_CLEANUP_SCHEDULER;
      const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
      const reservationResult = await client.query(
        `INSERT INTO stock_reservations (user_id, items, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id, expires_at, created_at`,
        [userId, JSON.stringify(reservedItems), expiresAt]
      );

      const reservation = reservationResult.rows[0];

      await client.query("COMMIT");

      logger.info("재고 선점 완료", {
        userId,
        reservationId: reservation.id,
        itemCount: reservedItems.length,
        selfLockBypassed: userReservedStock.size > 0, // 본인 선점/paying 주문 재고 재사용 여부
        payingOrdersFound: payingOrdersResult.rows.length > 0, // 브라우저 강제 종료 후 재진입 감지
      });

      res.json({
        reservationId: reservation.id,
        expiresAt: reservation.expires_at,
        ttlSeconds: TTL_SECONDS,
        reservedItems,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

/**
 * 재고 선점 해제
 * DELETE /api/stock/reserve/:reservationId
 *
 * 결제 취소/실패 시 선점을 해제하고 재고를 복구합니다.
 */
router.delete(
  "/reserve/:reservationId",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const { reservationId } = req.params;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 선점 조회 (본인 것인지 확인) + 행 잠금
      const reservationResult = await client.query(
        `SELECT id, items FROM stock_reservations
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [reservationId, userId]
      );

      if (reservationResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ message: STOCK_MESSAGES.RESERVATION_NOT_FOUND });
      }

      const reservation = reservationResult.rows[0];
      const items = reservation.items as ReservedItem[];

      // 재고 복구 (소프트 락 해제)
      for (const item of items) {
        if (item.variantId) {
          await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, item.variantId]
          );
        } else {
          await client.query(
            `UPDATE products
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, item.productId]
          );
        }
      }

      // 선점 기록 삭제
      await client.query(`DELETE FROM stock_reservations WHERE id = $1`, [
        reservationId,
      ]);

      await client.query("COMMIT");

      logger.info("재고 선점 해제 및 복구 완료", {
        userId,
        reservationId,
        itemCount: items.length,
      });

      res.json({
        message: STOCK_MESSAGES.RELEASED,
        released: true,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

/**
 * 재고 선점 조회
 * GET /api/stock/reserve/:reservationId
 *
 * 선점 상태를 확인합니다.
 */
router.get(
  "/reserve/:reservationId",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const { reservationId } = req.params;

    const [reservation] = await db
      .select()
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.id, reservationId),
          eq(stockReservations.userId, userId)
        )
      );

    if (!reservation) {
      return res
        .status(404)
        .json({ message: STOCK_MESSAGES.RESERVATION_NOT_FOUND });
    }

    // 만료 여부 확인
    const now = new Date();
    if (reservation.expiresAt < now) {
      // 만료된 선점 삭제 전 재고 복구 (중요!)
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const items = reservation.items as ReservedItem[];

        // 재고 복구
        for (const item of items) {
          if (item.variantId) {
            await client.query(
              `UPDATE product_variants
               SET stock_quantity = stock_quantity + $1, updated_at = NOW()
               WHERE id = $2`,
              [item.quantity, item.variantId]
            );
          } else {
            await client.query(
              `UPDATE products
               SET stock_quantity = stock_quantity + $1, updated_at = NOW()
               WHERE id = $2`,
              [item.quantity, item.productId]
            );
          }
        }

        // 선점 기록 삭제
        await client.query(`DELETE FROM stock_reservations WHERE id = $1`, [
          reservationId,
        ]);

        await client.query("COMMIT");

        logger.info("만료된 재고 선점 복구 및 삭제 완료", {
          userId,
          reservationId,
          itemCount: items.length,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      return res
        .status(410)
        .json({ message: STOCK_MESSAGES.RESERVATION_EXPIRED });
    }

    const ttlSeconds = Math.floor(
      (reservation.expiresAt.getTime() - now.getTime()) / 1000
    );

    res.json({
      reservationId: reservation.id,
      expiresAt: reservation.expiresAt,
      ttlSeconds,
      reservedItems: reservation.items,
    });
  })
);

/**
 * 만료된 선점 정리 (내부 사용)
 * 주기적으로 호출되어 만료된 선점을 삭제하고 재고를 복구합니다.
 */
export async function cleanupExpiredReservations(): Promise<number> {
  const client = await pool.connect();
  let cleanedCount = 0;

  try {
    await client.query("BEGIN");

    // 만료된 선점 조회
    const expiredResult = await client.query(
      `SELECT id, items FROM stock_reservations
       WHERE expires_at < NOW()
       FOR UPDATE`
    );

    if (expiredResult.rows.length === 0) {
      await client.query("COMMIT");
      return 0;
    }

    // 각 선점에 대해 재고 복구
    for (const reservation of expiredResult.rows) {
      const items = reservation.items as ReservedItem[];

      for (const item of items) {
        if (item.variantId) {
          await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, item.variantId]
          );
        } else {
          await client.query(
            `UPDATE products
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, item.productId]
          );
        }
      }

      cleanedCount++;
    }

    // 만료된 선점 삭제
    await client.query(
      `DELETE FROM stock_reservations WHERE expires_at < NOW()`
    );

    await client.query("COMMIT");

    if (cleanedCount > 0) {
      logger.info("만료된 재고 선점 정리 및 복구 완료", {
        count: cleanedCount,
      });
    }

    return cleanedCount;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("만료된 재고 선점 정리 실패", { error });
    throw error;
  } finally {
    client.release();
  }
}

// 만료된 선점 자동 정리 (서버 시작 시 시작됨)
let cleanupInterval: NodeJS.Timeout | null = null;

export function startReservationCleanup(): void {
  if (cleanupInterval) return;

  const { INTERVAL_MS, TTL_SECONDS } = STOCK_RESERVATION_CLEANUP_SCHEDULER;

  cleanupInterval = setInterval(async () => {
    try {
      await cleanupExpiredReservations();
    } catch (error) {
      logger.error("재고 선점 정리 실패", { error });
    }
  }, INTERVAL_MS);

  logger.info("재고 선점 자동 정리 시작", {
    intervalMs: INTERVAL_MS,
    ttlSeconds: TTL_SECONDS,
  });
}

export function stopReservationCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("재고 선점 자동 정리 중지");
  }
}

export default router;
