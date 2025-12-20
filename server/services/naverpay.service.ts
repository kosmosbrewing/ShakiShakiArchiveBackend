// server/services/naverpay.service.ts
// 네이버페이 결제형 API 클라이언트

import { config } from "../config";
import crypto from "crypto";

// 네이버페이 API 기본 URL (환경에 따라 동적 결정)
function getApiBaseUrl(): string {
  return config.naverpay.mode === "prod"
    ? "https://apis.naver.com"
    : "https://dev.apis.naver.com";
}

// 네이버페이 결제 상태
export type NaverPayPaymentStatus =
  | "READY" // 결제 예약 완료
  | "PAYMENT_COMPLETE" // 결제 완료 (승인 대기)
  | "APPROVED" // 결제 승인 완료
  | "CANCELED" // 결제 취소
  | "PARTIAL_CANCELED" // 부분 취소
  | "FAILED"; // 결제 실패

// 결제 예약 요청
export interface NaverPayReserveRequest {
  merchantPayKey: string; // 가맹점 주문번호 (externalOrderId)
  productName: string; // 상품명
  productCount: number; // 상품 수량
  totalPayAmount: number; // 총 결제 금액
  taxScopeAmount: number; // 과세 대상 금액
  taxExScopeAmount: number; // 면세 대상 금액
  returnUrl: string; // 결제 완료 후 리다이렉트 URL
  purchaserName?: string; // 구매자 이름
  purchaserBirthday?: string; // 구매자 생년월일 (YYYYMMDD)
}

// 결제 예약 응답
export interface NaverPayReserveResponse {
  code: string;
  message: string;
  body?: {
    reserveId: string; // 결제 예약 ID
    paymentUrl: string; // 네이버페이 결제 페이지 URL
  };
}

// 결제 승인 응답
export interface NaverPayApplyResponse {
  code: string;
  message: string;
  body?: {
    paymentId: string; // 네이버페이 결제 ID
    payHistId: string; // 결제 이력 ID
    merchantPayKey: string; // 가맹점 주문번호
    merchantUserKey: string; // 가맹점 사용자 ID
    admissionTypeCode: string; // 결제 수단 (CARD, BANK 등)
    totalPayAmount: number; // 총 결제 금액
    primaryPayAmount: number; // 주 결제 수단 결제 금액
    npointPayAmount: number; // N포인트 결제 금액
    giftCardPayAmount: number; // 기프트카드 결제 금액
    taxScopeAmount: number;
    taxExScopeAmount: number;
    payCommissionAmount: number;
    applyDate: string; // 승인 일시 (yyyyMMddHHmmss)
    cardCorpCode?: string; // 카드사 코드
    cardNo?: string; // 카드번호 마스킹
    cardAuthNo?: string; // 카드 승인번호
    cardInstCount?: number; // 할부 개월 수
    usedCardPoint: boolean;
  };
}

// 결제 조회 응답
export interface NaverPayPaymentResponse {
  code: string;
  message: string;
  body?: {
    paymentId: string;
    payHistId: string;
    merchantPayKey: string;
    admissionTypeCode: string;
    primaryPayAmount: number;
    npointPayAmount: number;
    giftCardPayAmount: number;
    totalPayAmount: number;
    paymentStatus: NaverPayPaymentStatus;
    payTime: string;
    applyTime?: string;
    cancelTime?: string;
    cancelAmount?: number;
    remainAmount?: number;
  };
}

// 결제 취소 응답
export interface NaverPayCancelResponse {
  code: string;
  message: string;
  body?: {
    paymentId: string;
    payHistId: string;
    cancelAmount: number;
    remainAmount: number;
    cancelTime: string;
  };
}

// 네이버페이 에러 응답
export interface NaverPayError {
  code: string;
  message: string;
}

/**
 * 네이버페이 결제 에러 클래스
 */
export class NaverPayPaymentError extends Error {
  constructor(
    public code: string,
    public override message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "NaverPayPaymentError";
  }
}

/**
 * Idempotency Key 생성 (멱등성 보장용)
 */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * API 호출을 위한 공통 헤더 생성
 */
function getHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Naver-Client-Id": config.naverpay.clientId,
    "X-Naver-Client-Secret": config.naverpay.clientSecret,
    "X-NaverPay-Chain-Id": config.naverpay.chainId,
  };

  if (idempotencyKey) {
    headers["X-NaverPay-Idempotency-Key"] = idempotencyKey;
  }

  return headers;
}

/**
 * 결제 예약 API
 * 사용자를 네이버페이 결제 페이지로 보내기 전에 호출
 */
export async function reservePayment(
  request: NaverPayReserveRequest
): Promise<NaverPayReserveResponse> {
  const idempotencyKey = generateIdempotencyKey();

  const response = await fetch(
    `${getApiBaseUrl()}/naverpay-partner/naverpay/payments/v2.2/reserve`,
    {
      method: "POST",
      headers: getHeaders(idempotencyKey),
      body: JSON.stringify({
        ...request,
        merchantId: config.naverpay.merchantId,
      }),
    }
  );

  const data = (await response.json()) as NaverPayReserveResponse;

  if (data.code !== "Success") {
    throw new NaverPayPaymentError(
      data.code,
      data.message,
      response.ok ? 400 : response.status
    );
  }

  return data;
}

/**
 * 결제 승인 API
 * 사용자가 네이버페이 결제 완료 후 returnUrl로 돌아왔을 때 호출
 */
export async function applyPayment(
  paymentId: string
): Promise<NaverPayApplyResponse> {
  const idempotencyKey = generateIdempotencyKey();

  const response = await fetch(
    `${getApiBaseUrl()}/naverpay-partner/naverpay/payments/v2.2/apply`,
    {
      method: "POST",
      headers: getHeaders(idempotencyKey),
      body: JSON.stringify({
        paymentId,
      }),
    }
  );

  const data = (await response.json()) as NaverPayApplyResponse;

  if (data.code !== "Success") {
    throw new NaverPayPaymentError(
      data.code,
      data.message,
      response.ok ? 400 : response.status
    );
  }

  return data;
}

/**
 * 결제 조회 API
 */
export async function getPayment(
  paymentId: string
): Promise<NaverPayPaymentResponse> {
  const response = await fetch(
    `${getApiBaseUrl()}/naverpay-partner/naverpay/payments/v1/payment/${paymentId}`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  const data = (await response.json()) as NaverPayPaymentResponse;

  if (data.code !== "Success") {
    throw new NaverPayPaymentError(
      data.code,
      data.message,
      response.ok ? 400 : response.status
    );
  }

  return data;
}

/**
 * 결제 취소 API
 */
export async function cancelPayment(
  paymentId: string,
  cancelAmount: number,
  cancelReason: string,
  cancelRequester: "1" | "2" = "1" // 1: 구매자, 2: 가맹점 관리자
): Promise<NaverPayCancelResponse> {
  const idempotencyKey = generateIdempotencyKey();

  const response = await fetch(
    `${getApiBaseUrl()}/naverpay-partner/naverpay/payments/v1/cancel`,
    {
      method: "POST",
      headers: getHeaders(idempotencyKey),
      body: JSON.stringify({
        paymentId,
        cancelAmount,
        cancelReason,
        cancelRequester,
        taxScopeAmount: cancelAmount, // 과세 금액 (전액 과세로 가정)
        taxExScopeAmount: 0, // 면세 금액
      }),
    }
  );

  const data = (await response.json()) as NaverPayCancelResponse;

  if (data.code !== "Success") {
    throw new NaverPayPaymentError(
      data.code,
      data.message,
      response.ok ? 400 : response.status
    );
  }

  return data;
}

/**
 * 결제 상태를 주문 상태로 매핑
 */
export function mapNaverPayStatusToOrderStatus(
  status: NaverPayPaymentStatus
): string {
  switch (status) {
    case "APPROVED":
      return "payment_confirmed";
    case "CANCELED":
      return "cancelled";
    case "PARTIAL_CANCELED":
      return "payment_confirmed"; // 부분 취소는 결제 완료 상태 유지
    case "FAILED":
      return "pending_payment";
    default:
      return "pending_payment";
  }
}
