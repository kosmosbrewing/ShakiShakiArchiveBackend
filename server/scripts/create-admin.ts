import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createLogger } from "../utils/logger";

const logger = createLogger("CreateAdmin");

/**
 * 관리자 계정 생성 스크립트 (레거시)
 *
 * DEPRECATED: 이 스크립트는 더 이상 사용되지 않습니다.
 * 신규 관리자 생성은 `npm run admin:create` (create-admin-interactive.ts) 를 사용하세요.
 *
 * 보안 강화: 하드코딩된 비밀번호 제거, 환경변수 기반으로 전환.
 *
 * 사용법:
 * ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... npx tsx server/scripts/create-admin.ts
 */

async function createAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const userName = process.env.ADMIN_NAME;

    if (!email || !password || !userName) {
      logger.error(
        "필수 환경 변수 누락: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME",
      );
      logger.warn(
        "권장: 인터랙티브 스크립트 사용 → npm run admin:create",
      );
      process.exit(1);
    }

    if (password.length < 12) {
      logger.error("ADMIN_PASSWORD는 최소 12자 이상이어야 합니다");
      process.exit(1);
    }

    logger.info("관리자 계정 생성 중...");

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      await db
        .update(users)
        .set({ isAdmin: true })
        .where(eq(users.email, email));

      logger.info("기존 사용자를 관리자로 업그레이드", { email });
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      await db
        .insert(users)
        .values({
          email,
          passwordHash: hashedPassword,
          userName,
          isAdmin: true,
        })
        .returning();

      logger.info("관리자 계정 생성 완료", { email, userName });
      logger.warn("보안을 위해 첫 로그인 후 비밀번호를 변경하세요!");
    }

    process.exit(0);
  } catch (error) {
    logger.error("관리자 계정 생성 실패", { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
}

createAdmin();
