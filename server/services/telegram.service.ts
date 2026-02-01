// server/services/telegram.service.ts
// Telegram 관리자 알림 서비스

import { config } from "../config";
import { createLogger } from "../utils/logger";
import { maskUserName } from "../utils/masking";

const logger = createLogger("Telegram");

// ============================================================================
// 타입 정의
// ============================================================================

export interface TelegramResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

/** 결제 완료 알림 데이터 */
export interface PaymentNotificationData {
  externalOrderId: string;
  userName: string;
  orderName: string;
  totalAmount: number;
  paymentMethod: string;
  paymentProvider: "toss" | "naverpay" | "kakaopay";
}

/** 반품 요청 알림 데이터 */
export interface ReturnNotificationData {
  externalOrderId: string;
  userName: string;
  productName: string;
  reasonType: string;
  reason?: string;
}

/** 문의 등록 알림 데이터 */
export interface InquiryNotificationData {
  inquiryId: string;
  userName: string;
  type: string;
  title: string;
  productName?: string;
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/** 구분선 */
const DIVIDER = "──────────────────";

/**
 * 현재 시각을 KST 형식으로 반환
 * 예: 2026-02-01 16:55
 */
function getKSTTimestamp(): string {
  return new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(/\. /g, "-").replace(".", "").replace(" ", " ");
}

/**
 * HTML 특수문자 이스케이프 (XSS 방지)
 * Telegram HTML parse_mode에서 필요한 문자만 이스케이프
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================================
// 기본 발송 함수
// ============================================================================

/**
 * Telegram 메시지 발송
 */
async function sendMessage(text: string): Promise<TelegramResult> {
  if (!config.telegram.isEnabled) {
    logger.info("Telegram이 설정되지 않았습니다. 알림을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("Telegram 알림 (개발모드)", { text: text.substring(0, 100) });
    }
    return { success: true, messageId: 0 };
  }

  // 타임아웃 설정 (5초)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text,
        parse_mode: "HTML",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!data.ok) {
      logger.error("Telegram 발송 실패", { error: data.description });
      return { success: false, error: data.description };
    }

    logger.info("Telegram 알림 발송 완료", { messageId: data.result.message_id });
    return { success: true, messageId: data.result.message_id };
  } catch (error) {
    clearTimeout(timeoutId);

    // 타임아웃 에러 구분
    if (error instanceof Error && error.name === "AbortError") {
      logger.error("Telegram 발송 타임아웃", { timeout: "5s" });
      return { success: false, error: "타임아웃" };
    }

    logger.error("Telegram 발송 중 오류", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "알림 발송 실패",
    };
  }
}

// ============================================================================
// 알림 발송 함수
// ============================================================================

/**
 * 결제 완료 관리자 알림
 */
export async function notifyPaymentComplete(
  data: PaymentNotificationData
): Promise<TelegramResult> {
  const providerName = {
    toss: "토스페이먼츠",
    naverpay: "네이버페이",
    kakaopay: "카카오페이",
  }[data.paymentProvider];

  // 사용자 입력값 마스킹 및 이스케이프 처리
  const safeUserName = escapeHtml(maskUserName(data.userName) || data.userName);
  const safeOrderName = escapeHtml(data.orderName);
  const safePaymentMethod = escapeHtml(data.paymentMethod);

  const message = `
💳 <b>새로운 결제</b> (${getKSTTimestamp()})
${DIVIDER}
주문번호: <code>${data.externalOrderId}</code>
고객: ${safeUserName}
상품: ${safeOrderName}
금액: <b>${data.totalAmount.toLocaleString()}원</b>
결제: ${safePaymentMethod} (${providerName})
  `.trim();

  return sendMessage(message);
}

/**
 * 반품 요청 관리자 알림
 */
export async function notifyReturnRequest(
  data: ReturnNotificationData
): Promise<TelegramResult> {
  const reasonTypeMap: Record<string, string> = {
    change_mind: "단순 변심",
    defect: "상품 불량/파손",
    wrong_item: "오배송",
    other: "기타",
  };

  // 사용자 입력값 마스킹 및 이스케이프 처리
  const safeUserName = escapeHtml(maskUserName(data.userName) || data.userName);
  const safeProductName = escapeHtml(data.productName);
  const safeReason = data.reason ? escapeHtml(data.reason) : "";

  const message = `
📦 <b>반품 요청</b> (${getKSTTimestamp()})
${DIVIDER}
주문번호: <code>${data.externalOrderId}</code>
고객: ${safeUserName}
상품: ${safeProductName}
사유: ${reasonTypeMap[data.reasonType] || data.reasonType}
${safeReason ? `상세: ${safeReason}` : ""}
  `.trim();

  return sendMessage(message);
}

/**
 * 문의 등록 관리자 알림
 */
export async function notifyInquiryCreated(
  data: InquiryNotificationData
): Promise<TelegramResult> {
  const typeMap: Record<string, string> = {
    product: "상품 문의",
    shipping: "배송 문의",
    exchange: "교환/반품 문의",
    other: "기타 문의",
  };

  // 사용자 입력값 마스킹 및 이스케이프 처리
  const safeUserName = escapeHtml(maskUserName(data.userName) || data.userName);
  const safeTitle = escapeHtml(data.title);
  const safeProductName = data.productName ? escapeHtml(data.productName) : "";

  const message = `
💬 <b>새로운 문의</b> (${getKSTTimestamp()})
${DIVIDER}
고객: ${safeUserName}
유형: ${typeMap[data.type] || data.type}
제목: ${safeTitle}
${safeProductName ? `상품: ${safeProductName}` : ""}
  `.trim();

  return sendMessage(message);
}
