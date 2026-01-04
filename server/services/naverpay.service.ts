// server/services/naverpay.service.ts
// 네이버페이 결제형 API 클라이언트
// 참고: https://docs.pay.naver.com

import { config } from "../config";
import crypto from "crypto";
import { httpRequest, postFormUrlEncoded } from "../utils/http-client";
import {
  NAVERPAY_CONFIG,
  NAVERPAY_PAYMENT_STATUS,
  ORDER_STATUS,
} from "../constants";

// 네이버페이 API 기본 URL (환경에 따라 동적 결정)
// 공식 문서: https://docs.pay.naver.com/docs/common/url-format
function getApiBaseUrl(): string {
  return config.naverpay.mode === "prod"
    ? "https://pay.paygate.naver.com"
    : "https://dev-pay.paygate.naver.com";
}

// 네이버페이 결제 상태
export type NaverPayPaymentStatus =
  | "READY" // 결제 예약 완료
  | "PAYMENT_COMPLETE" // 결제 완료 (승인 대기)
  | "APPROVED" // 결제 승인 완료
  | "CANCELED" // 결제 취소
  | "PARTIAL_CANCELED" // 부분 취소
  | "FAILED"; // 결제 실패

// ============================================================
// 결제창 호출 관련 타입 (클라이언트 SDK용 - 참고용)
// ============================================================

// SDK 파라미터 (클라이언트에서 Naver.Pay.create()에 전달)
export interface NaverPaySDKParams {
  clientId: string; // 가맹점 식별키 (public)
  chainId: string; // 가맹점 그룹 별 식별키 (public)
  mode?: "development" | "production"; // 기본값: production
  payType?: "normal"; // 일반결제 SDK
  openType?: "page" | "popup"; // 결제 화면 오픈 방식
}

// Pay Reserve 파라미터 (클라이언트에서 oPay.open()에 전달)
export interface NaverPayReserveParams {
  merchantPayKey: string; // 가맹점 주문번호 (필수, 64바이트)
  merchantUserKey?: string; // 가맹점 사용자 키 (50바이트)
  productName: string; // 대표 상품명 (필수, 128자)
  productCount: number; // 상품 수량 (필수)
  totalPayAmount: number; // 총 결제 금액 (필수, 최소 10원)
  taxScopeAmount: number; // 과세 대상 금액 (필수)
  taxExScopeAmount: number; // 면세 대상 금액 (필수)
  returnUrl: string; // 결제 인증 결과 전달 URL (필수, 3000바이트)
  merchantPayTransactionKey?: string; // 가맹점 결제 트랜잭션 번호 (128바이트)
  environmentDepositAmount?: number; // 컵 보증금 금액 (기본값: 0)
  purchaserName?: string; // 구매자 성명 (64바이트)
  purchaserBirthday?: string; // 구매자 생년월일 yyyyMMdd (64바이트)
  extraDeduction?: boolean; // 도서/공연/영화 소득공제 대상 여부
  useCfmYmdt?: string; // 이용완료일 yyyyMMdd (8바이트)
  merchantExtraParameter?: string; // 가맹점 예비 필드 (4000바이트)
  productItems?: NaverPayProductItem[]; // 상품 정보 배열 (필수)
  subMerchantInfo?: NaverPaySubMerchantInfo; // 하부가맹점 정보 (PG업종만 필수)
}

// productItem 타입
export interface NaverPayProductItem {
  categoryType: string; // 결제 상품 유형 (필수, 10바이트, 영대문자)
  categoryId: string; // 결제 상품 분류 (필수, 16바이트, 영대문자, _)
  uid: string; // 상품 식별값 (필수, 100바이트)
  name: string; // 상품명 (필수, 128자)
  payReferrer?: string; // 유입경로 (20바이트, 영대문자, _)
  startDate?: string; // 시작일 yyyyMMdd
  endDate?: string; // 종료일 yyyyMMdd
  sellerId?: string; // 판매자 식별키 (30바이트)
  count: number; // 상품 개수 (필수, 기본값 1, 최대 999999)
}

// subMerchantInfo 타입 (PG 업종만 필수)
export interface NaverPaySubMerchantInfo {
  subMerchantName: string; // 하부가맹점명 (필수, 100바이트)
  subMerchantId: string; // 하부가맹점 ID (필수, 40바이트)
  subMerchantBusinessNo: string; // 하부가맹점 사업자번호 (필수, 숫자 10자리)
  subMerchantPayId: string; // 하부가맹점 결제키 (필수, 70바이트)
  subMerchantTelephoneNo: string; // 하부가맹점 대표 전화번호 (필수, 100바이트)
  subMerchantCustomerServiceUrl: string; // 하부가맹점 고객 서비스 URL (필수, 3000바이트)
}

// ============================================================
// 결제 승인 API 타입 (v2.2)
// ============================================================

// 결제 승인 응답 (공식 문서 기반)
export interface NaverPayApplyResponse {
  code: string; // Success, Fail, InvalidMerchant, TimeExpired 등
  message: string;
  body?: {
    paymentId: string; // 네이버페이 결제번호
    detail: NaverPayApplyDetail;
  };
}

// 결제 승인 상세 정보
export interface NaverPayApplyDetail {
  paymentId: string; // 네이버페이 결제번호 (50바이트)
  payHistId: string; // 네이버페이 결제 이력 번호 (50바이트)
  merchantName: string; // 가맹점명 (50바이트)
  merchantId: string; // 가맹점 아이디 (50바이트)
  merchantPayKey: string; // 가맹점의 결제번호 (64바이트)
  merchantUserKey: string; // 가맹점의 사용자 키 (50바이트)
  admissionTypeCode: string; // 결제승인 유형 01:원결제, 03:전체취소 (2바이트)
  admissionYmdt: string; // 결제/취소 일시 yyyyMMddHHmmss (14바이트)
  tradeConfirmYmdt: string; // 거래 완료 일시 (50바이트)
  admissionState: "SUCCESS" | "FAIL"; // 결제/취소 시도에 대한 최종결과
  totalPayAmount: number; // 총 결제 금액
  applyPayAmount: number; // 구매자 결제 금액
  primaryPayAmount: number; // 주 결제 수단 결제 금액
  npointPayAmount: number; // 네이버페이 포인트/머니 결제 금액
  giftCardAmount: number; // 기프트카드 결제 금액
  discountPayAmount: number; // 즉시 할인 금액
  taxScopeAmount: number; // 과세 결제 금액
  taxExScopeAmount: number; // 면세 결제 금액
  environmentDepositAmount: number; // 컵 보증금 결제 금액
  primaryPayMeans: "CARD" | "BANK" | ""; // 주 결제 수단
  cardCorpCode?: string; // 주 결제 수단 카드사 (10바이트)
  cardNo?: string; // 일부 마스킹 된 신용카드 번호 (50바이트)
  cardAuthNo?: string; // 카드승인번호 (30바이트)
  cardInstCount?: number; // 할부 개월 수 (일시불은 0)
  usedCardPoint?: boolean; // 카드사 포인트 사용 유무
  bankCorpCode?: string; // 주 결제 수단 은행 (10바이트)
  bankAccountNo?: string; // 일부 마스킹 된 계좌 번호 (50바이트)
  productName: string; // 상품명 (128자)
  settleExpected: boolean; // 정산 예정 금액 계산 완료 여부
  settleExpectAmount: number; // 정산 예정 금액
  payCommissionAmount: number; // 결제 수수료 금액
  merchantExtraParameter?: string; // 가맹점 예비 필드 (4000바이트)
  merchantPayTransactionKey?: string; // 가맹점 결제 트랜잭션 번호 (128바이트)
  userIdentifier: string; // 암호화된 사용자 구분값 (44바이트)
  extraDeduction: boolean; // 도서/공연/영화 소득공제 여부
  useCfmYmdt?: string; // 이용 완료일 yyyyMMdd (8바이트)
  subMerchantInfo?: NaverPaySubMerchantInfo;
}

// ============================================================
// 결제 취소 API 타입 (v1)
// ============================================================

// 결제 취소 요청 파라미터
export interface NaverPayCancelParams {
  paymentId: string; // 네이버페이 결제번호 (필수, 50바이트)
  cancelAmount: number; // 취소 요청 금액 (필수)
  cancelReason: string; // 취소 사유 (필수, 256바이트)
  cancelRequester: "1" | "2"; // 취소 요청자 1:구매자, 2:가맹점 관리자 (필수)
  taxScopeAmount: number; // 과세 대상 금액 (필수)
  taxExScopeAmount: number; // 면세 대상 금액 (필수)
  merchantPayTransactionKey?: string; // 가맹점 결제 트랜잭션 번호 (128바이트)
  environmentDepositAmount?: number; // 컵 보증금 대상 금액
  doCompareRest?: 0 | 1; // 남은 금액 일치 체크 여부
  expectedRestAmount?: number; // 취소 후 남을 예상 금액 (doCompareRest=1일 때)
}

// 결제 취소 응답
export interface NaverPayCancelResponse {
  code: string; // Success, InvalidMerchant, InvalidPaymentId 등
  message: string;
  body?: {
    paymentId: string; // 네이버페이 결제번호 (50바이트)
    payHistId: string; // 취소 결제 번호 (50바이트)
    primaryPayMeans: "CARD" | "BANK" | ""; // 취소 처리된 주 결제 수단
    primaryPayCancelAmount: number; // 주 결제 수단 취소 금액
    primaryPayRestAmount: number; // 주 결제 수단 잔여 금액
    npointCancelAmount: number; // 네이버페이 포인트/머니 취소 금액
    npointRestAmount: number; // 네이버페이 포인트/머니 잔여 금액
    giftCardCancelAmount: number; // 기프트카드 취소 금액
    giftCardRestAmount: number; // 기프트카드 잔여 금액
    discountCancelAmount: number; // 즉시 할인 취소 금액
    discountRestAmount: number; // 즉시 할인 잔여 금액
    taxScopeAmount: number; // 과세 취소 금액
    taxExScopeAmount: number; // 면세 취소 금액
    taxScopeRestAmount: number; // 과세 잔여 결제 금액
    taxExScopeRestAmount: number; // 면세 잔여 결제 금액
    environmentDepositAmount: number; // 컵 보증금 취소 금액
    environmentDepositRestAmount: number; // 컵 보증금 잔여 금액
    cancelYmdt: string; // 취소 일시 yyyyMMddHHmmss (14바이트)
    totalRestAmount: number; // 전체 잔여 결제 금액
    applyRestAmount: number; // 구매자 결제 잔액
  };
}

// ============================================================
// 결제 조회 API 타입
// ============================================================

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

// ============================================================
// 에러 클래스
// ============================================================

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

// ============================================================
// 유틸리티 함수
// ============================================================

/**
 * Idempotency Key 생성 (멱등성 보장용)
 * 공식 문서 권장: UUID 사용, 64자 이내, 알파벳 대소문자(A-Z, a-z), 숫자(0-9), 언더바(_), 하이픈(-) 포함
 */
function generateIdempotencyKey(): string {
  // Node.js 내장 crypto.randomUUID() 사용 (RFC 4122 v4 UUID)
  return crypto.randomUUID();
}

/**
 * API 호출을 위한 공통 헤더 생성
 */
function getHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Naver-Client-Id": config.naverpay.clientId,
    "X-Naver-Client-Secret": config.naverpay.clientSecret,
    "X-NaverPay-Chain-Id": config.naverpay.chainId,
  };

  if (idempotencyKey) {
    headers["X-NaverPay-Idempotency-Key"] = idempotencyKey;
  }

  return headers;
}

// ============================================================
// API 함수
// ============================================================

/**
 * 결제 승인 API (v2.2)
 * 사용자가 네이버페이 결제 완료 후 returnUrl로 돌아왔을 때 호출
 *
 * @param paymentId - 네이버페이 결제번호 (returnUrl로 전달됨)
 * @returns 결제 승인 응답
 *
 * 참고: Content-Type은 application/x-www-form-urlencoded, timeout 60초 권장
 */
export async function applyPayment(
  paymentId: string
): Promise<NaverPayApplyResponse> {
  const idempotencyKey = generateIdempotencyKey();
  const url = `${getApiBaseUrl()}/naverpay-partner/naverpay/payments/v2.2/apply/payment`;

  const response = await postFormUrlEncoded<NaverPayApplyResponse>(
    url,
    { paymentId },
    getHeaders(idempotencyKey),
    { timeout: NAVERPAY_CONFIG.API_TIMEOUT }
  );

  if (response.data.code !== "Success") {
    throw new NaverPayPaymentError(
      response.data.code,
      response.data.message,
      response.status >= 400 ? response.status : 400
    );
  }

  return response.data;
}

/**
 * 결제 조회 API
 *
 * @param paymentId - 네이버페이 결제번호
 * @returns 결제 정보
 */
export async function getPayment(
  paymentId: string
): Promise<NaverPayPaymentResponse> {
  const url = `${getApiBaseUrl()}/naverpay-partner/naverpay/payments/v1/payment/${paymentId}`;

  const response = await httpRequest<NaverPayPaymentResponse>(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (response.data.code !== "Success") {
    throw new NaverPayPaymentError(
      response.data.code,
      response.data.message,
      response.status >= 400 ? response.status : 400
    );
  }

  return response.data;
}

/**
 * 결제 취소 API (v1)
 *
 * @param params - 취소 요청 파라미터
 * @returns 취소 응답
 *
 * 참고: Content-Type은 application/x-www-form-urlencoded, timeout 60초 권장
 */
export async function cancelPayment(
  params: NaverPayCancelParams
): Promise<NaverPayCancelResponse> {
  const idempotencyKey = generateIdempotencyKey();
  const url = `${getApiBaseUrl()}/naverpay-partner/naverpay/payments/v1/cancel`;

  const response = await postFormUrlEncoded<NaverPayCancelResponse>(
    url,
    {
      paymentId: params.paymentId,
      cancelAmount: params.cancelAmount,
      cancelReason: params.cancelReason,
      cancelRequester: params.cancelRequester,
      taxScopeAmount: params.taxScopeAmount,
      taxExScopeAmount: params.taxExScopeAmount,
      merchantPayTransactionKey: params.merchantPayTransactionKey,
      environmentDepositAmount: params.environmentDepositAmount,
      doCompareRest: params.doCompareRest,
      expectedRestAmount: params.expectedRestAmount,
    },
    getHeaders(idempotencyKey),
    { timeout: NAVERPAY_CONFIG.API_TIMEOUT }
  );

  if (response.data.code !== "Success") {
    throw new NaverPayPaymentError(
      response.data.code,
      response.data.message,
      response.status >= 400 ? response.status : 400
    );
  }

  return response.data;
}

/**
 * 간편 결제 취소 함수 (기존 인터페이스 호환)
 * cancelPayment의 간편 래퍼
 */
export async function cancelPaymentSimple(
  paymentId: string,
  cancelAmount: number,
  cancelReason: string,
  cancelRequester: "1" | "2" = "1", // 1: 구매자, 2: 가맹점 관리자
  taxScopeAmount?: number, // 과세 금액 (미지정 시 전액 과세로 가정)
  taxExScopeAmount?: number // 면세 금액 (미지정 시 0)
): Promise<NaverPayCancelResponse> {
  return cancelPayment({
    paymentId,
    cancelAmount,
    cancelReason,
    cancelRequester,
    taxScopeAmount: taxScopeAmount ?? cancelAmount,
    taxExScopeAmount: taxExScopeAmount ?? 0,
  });
}

// ============================================================
// 상태 매핑 함수
// ============================================================

/**
 * 결제 상태를 주문 상태로 매핑
 */
export function mapNaverPayStatusToOrderStatus(
  status: NaverPayPaymentStatus
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
 * 클라이언트 SDK 초기화용 설정 반환
 * 프론트엔드에서 Naver.Pay.create()에 전달할 파라미터
 */
export function getNaverPaySDKConfig(): NaverPaySDKParams {
  return {
    clientId: config.naverpay.clientId,
    chainId: config.naverpay.chainId,
    mode: config.naverpay.mode === "prod" ? "production" : "development",
    payType: "normal",
  };
}
