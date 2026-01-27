// shared/constants/scheduler.ts
// 스케줄러 관련 상수

/**
 * 자동 구매확정 스케줄러 설정
 */
export const AUTO_CONFIRM_SCHEDULER = {
  /** Cron 표현식 (KST 기준): 매일 새벽 3시 */
  CRON_EXPRESSION: "0 3 * * *",
  /** 스케줄 설명 */
  DESCRIPTION: "매일 KST 03:00",
  /** 배송 완료 후 자동 구매확정까지 대기 일수 */
  DAYS_AFTER_DELIVERY: 7,
  /** 대기 시간 (시간 단위) */
  HOURS_AFTER_DELIVERY: 168, // 7일 * 24시간
} as const;

/**
 * 주문 정리 스케줄러 설정 (유령 주문 삭제)
 * 브라우저 강제 종료 대응 - 빠른 재고 복구
 */
export const ORDER_CLEANUP_SCHEDULER = {
  /** 실행 주기 (밀리초): 1분 */
  INTERVAL_MS: 1 * 60 * 1000,
  /** pending_payment/paying 상태 유지 최대 시간 (밀리초): 5분 */
  MAX_PENDING_AGE_MS: 5 * 60 * 1000,
} as const;

/**
 * 재고 선점 정리 스케줄러 설정
 */
export const STOCK_RESERVATION_CLEANUP_SCHEDULER = {
  /** 실행 주기 (밀리초): 1분 */
  INTERVAL_MS: 1 * 60 * 1000,
  /** 선점 만료 시간 (초): 3분 (TTL) */
  TTL_SECONDS: 3 * 60,
} as const;

/**
 * 스케줄러 타임존
 */
export const SCHEDULER_TIMEZONE = {
  /** 한국 표준시 */
  KST: "Asia/Seoul",
  /** UTC */
  UTC: "UTC",
} as const;
