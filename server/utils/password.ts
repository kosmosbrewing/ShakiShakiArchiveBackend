// server/utils/password.ts
// 비밀번호 해싱 유틸리티

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * 비밀번호 해싱
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

/**
 * 비밀번호 검증
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}
