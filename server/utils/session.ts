// server/utils/session.ts
// 세션 재발급/저장 공용 헬퍼.
// 세션 고정(session fixation) 방어: 로그인 성공 시 반드시 기존 세션ID를 폐기하고
// 새 세션에 userId를 심는다. 패스워드 로그인과 소셜 로그인이 동일 패턴을 쓰도록 통일.

import type { Request } from "express";

export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

// 로그인 성공 공통 처리: 세션 재발급 → userId 주입 → 저장.
// 저장까지 await해야 redirect 후 프론트가 즉시 세션을 참조해도 유효하다.
export async function establishUserSession(
  req: Request,
  userId: string,
): Promise<void> {
  await regenerateSession(req);
  req.session.userId = userId;
  await saveSession(req);
}
