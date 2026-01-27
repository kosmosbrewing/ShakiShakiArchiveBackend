// server/utils/date.ts
// 날짜/시간 관련 유틸리티 함수

/**
 * @deprecated DB 세션이 KST로 설정되어 있으므로 sql`NOW()` 사용 권장
 * 이 함수는 서버 timezone에 따라 다르게 동작할 수 있어 일관성 문제가 있음
 *
 * 대신 사용:
 * - Drizzle ORM: sql`NOW()`
 * - Raw SQL: NOW()
 */
export function getKSTDate(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000; // 9시간을 밀리초로 변환
  return new Date(now.getTime() + kstOffset);
}

/**
 * @deprecated 위와 동일한 이유로 사용 비권장
 * UTC Date를 KST Date로 변환
 */
export function toKST(date: Date): Date {
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(date.getTime() + kstOffset);
}
