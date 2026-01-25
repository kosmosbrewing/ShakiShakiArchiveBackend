// server/services/kakaopay.service.ts
// 카카오페이 단건결제 API 클라이언트
// 참고: https://developers.kakao.com/docs/latest/ko/kakaopay/single-payment

import { config } from "../config";
import { postJson } from "../utils/http-client";
import {
  KAKAOPAY_CONFIG,
  KAKAOPAY_PAYMENT_STATUS,
  ORDER_STATUS,
} from "../constants";

// 카카오페이 API 기본 URL
const API_BASE_URL = "https://open-api.kakaopay.com";

// ============================================================
// 결제 상태 타입
// ============================================================

export type KakaoPayPaymentStatus =
  | "READY" // 결제 요청
  | "SEND_TMS" // 결제 요청 TMS 발송 완료
  | "OPEN_PAYMENT" // 사용자 결제 화면 진입
  | "SELECT_METHOD" // 결제 수단 선택
  | "ARS_WAITING" // ARS 인증 대기
  | "AUTH_PASSWORD" // 비밀번호 인증 대기
  | "ISSUED_SID" // SID 발급 완료 (정기결제)
  | "SUCCESS_PAYMENT" // 결제 완료
  | "PART_CANCEL_PAYMENT" // 부분 취소
  | "CANCEL_PAYMENT" // 결제 취소
  | "FAIL_AUTH_PASSWORD" // 비밀번호 인증 실패
  | "QUIT_PAYMENT" // 사용자 결제 중단
  | "FAIL_PAYMENT"; // 결제 실패

// ============================================================
// 결제 준비 API 타입
// ============================================================

// 결제 준비 요청 파라미터
export interface KakaoPayReadyParams {
  partner_order_id: string; // 가맹점 주문번호 (필수, 최대 100자)
  partner_user_id: string; // 가맹점 회원 ID (필수, 최대 100자)
  item_name: string; // 상품명 (필수, 최대 100자)
  quantity: number; // 상품 수량 (필수)
  total_amount: number; // 총 결제 금액 (필수)
  tax_free_amount: number; // 상품 비과세 금액 (필수)
  vat_amount?: number; // 상품 부가세 금액 (기본값: total_amount - tax_free_amount의 10%)
  approval_url: string; // 결제 성공 시 리다이렉트 URL (필수)
  cancel_url: string; // 결제 취소 시 리다이렉트 URL (필수)
  fail_url: string; // 결제 실패 시 리다이렉트 URL (필수)
}

// 결제 준비 응답
export interface KakaoPayReadyResponse {
  tid: string; // 결제 고유 번호 (20자)
  tms_result: boolean; // TMS 전송 결과 (true: 성공, false: 실패)
  next_redirect_app_url: string; // 모바일 앱 결제 URL
  next_redirect_mobile_url: string; // 모바일 웹 결제 URL
  next_redirect_pc_url: string; // PC 웹 결제 URL
  android_app_scheme: string; // 안드로이드 앱 스킴
  ios_app_scheme: string; // iOS 앱 스킴
  created_at: string; // 결제 준비 요청 시각 (yyyy-MM-dd'T'HH:mm:ss)
}

// ============================================================
// 결제 승인 API 타입
// ============================================================

// 결제 승인 요청 파라미터
export interface KakaoPayApproveParams {
  tid: string; // 결제 고유 번호 (필수)
  partner_order_id: string; // 가맹점 주문번호 (필수)
  partner_user_id: string; // 가맹점 회원 ID (필수)
  pg_token: string; // 결제 승인 요청 인증 토큰 (필수)
}

// 결제 승인 응답
export interface KakaoPayApproveResponse {
  aid: string; // 요청 고유 번호
  tid: string; // 결제 고유 번호
  cid: string; // 가맹점 코드
  partner_order_id: string; // 가맹점 주문번호
  partner_user_id: string; // 가맹점 회원 ID
  payment_method_type: "CARD" | "MONEY"; // 결제 수단 (CARD, MONEY)
  item_name: string; // 상품명
  item_code?: string; // 상품 코드
  quantity: number; // 상품 수량
  amount: KakaoPayAmount; // 결제 금액 정보
  card_info?: KakaoPayCardInfo; // 카드 결제 정보 (카드 결제 시)
  created_at: string; // 결제 준비 요청 시각
  approved_at: string; // 결제 승인 시각
}

// 결제 금액 정보
export interface KakaoPayAmount {
  total: number; // 총 결제 금액
  tax_free: number; // 비과세 금액
  vat: number; // 부가세 금액
  point: number; // 포인트 결제 금액
  discount: number; // 할인 금액
  green_deposit: number; // 컵 보증금
}

// 카드 결제 정보
export interface KakaoPayCardInfo {
  kakaopay_purchase_corp: string; // 카카오페이 매입사명
  kakaopay_purchase_corp_code: string; // 카카오페이 매입사 코드
  kakaopay_issuer_corp: string; // 카카오페이 발급사명
  kakaopay_issuer_corp_code: string; // 카카오페이 발급사 코드
  bin: string; // 카드 BIN 번호
  card_type: string; // 카드 타입
  install_month: string; // 할부 개월 수
  approved_id: string; // 카드사 승인 번호
  card_mid: string; // 가맹점 번호
  interest_free_install: string; // 무이자 할부 여부 (Y/N)
  installment_type: string; // 할부 유형 (CARD_INSTALLMENT: 업종 무이자)
  card_item_code?: string; // 카드 상품 코드
}

// ============================================================
// 결제 취소 API 타입
// ============================================================

// 결제 취소 요청 파라미터
export interface KakaoPayCancelParams {
  tid: string; // 결제 고유 번호 (필수)
  cancel_amount: number; // 취소 금액 (필수)
  cancel_tax_free_amount: number; // 취소 비과세 금액 (필수)
  cancel_vat_amount?: number; // 취소 부가세 금액
}

// 결제 취소 응답
export interface KakaoPayCancelResponse {
  aid: string; // 요청 고유 번호
  tid: string; // 결제 고유 번호
  cid: string; // 가맹점 코드
  status: KakaoPayPaymentStatus; // 결제 상태
  partner_order_id: string; // 가맹점 주문번호
  partner_user_id: string; // 가맹점 회원 ID
  payment_method_type: "CARD" | "MONEY"; // 결제 수단
  item_name: string; // 상품명
  quantity: number; // 상품 수량
  amount: KakaoPayAmount; // 결제 금액 정보
  approved_cancel_amount: KakaoPayCancelAmount; // 이번 요청 취소 금액
  canceled_amount: KakaoPayCancelAmount; // 누적 취소 금액
  cancel_available_amount: KakaoPayCancelAmount; // 취소 가능 금액
  created_at: string; // 결제 준비 요청 시각
  approved_at: string; // 결제 승인 시각
  canceled_at: string; // 결제 취소 시각
}

// 취소 금액 정보
export interface KakaoPayCancelAmount {
  total: number; // 총 금액
  tax_free: number; // 비과세 금액
  vat: number; // 부가세 금액
  point: number; // 포인트 금액
  discount: number; // 할인 금액
  green_deposit: number; // 컵 보증금
}

// ============================================================
// 결제 조회 API 타입
// ============================================================

// 결제 조회 응답
export interface KakaoPayOrderResponse {
  tid: string; // 결제 고유 번호
  cid: string; // 가맹점 코드
  status: KakaoPayPaymentStatus; // 결제 상태
  partner_order_id: string; // 가맹점 주문번호
  partner_user_id: string; // 가맹점 회원 ID
  payment_method_type?: "CARD" | "MONEY"; // 결제 수단
  item_name: string; // 상품명
  quantity: number; // 상품 수량
  amount?: KakaoPayAmount; // 결제 금액 정보
  canceled_amount?: KakaoPayCancelAmount; // 취소된 금액
  cancel_available_amount?: KakaoPayCancelAmount; // 취소 가능 금액
  created_at: string; // 결제 준비 요청 시각
  approved_at?: string; // 결제 승인 시각
  canceled_at?: string; // 결제 취소 시각
}

// ============================================================
// 에러 타입
// ============================================================

// 카카오페이 에러 응답
export interface KakaoPayErrorResponse {
  error_code?: number; // 에러 코드
  error_message?: string; // 에러 메시지
  extras?: {
    method_result_code?: string;
    method_result_message?: string;
  };
}

// 카카오페이 에러 클래스
export class KakaoPayPaymentError extends Error {
  constructor(
    public code: string,
    public override message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "KakaoPayPaymentError";
  }
}

// ============================================================
// 유틸리티 함수
// ============================================================

/**
 * API 호출을 위한 공통 헤더 생성
 *
 * 카카오페이 신 API (open-api.kakaopay.com) 인증 형식:
 * - Authorization: SECRET_KEY {시크릿키}
 * - Content-Type: application/json
 *
 * 참고: 신 API에서는 DEV 접두사가 불필요합니다.
 */
function getHeaders(): Record<string, string> {
  // 환경 변수 설정 확인
  if (!config.kakaopay.secretKey) {
    console.error("[KakaoPay] 환경 변수 누락 감지!", {
      secretKey: config.kakaopay.secretKey ? "SET" : "MISSING",
      cid: config.kakaopay.cid,
    });
  }

  return {
    Authorization: `SECRET_KEY ${config.kakaopay.secretKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * 에러 응답 처리
 */
function handleErrorResponse(
  response: { data: unknown; status: number },
  defaultMessage: string
): never {
  const errorData = response.data as KakaoPayErrorResponse;
  const errorCode = errorData.error_code?.toString() || "UNKNOWN";
  const errorMessage = errorData.error_message || defaultMessage;

  console.error("[KakaoPay] API 에러:", {
    code: errorCode,
    message: errorMessage,
    extras: errorData.extras,
    status: response.status,
  });

  throw new KakaoPayPaymentError(
    errorCode,
    errorMessage,
    response.status >= 400 ? response.status : 400
  );
}

// ============================================================
// API 함수
// ============================================================

/**
 * 결제 준비 API
 * 결제 준비 요청을 보내고 tid와 redirect URL을 받음
 *
 * @param params - 결제 준비 파라미터
 * @returns 결제 준비 응답 (tid, redirect URLs)
 */
export async function readyPayment(
  params: KakaoPayReadyParams
): Promise<KakaoPayReadyResponse> {
  const url = `${API_BASE_URL}/online/v1/payment/ready`;

  console.log("[KakaoPay] 결제 준비 API 호출:", {
    url,
    mode: config.kakaopay.mode,
    cid: config.kakaopay.cid,
    partner_order_id: params.partner_order_id,
    total_amount: params.total_amount,
  });

  const response = await postJson<KakaoPayReadyResponse | KakaoPayErrorResponse>(
    url,
    {
      cid: config.kakaopay.cid,
      partner_order_id: params.partner_order_id,
      partner_user_id: params.partner_user_id,
      item_name: params.item_name,
      quantity: params.quantity,
      total_amount: params.total_amount,
      tax_free_amount: params.tax_free_amount,
      vat_amount: params.vat_amount,
      approval_url: params.approval_url,
      cancel_url: params.cancel_url,
      fail_url: params.fail_url,
    },
    getHeaders(),
    { timeout: KAKAOPAY_CONFIG.API_TIMEOUT }
  );

  // 에러 응답 체크
  if (response.status >= 400 || "error_code" in response.data) {
    handleErrorResponse(response, "결제 준비에 실패했습니다");
  }

  return response.data as KakaoPayReadyResponse;
}

/**
 * 결제 승인 API
 * 사용자가 결제를 완료한 후 pg_token을 받아서 승인 처리
 *
 * @param params - 결제 승인 파라미터
 * @returns 결제 승인 응답
 */
export async function approvePayment(
  params: KakaoPayApproveParams
): Promise<KakaoPayApproveResponse> {
  const url = `${API_BASE_URL}/online/v1/payment/approve`;

  console.log("[KakaoPay] 결제 승인 API 호출:", {
    url,
    mode: config.kakaopay.mode,
    tid: params.tid,
    partner_order_id: params.partner_order_id,
  });

  const response = await postJson<KakaoPayApproveResponse | KakaoPayErrorResponse>(
    url,
    {
      cid: config.kakaopay.cid,
      tid: params.tid,
      partner_order_id: params.partner_order_id,
      partner_user_id: params.partner_user_id,
      pg_token: params.pg_token,
    },
    getHeaders(),
    { timeout: KAKAOPAY_CONFIG.API_TIMEOUT }
  );

  // 에러 응답 체크
  if (response.status >= 400 || "error_code" in response.data) {
    handleErrorResponse(response, "결제 승인에 실패했습니다");
  }

  return response.data as KakaoPayApproveResponse;
}

/**
 * 결제 취소 API
 *
 * @param params - 결제 취소 파라미터
 * @returns 결제 취소 응답
 */
export async function cancelPayment(
  params: KakaoPayCancelParams
): Promise<KakaoPayCancelResponse> {
  const url = `${API_BASE_URL}/online/v1/payment/cancel`;

  console.log("[KakaoPay] 결제 취소 API 호출:", {
    url,
    tid: params.tid,
    cancel_amount: params.cancel_amount,
  });

  const response = await postJson<KakaoPayCancelResponse | KakaoPayErrorResponse>(
    url,
    {
      cid: config.kakaopay.cid,
      tid: params.tid,
      cancel_amount: params.cancel_amount,
      cancel_tax_free_amount: params.cancel_tax_free_amount,
      cancel_vat_amount: params.cancel_vat_amount,
    },
    getHeaders(),
    { timeout: KAKAOPAY_CONFIG.API_TIMEOUT }
  );

  // 에러 응답 체크
  if (response.status >= 400 || "error_code" in response.data) {
    handleErrorResponse(response, "결제 취소에 실패했습니다");
  }

  return response.data as KakaoPayCancelResponse;
}

/**
 * 간편 결제 취소 함수
 * cancelPayment의 간편 래퍼
 */
export async function cancelPaymentSimple(
  tid: string,
  cancelAmount: number,
  cancelTaxFreeAmount?: number // 비과세 금액 (미지정 시 0)
): Promise<KakaoPayCancelResponse> {
  return cancelPayment({
    tid,
    cancel_amount: cancelAmount,
    cancel_tax_free_amount: cancelTaxFreeAmount ?? 0,
  });
}

/**
 * 결제 조회 API
 *
 * @param tid - 결제 고유 번호
 * @returns 결제 정보
 */
export async function getPayment(tid: string): Promise<KakaoPayOrderResponse> {
  const url = `${API_BASE_URL}/online/v1/payment/order`;

  console.log("[KakaoPay] 결제 조회 API 호출:", {
    url,
    tid,
  });

  const response = await postJson<KakaoPayOrderResponse | KakaoPayErrorResponse>(
    url,
    {
      cid: config.kakaopay.cid,
      tid,
    },
    getHeaders()
  );

  // 에러 응답 체크
  if (response.status >= 400 || "error_code" in response.data) {
    handleErrorResponse(response, "결제 조회에 실패했습니다");
  }

  return response.data as KakaoPayOrderResponse;
}

// ============================================================
// 상태 매핑 함수
// ============================================================

/**
 * 카카오페이 결제 상태 → 주문 상태 매핑
 */
export function mapKakaoPayStatusToOrderStatus(
  status: KakaoPayPaymentStatus
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

/**
 * 카카오페이 취소 응답을 토스페이먼츠 호환 형식으로 변환
 */
export function normalizeKakaoPayCancelResponse(
  kakaoPayResponse: KakaoPayCancelResponse
): {
  status: string;
  cancels: Array<{
    cancelAmount: number;
    refundableAmount: number;
    canceledAt: string;
  }>;
} {
  const isFullCancel =
    kakaoPayResponse.cancel_available_amount.total === 0;

  return {
    status: isFullCancel ? "CANCELED" : "PARTIAL_CANCELED",
    cancels: [
      {
        cancelAmount: kakaoPayResponse.approved_cancel_amount.total,
        refundableAmount: kakaoPayResponse.cancel_available_amount.total,
        canceledAt: kakaoPayResponse.canceled_at,
      },
    ],
  };
}
