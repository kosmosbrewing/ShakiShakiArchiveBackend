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
 * 카카오페이 결제 상태
 * 참고: https://developers.kakao.com/docs/latest/ko/kakaopay/single-payment
 */
export const KAKAOPAY_PAYMENT_STATUS = {
  /** 결제 요청 */
  READY: "READY",
  /** 결제 요청 TMS 발송 완료 */
  SEND_TMS: "SEND_TMS",
  /** 사용자 결제 화면 진입 */
  OPEN_PAYMENT: "OPEN_PAYMENT",
  /** 결제 수단 선택 */
  SELECT_METHOD: "SELECT_METHOD",
  /** ARS 인증 대기 */
  ARS_WAITING: "ARS_WAITING",
  /** 비밀번호 인증 대기 */
  AUTH_PASSWORD: "AUTH_PASSWORD",
  /** SID 발급 완료 (정기결제) */
  ISSUED_SID: "ISSUED_SID",
  /** 결제 완료 */
  SUCCESS_PAYMENT: "SUCCESS_PAYMENT",
  /** 부분 취소 */
  PART_CANCEL_PAYMENT: "PART_CANCEL_PAYMENT",
  /** 결제 취소 */
  CANCEL_PAYMENT: "CANCEL_PAYMENT",
  /** 비밀번호 인증 실패 */
  FAIL_AUTH_PASSWORD: "FAIL_AUTH_PASSWORD",
  /** 사용자 결제 중단 */
  QUIT_PAYMENT: "QUIT_PAYMENT",
  /** 결제 실패 */
  FAIL_PAYMENT: "FAIL_PAYMENT",
} as const;

export type KakaopayPaymentStatusType =
  (typeof KAKAOPAY_PAYMENT_STATUS)[keyof typeof KAKAOPAY_PAYMENT_STATUS];

/**
 * 카카오페이 API 설정
 */
export const KAKAOPAY_CONFIG = {
  /** API 타임아웃 (밀리초) */
  API_TIMEOUT: 60000,
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

/**
 * 카카오페이 상태 → 주문 상태 매핑
 */
export function mapKakaopayStatusToOrderStatus(
  status: KakaopayPaymentStatusType
): string {
  switch (status) {
    case KAKAOPAY_PAYMENT_STATUS.SUCCESS_PAYMENT:
      return ORDER_STATUS.PAYMENT_CONFIRMED;
    case KAKAOPAY_PAYMENT_STATUS.CANCEL_PAYMENT:
      return ORDER_STATUS.CANCELLED;
    case KAKAOPAY_PAYMENT_STATUS.PART_CANCEL_PAYMENT:
      return ORDER_STATUS.PAYMENT_CONFIRMED; // 부분 취소는 결제 완료 상태 유지
    case KAKAOPAY_PAYMENT_STATUS.FAIL_PAYMENT:
    case KAKAOPAY_PAYMENT_STATUS.FAIL_AUTH_PASSWORD:
    case KAKAOPAY_PAYMENT_STATUS.QUIT_PAYMENT:
      return ORDER_STATUS.PENDING_PAYMENT;
    default:
      return ORDER_STATUS.PENDING_PAYMENT;
  }
}
