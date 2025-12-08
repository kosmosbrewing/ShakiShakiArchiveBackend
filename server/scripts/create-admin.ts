import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

/**
 * 관리자 계정 생성 스크립트
 *
 * 사용법:
 * npx tsx server/scripts/create-admin.ts
 */

async function createAdmin() {
  try {
    // 여기에서 이메일과 비밀번호를 변경하세요
    const email = "admin@shophub.com";
    const password = "admin123!";
    const userName = "이규빈";

    console.log("관리자 계정 생성 중...");

    // 이미 존재하는지 확인
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      // 기존 사용자를 관리자로 업그레이드
      await db
        .update(users)
        .set({ isAdmin: true })
        .where(eq(users.email, email));

      console.log(`✅ 기존 사용자 ${email}를 관리자로 업그레이드했습니다.`);
    } else {
      // 새 관리자 계정 생성
      const hashedPassword = await bcrypt.hash(password, 10);

      const [newUser] = await db
        .insert(users)
        .values({
          email,
          passwordHash: hashedPassword,
          userName,
          isAdmin: true,
        })
        .returning();

      console.log(`✅ 관리자 계정이 생성되었습니다!`);
      console.log(`이메일: ${email}`);
      console.log(`비밀번호: ${password}`);
      console.log(`\n⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하세요!`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ 관리자 계정 생성 실패:", error);
    process.exit(1);
  }
}

createAdmin();
