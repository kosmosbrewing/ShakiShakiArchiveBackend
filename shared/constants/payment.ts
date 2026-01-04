// shared/constants/payment.ts
// 결제 관련 상수

import { ORDER_STATUS } from "./order";

/**
 * 결제 제공자
 */
export const PAYMENT_PROVIDER = {
  TOSS: "toss",
  NAVERPAY: "naverpay",
  KAKAOPAY: "kakaopay",
} as const;

export type PaymentProviderType =
  (typeof PAYMENT_PROVIDER)[keyof typeof PAYMENT_PROVIDER];

/**
 * 토스페이먼츠 결제 상태
 */
export const TOSS_PAYMENT_STATUS = {
  /** 결제 준비 */
  READY: "READY",
  /** 결제 진행 중 */
  IN_PROGRESS: "IN_PROGRESS",
  /** 입금 대기 (가상계좌) */
  WAITING_FOR_DEPOSIT: "WAITING_FOR_DEPOSIT",
  /** 결제 완료 */
  DONE: "DONE",
  /** 결제 취소 */
  CANCELED: "CANCELED",
  /** 부분 취소 */
  PARTIAL_CANCELED: "PARTIAL_CANCELED",
  /** 결제 중단 */
  ABORTED: "ABORTED",
  /** 결제 만료 */
  EXPIRED: "EXPIRED",
} as const;

export type TossPaymentStatusType =
  (typeof TOSS_PAYMENT_STATUS)[keyof typeof TOSS_PAYMENT_STATUS];

/**
 * 네이버페이 결제 상태
 */
export const NAVERPAY_PAYMENT_STATUS = {
  /** 결제 예약 완료 */
  READY: "READY",
  /** 결제 완료 (승인 대기) */
  PAYMENT_COMPLETE: "PAYMENT_COMPLETE",
  /** 결제 승인 완료 */
  APPROVED: "APPROVED",
  /** 결제 취소 */
  CANCELED: "CANCELED",
  /** 부분 취소 */
  PARTIAL_CANCELED: "PARTIAL_CANCELED",
  /** 결제 실패 */
  FAILED: "FAILED",
} as const;

export type NaverpayPaymentStatusType =
  (typeof NAVERPAY_PAYMENT_STATUS)[keyof typeof NAVERPAY_PAYMENT_STATUS];

/**
 * 네이버페이 API 설정
 */
export const NAVERPAY_CONFIG = {
  /** API 타임아웃 (밀리초) */
  API_TIMEOUT: 60000,
  /** 취소 요청자: 구매자 */
  CANCEL_REQUESTER_BUYER: "1" as const,
  /** 취소 요청자: 가맹점 관리자 */
  CANCEL_REQUESTER_ADMIN: "2" as const,
} as const;

/**
 * 네이버페이 상태 → 주문 상태 매핑
 */
export function mapNaverpayStatusToOrderStatus(
  status: NaverpayPaymentStatusType
): string {
  switch (status) {
    case NAVERPAY_PAYMENT_STATUS.APPROVED:
      return ORDER_STATUS.PAYMENT_CONFIRMED;
    case NAVERPAY_PAYMENT_STATUS.CANCELED:
      return ORDER_STATUS.CANCELLED;
    case NAVERPAY_PAYMENT_STATUS.PARTIAL_CANCELED:
      return ORDER_STATUS.PAYMENT_CONFIRMED; // 부분 취소는 결제 완료 상태 유지
    case NAVERPAY_PAYMENT_STATUS.FAILED:
      return ORDER_STATUS.PENDING_PAYMENT;
    default:
      return ORDER_STATUS.PENDING_PAYMENT;
  }
}

/**
 * 토스 결제 상태 → 주문 상태 매핑
 */
export function mapTossStatusToOrderStatus(
  status: TossPaymentStatusType
): string {
  switch (status) {
    case TOSS_PAYMENT_STATUS.DONE:
      return ORDER_STATUS.PAYMENT_CONFIRMED;
    case TOSS_PAYMENT_STATUS.CANCELED:
      return ORDER_STATUS.CANCELLED;
    case TOSS_PAYMENT_STATUS.PARTIAL_CANCELED:
      return ORDER_STATUS.PAYMENT_CONFIRMED;
    default:
      return ORDER_STATUS.PENDING_PAYMENT;
  }
}
