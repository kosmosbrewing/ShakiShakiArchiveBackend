// server/utils/date.ts
// 날짜/시간 관련 유틸리티 함수

/**
 * 현재 KST(한국 표준시) 시간을 반환
 * UTC + 9시간
 */
export function getKSTDate(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000; // 9시간을 밀리초로 변환
  return new Date(now.getTime() + kstOffset);
}

/**
 * UTC Date를 KST Date로 변환
 */
export function toKST(date: Date): Date {
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(date.getTime() + kstOffset);
}
