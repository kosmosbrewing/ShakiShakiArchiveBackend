// server/scripts/cleanup-now.ts
// 유령 주문 즉시 정리 (수동 실행)

import { cleanupNow } from "../utils/orderCleanup";
import { db } from "../db";
import { orders } from "@shared/schema";
import { eq, or } from "drizzle-orm";

async function main() {
  console.log("🚀 유령 주문 수동 정리 시작\n");

  // 0. DB timezone 확인
  const tzResult = await db.execute(
    `SELECT current_setting('TIMEZONE') as timezone, NOW() as current_time`
  );
  console.log("📍 PostgreSQL Timezone 설정:");
  console.log(`  Timezone: ${(tzResult.rows[0] as any).timezone}`);
  console.log(`  DB 현재 시간: ${(tzResult.rows[0] as any).current_time}\n`);

  // 1. 정리 전 상태 확인
  const beforeOrders = await db
    .select()
    .from(orders)
    .where(or(eq(orders.status, "pending_payment"), eq(orders.status, "paying")));

  console.log("📊 정리 전 상태:");
  console.log(`  pending_payment/paying 주문: ${beforeOrders.length}건\n`);

  if (beforeOrders.length > 0) {
    console.log("주문 목록:");
    beforeOrders.forEach((order) => {
      const orderTime = new Date(order.createdAt);
      const age = Math.floor(
        (Date.now() - orderTime.getTime()) / 1000 / 60
      );
      console.log(
        `  - ${order.id.substring(0, 8)}... | ${order.status}`
      );
      console.log(`    DB createdAt: ${order.createdAt}`);
      console.log(`    JS Date 변환: ${orderTime.toISOString()}`);
      console.log(`    경과 시간: ${age}분`);
    });
    console.log();
  }

  // 2. 정리 실행
  console.log("🧹 정리 실행 중...\n");
  await cleanupNow();

  // 3. 정리 후 상태 확인
  console.log("\n📊 정리 후 상태:");
  const afterOrders = await db
    .select()
    .from(orders)
    .where(or(eq(orders.status, "pending_payment"), eq(orders.status, "paying")));

  console.log(`  pending_payment/paying 주문: ${afterOrders.length}건\n`);

  const deleted = beforeOrders.length - afterOrders.length;
  console.log(`✅ 정리 완료: ${deleted}건 삭제됨\n`);

  if (afterOrders.length > 0) {
    console.log("⚠️  남아있는 주문:");
    afterOrders.forEach((order) => {
      const age = Math.floor(
        (Date.now() - new Date(order.createdAt).getTime()) / 1000 / 60
      );
      console.log(
        `  - ${order.id.substring(0, 8)}... | ${order.status} | ${age}분 전 생성`
      );
    });
    console.log("\n💡 5분 이내 생성된 주문은 삭제되지 않습니다.");
  }

  process.exit(0);
}

main();
