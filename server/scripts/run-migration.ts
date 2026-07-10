// server/scripts/run-migration.ts
// Drizzle 마이그레이션 안전 실행 스크립트

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

async function runMigration() {
  console.log("🚀 데이터베이스 마이그레이션 시작...");
  console.log("📂 마이그레이션 폴더: ./migrations");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 환경 변수가 설정되지 않았습니다.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DB_SSL !== "false"
        ? {
            rejectUnauthorized: false,
          }
        : false,
  });

  const db = drizzle(pool);

  try {
    // 마이그레이션 실행
    await migrate(db, { migrationsFolder: "./migrations" });

    console.log("✅ 마이그레이션 완료!");

    // 적용된 마이그레이션 확인
    const result = await pool.query(`
      SELECT * FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log("\n📋 최근 적용된 마이그레이션:");
    result.rows.forEach((row, i) => {
      console.log(
        `  ${i + 1}. ${row.hash} - ${new Date(row.created_at).toLocaleString()}`
      );
    });
  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error("❌ 마이그레이션 runner 종료:", error);
  process.exitCode = 1;
});
