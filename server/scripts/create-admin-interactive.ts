import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createLogger } from "../utils/logger";
import * as readline from "readline";

const logger = createLogger("CreateAdmin");

/**
 * 관리자 계정 생성 스크립트 (대화형)
 *
 * 사용법:
 * npx tsx server/scripts/create-admin-interactive.ts
 */

// readline 인터페이스 생성
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 질문 함수 (Promise 래핑)
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

// 비밀번호 입력 (숨김 처리는 안되지만 경고 표시)
function questionPassword(query: string): Promise<string> {
  return new Promise((resolve) => {
    // 비밀번호 입력 시 표시되지 않도록 하는 것은 복잡하므로 경고만 표시
    console.log("⚠️  주의: 비밀번호가 화면에 표시됩니다. 주변을 확인하세요.");
    rl.question(query, resolve);
  });
}

// 이메일 검증
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// 비밀번호 강도 검증
function isValidPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: "비밀번호는 최소 8자 이상이어야 합니다." };
  }
  if (!/[A-Za-z]/.test(password)) {
    return { valid: false, message: "비밀번호에 영문자가 포함되어야 합니다." };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "비밀번호에 숫자가 포함되어야 합니다." };
  }
  return { valid: true };
}

async function createAdmin() {
  try {
    console.log("\n=== 관리자 계정 생성 ===\n");

    // 1. 이메일 입력
    let email = "";
    while (true) {
      email = await question("이메일: ");
      if (!email.trim()) {
        console.log("❌ 이메일을 입력해주세요.\n");
        continue;
      }
      if (!isValidEmail(email)) {
        console.log("❌ 올바른 이메일 형식이 아닙니다.\n");
        continue;
      }
      break;
    }

    // 2. 사용자 이름 입력
    let userName = "";
    while (true) {
      userName = await question("이름: ");
      if (!userName.trim()) {
        console.log("❌ 이름을 입력해주세요.\n");
        continue;
      }
      break;
    }

    // 3. 비밀번호 입력 및 확인
    let password = "";
    while (true) {
      password = await questionPassword("비밀번호 (최소 8자, 영문+숫자): ");
      if (!password.trim()) {
        console.log("❌ 비밀번호를 입력해주세요.\n");
        continue;
      }

      const validation = isValidPassword(password);
      if (!validation.valid) {
        console.log(`❌ ${validation.message}\n`);
        continue;
      }

      const passwordConfirm = await questionPassword("비밀번호 확인: ");
      if (password !== passwordConfirm) {
        console.log("❌ 비밀번호가 일치하지 않습니다.\n");
        continue;
      }

      break;
    }

    console.log("\n입력 정보 확인:");
    console.log(`  이메일: ${email}`);
    console.log(`  이름: ${userName}`);
    console.log(`  관리자 권한: 예\n`);

    const confirm = await question("계정을 생성하시겠습니까? (y/n): ");
    if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
      console.log("❌ 취소되었습니다.");
      rl.close();
      process.exit(0);
    }

    logger.info("관리자 계정 생성 중...");

    // 4. 기존 사용자 확인
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      // 기존 사용자를 관리자로 업그레이드
      const hashedPassword = await bcrypt.hash(password, 10);

      await db
        .update(users)
        .set({
          isAdmin: true,
          passwordHash: hashedPassword,
          userName,
        })
        .where(eq(users.email, email));

      logger.info("✅ 기존 사용자를 관리자로 업그레이드", { email, userName });
      console.log("\n✅ 기존 사용자를 관리자로 업그레이드했습니다.");
    } else {
      // 새 관리자 계정 생성
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

      logger.info("✅ 관리자 계정 생성 완료", { email, userName });
      console.log("\n✅ 관리자 계정이 생성되었습니다.");
    }

    console.log("\n📌 로그인 정보:");
    console.log(`   이메일: ${email}`);
    console.log(`   비밀번호: (입력한 비밀번호)\n`);
    console.log("⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하는 것을 권장합니다.\n");

    rl.close();
    process.exit(0);
  } catch (error) {
    logger.error("❌ 관리자 계정 생성 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error("\n❌ 오류 발생:", error instanceof Error ? error.message : String(error));
    rl.close();
    process.exit(1);
  }
}

createAdmin();
