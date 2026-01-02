// server/services/toss.service.ts
// 토스페이먼츠 API 클라이언트

import { config } from "../config";
import { httpRequest } from "../utils/http-client";

// 토스페이먼츠 결제 상태
export type TossPaymentStatus =
  | "READY" // 결제 준비
  | "IN_PROGRESS" // 결제 진행 중
  | "WAITING_FOR_DEPOSIT" // 입금 대기 (가상계좌)
  | "DONE" // 결제 완료
  | "CANCELED" // 결제 취소
  | "PARTIAL_CANCELED" // 부분 취소
  | "ABORTED" // 결제 중단
  | "EXPIRED"; // 결제 만료

// 토스페이먼츠 결제 취소 정보
export interface TossPaymentCancel {
  cancelAmount: number;
  cancelReason: string;
  taxFreeAmount: number;
  refundableAmount: number;
  canceledAt: string;
  transactionKey: string;
}

// 토스페이먼츠 결제 응답
export interface TossPayment {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: TossPaymentStatus;
  requestedAt: string;
  approvedAt?: string;
  totalAmount: number;
  balanceAmount: number;
  method: string;
  card?: {
    issuerCode: string;
    acquirerCode: string;
    number: string;
    installmentPlanMonths: number;
    approveNo: string;
    cardType: string;
    ownerType: string;
  };
  virtualAccount?: {
    accountType: string;
    accountNumber: string;
    bankCode: string;
    customerName: string;
    dueDate: string;
    refundStatus: string;
  };
  cancels?: TossPaymentCancel[];
}

// 토스페이먼츠 에러 응답
export interface TossError {
  code: string;
  message: string;
}

/**
 * 토스페이먼츠 결제 에러 클래스
 */
export class TossPaymentError extends Error {
  constructor(
    public code: string,
    public override message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "TossPaymentError";
  }
}

/**
 * API 호출을 위한 인증 헤더 생성
 * 시크릿 키 + ":" 를 Base64 인코딩
 */
function getAuthHeader(): string {
  const credentials = `${config.toss.secretKey}:`;
  const encoded = Buffer.from(credentials).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * 결제 승인 API 호출
 * 클라이언트에서 받은 paymentKey, orderId, amount로 결제 승인
 */
export async function confirmPayment(
  paymentKey: string,
  orderId: string,
  amount: number
): Promise<TossPayment> {
  const url = `${config.toss.apiBaseUrl}/payments/confirm`;

  const response = await httpRequest<TossPayment | TossError>(url, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  if (response.status >= 400) {
    const error = response.data as TossError;
    throw new TossPaymentError(error.code, error.message, response.status);
  }

  return response.data as TossPayment;
}

/**
 * 결제 조회 API 호출
 * paymentKey로 결제 정보 조회
 */
export async function getPayment(paymentKey: string): Promise<TossPayment> {
  const url = `${config.toss.apiBaseUrl}/payments/${encodeURIComponent(paymentKey)}`;

  const response = await httpRequest<TossPayment | TossError>(url, {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  if (response.status >= 400) {
    const error = response.data as TossError;
    throw new TossPaymentError(error.code, error.message, response.status);
  }

  return response.data as TossPayment;
}

/**
 * 결제 취소 API 호출
 * 전체 취소 또는 부분 취소
 */
export async function cancelPayment(
  paymentKey: string,
  cancelReason: string,
  cancelAmount?: number,
  refundReceiveAccount?: {
    bank: string;
    accountNumber: string;
    holderName: string;
  }
): Promise<TossPayment> {
  const body: Record<string, unknown> = { cancelReason };

  if (cancelAmount !== undefined) {
    body.cancelAmount = cancelAmount;
  }

  if (refundReceiveAccount) {
    body.refundReceiveAccount = refundReceiveAccount;
  }

  const url = `${config.toss.apiBaseUrl}/payments/${encodeURIComponent(paymentKey)}/cancel`;

  const response = await httpRequest<TossPayment | TossError>(url, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status >= 400) {
    const error = response.data as TossError;
    throw new TossPaymentError(error.code, error.message, response.status);
  }

  return response.data as TossPayment;
}
