// server/services/email.service.ts
// Resend 이메일 서비스

import { Resend } from "resend";
import { config } from "../config";
import { createLogger } from "../utils/logger";
import {
  VERIFICATION_CODE,
  generateVerificationCode as generateCode,
} from "../constants";
import {
  getEmailTemplate,
  emailTitle,
  emailParagraph,
  emailHighlightBox,
  emailInfoCard,
  emailInfoItem,
  emailInfoItemLeft,
  emailAmount,
  emailProductTable,
  emailProductList,
  emailShippingTable,
  emailDivider,
  emailAlert,
  emailOrderedList,
  emailUnorderedList,
  LEGAL_NOTICE,
  COLORS,
  maskPhone,
  maskName,
  maskAddress,
} from "../templates/email.template";

const logger = createLogger("Email");

// Resend 클라이언트 초기화
const resend = config.email.isEnabled
  ? new Resend(config.email.resendApiKey)
  : null;

/**
 * 6자리 인증코드 생성
 * @deprecated shared/constants/validation.ts의 generateVerificationCode 사용 권장
 */
export function generateVerificationCode(): string {
  return generateCode();
}

/**
 * 인증코드 만료 시간 계산
 */
export function getCodeExpiryTime(): Date {
  const expiryMinutes = config.email.verificationCodeExpiry;
  return new Date(Date.now() + expiryMinutes * 60 * 1000);
}

/**
 * 이메일 발송 결과 타입
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 회원가입 인증코드 이메일 발송
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("인증코드 (개발모드)", { code, email });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const bodyContent = `
      ${emailTitle("이메일 인증")}
      ${emailParagraph("안녕하세요, 샤키샤키 아카이브입니다.<br/>회원가입을 완료하려면 아래 인증코드를 입력해주세요.")}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
        <tr>
          <td style="background-color: ${COLORS.backgroundMuted}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 24px; text-align: center;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: ${COLORS.primary};">${code}</span>
          </td>
        </tr>
      </table>

      ${emailParagraph(`이 인증코드는 <strong style="color: ${COLORS.primary};">${config.email.verificationCodeExpiry}분</strong> 후에 만료됩니다.<br/>본인이 요청하지 않은 경우 이 이메일을 무시해주세요.`)}
    `;

    const html = getEmailTemplate({
      title: "이메일 인증코드",
      body: bodyContent,
    });

    const { data, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: email,
      subject: "[샤키샤키 아카이브] 이메일 인증코드",
      html,
    });

    if (error) {
      logger.error("발송 실패", { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info("인증코드 발송 완료", { email, messageId: data?.id });
    return { success: true, messageId: data?.id };
  } catch (error) {
    logger.error("발송 중 오류", {
      error: error instanceof Error ? error.message : String(error),
    });
    const message = error instanceof Error ? error.message : "이메일 발송 실패";
    return { success: false, error: message };
  }
}

/**
 * 비밀번호 재설정 인증코드 이메일 발송
 */
export async function sendPasswordResetEmail(
  email: string,
  code: string,
): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("비밀번호 재설정 코드 (개발모드)", { code, email });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const bodyContent = `
      ${emailTitle("비밀번호 재설정")}
      ${emailParagraph("안녕하세요, 샤키샤키 아카이브입니다.<br/>비밀번호를 재설정하려면 아래 인증코드를 입력해주세요.")}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
        <tr>
          <td style="background-color: ${COLORS.backgroundMuted}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 24px; text-align: center;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: ${COLORS.primary};">${code}</span>
          </td>
        </tr>
      </table>

      ${emailParagraph(`이 인증코드는 <strong style="color: ${COLORS.primary};">${config.email.verificationCodeExpiry}분</strong> 후에 만료됩니다.<br/>본인이 요청하지 않은 경우 이 이메일을 무시해주세요.`)}
    `;

    const html = getEmailTemplate({
      title: "비밀번호 재설정 인증코드",
      body: bodyContent,
    });

    const { data, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: email,
      subject: "[샤키샤키 아카이브] 비밀번호 재설정 인증코드",
      html,
    });

    if (error) {
      logger.error("발송 실패", { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info("비밀번호 재설정 코드 발송 완료", { email });
    return { success: true, messageId: data?.id };
  } catch (error) {
    logger.error("발송 중 오류", {
      error: error instanceof Error ? error.message : String(error),
    });
    const message = error instanceof Error ? error.message : "이메일 발송 실패";
    return { success: false, error: message };
  }
}

// ============================================================================
// 주문 관련 이메일 타입 정의
// ============================================================================

/**
 * 주문 완료 이메일 데이터
 */
export interface OrderEmailData {
  orderId: string;
  externalOrderId: string;
  userName: string;
  email: string;
  orderName: string;
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
    options?: string | null;
  }>;
  itemsAmount: number;
  shippingFee: number;
  totalAmount: number;
  shippingName: string;
  shippingPostalCode?: string | null;
  shippingAddress: string;
  shippingDetailAddress?: string | null;
  shippingPhone: string;
  shippingMemo?: string | null;
  paymentMethod?: string | null;
  paidAt?: Date | null;
}

/**
 * 취소/환불 이메일 데이터
 */
export interface CancelEmailData {
  orderId: string;
  externalOrderId: string;
  userName: string;
  email: string;
  orderName: string;
  cancelReason?: string;
  refundAmount: number;
  canceledAt: Date;
  paymentMethod?: string | null;
}

/**
 * 반품 요청 이메일 데이터
 */
export interface ReturnRequestEmailData {
  returnId: string;
  orderId: string;
  externalOrderId: string;
  userName: string;
  email: string;
  productName: string;
  reason: string;
  reasonType: string;
  requestedAt: Date;
}

// ============================================================================
// 주문 관련 이메일 발송 함수
// ============================================================================

/**
 * 결제 완료 이메일 발송
 * - 전자상거래법 제12조: 결제 완료 시 주문 내역 통지
 */
export async function sendPaymentConfirmEmail(
  data: OrderEmailData,
): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("결제 완료 이메일 (개발모드)", {
        orderId: data.orderId,
        email: data.email,
      });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    // 결제 일시
    const paidAtStr = data.paidAt
      ? new Date(data.paidAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })
      : new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    // 주문 정보 통합 카드 콘텐츠 (가로줄로 섹션 구분)
    const orderInfoContent = `
      ${emailHighlightBox("주문번호", data.externalOrderId)}
      ${emailInfoItem("결제 일시", paidAtStr)}
      ${data.paymentMethod ? emailInfoItem("결제 수단", data.paymentMethod) : ""}
      ${emailDivider()}
      ${emailProductList(data.items)}
      ${emailDivider()}
      ${emailAmount("상품 금액", data.itemsAmount)}
      ${emailAmount("배송비", data.shippingFee > 0 ? data.shippingFee : 0)}
      ${emailDivider()}
      ${emailAmount("총 결제 금액", data.totalAmount, true)}
    `;

    // 배송 정보 (테이블 레이아웃)
    const shippingContent = emailShippingTable({
      name: data.shippingName,
      phone: data.shippingPhone,
      postalCode: data.shippingPostalCode || undefined,
      address: data.shippingAddress,
      detailAddress: data.shippingDetailAddress || undefined,
      memo: data.shippingMemo || undefined,
    });

    const bodyContent = `
      ${emailTitle("주문이 완료되었습니다")}
      ${emailParagraph(`안녕하세요, ${maskName(data.userName)}님.<br/>샤키샤키 아카이브를 이용해 주셔서 감사합니다.`)}

      ${emailInfoCard("주문 정보", orderInfoContent)}

      <div style="margin-top: 28px;">
        ${emailInfoCard("배송 정보", shippingContent)}
      </div>
    `;

    const html = getEmailTemplate({
      title: "주문이 완료되었습니다",
      body: bodyContent,
      legalNotice: LEGAL_NOTICE.PAYMENT_COMPLETE,
    });

    const { data: emailData, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: data.email,
      subject: `[샤키샤키 아카이브] 주문이 완료되었습니다`,
      html,
    });

    if (error) {
      logger.error("결제 완료 이메일 발송 실패", {
        error: error.message,
        orderId: data.orderId,
      });
      return { success: false, error: error.message };
    }

    logger.info("결제 완료 이메일 발송 완료", {
      email: data.email,
      orderId: data.orderId,
      messageId: emailData?.id,
    });
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    logger.error("결제 완료 이메일 발송 중 오류", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "이메일 발송 실패",
    };
  }
}

/**
 * 주문 취소 이메일 발송 (결제 전 취소)
 * - 전자상거래법 제14조: 취소 처리 시 환불 안내
 */
export async function sendOrderCancelEmail(
  data: CancelEmailData,
): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("주문 취소 이메일 (개발모드)", {
        orderId: data.orderId,
        email: data.email,
      });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    // 취소 정보 카드 콘텐츠
    const cancelInfoContent = `
      ${emailInfoItem("주문 상품", data.orderName)}
      ${emailInfoItem("취소 일시", data.canceledAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}
      ${data.cancelReason ? emailInfoItem("취소 사유", data.cancelReason) : ""}
    `;

    const bodyContent = `
      ${emailTitle("주문이 취소되었습니다")}
      ${emailParagraph(`안녕하세요, ${maskName(data.userName)}님.<br/>요청하신 주문 취소가 완료되었습니다.`)}

      ${emailInfoCard(
        "취소 정보",
        `
        ${emailHighlightBox("주문번호", data.externalOrderId)}
        ${cancelInfoContent}
      `,
      )}

      ${emailAlert("warning", "환불 안내", "결제 전 취소로 별도의 환불 절차가 필요하지 않습니다.")}
    `;

    const html = getEmailTemplate({
      title: "주문이 취소되었습니다",
      body: bodyContent,
    });

    const { data: emailData, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: data.email,
      subject: `[샤키샤키 아카이브] 주문이 취소되었습니다`,
      html,
    });

    if (error) {
      logger.error("주문 취소 이메일 발송 실패", {
        error: error.message,
        orderId: data.orderId,
      });
      return { success: false, error: error.message };
    }

    logger.info("주문 취소 이메일 발송 완료", {
      email: data.email,
      orderId: data.orderId,
      messageId: emailData?.id,
    });
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    logger.error("주문 취소 이메일 발송 중 오류", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "이메일 발송 실패",
    };
  }
}

/**
 * 환불 완료 이메일 발송 (결제 후 환불)
 * - 전자상거래법 제16조: 환불 시 처리 기간 안내
 */
export async function sendRefundCompleteEmail(
  data: CancelEmailData,
): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("환불 완료 이메일 (개발모드)", {
        orderId: data.orderId,
        email: data.email,
        refundAmount: data.refundAmount,
      });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    // 결제 수단별 환불 안내 메시지
    let refundGuide: string = LEGAL_NOTICE.REFUND_GENERAL;
    if (data.paymentMethod) {
      const method = data.paymentMethod.toLowerCase();
      if (method.includes("카드") || method.includes("card")) {
        refundGuide = LEGAL_NOTICE.REFUND_CARD;
      } else if (
        method.includes("계좌") ||
        method.includes("bank") ||
        method.includes("transfer")
      ) {
        refundGuide = LEGAL_NOTICE.REFUND_BANK;
      }
    }

    // 환불 정보 카드 콘텐츠
    const refundInfoContent = `
      ${emailInfoItem("취소 상품", data.orderName)}
      ${emailInfoItem("환불 처리 일시", data.canceledAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 16px;">
        <tr>
          <td style="background-color: ${COLORS.backgroundMuted}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0 0 4px 0; color: ${COLORS.muted}; font-size: 12px;">환불 금액</p>
            <p style="margin: 0; color: ${COLORS.primary}; font-size: 24px; font-weight: 700;">${data.refundAmount.toLocaleString()}원</p>
          </td>
        </tr>
      </table>
    `;

    const bodyContent = `
      ${emailTitle("환불이 완료되었습니다")}
      ${emailParagraph(`안녕하세요, ${maskName(data.userName)}님.<br/>요청하신 환불 처리가 완료되었습니다.`)}

      ${emailInfoCard(
        "환불 정보",
        `
        ${emailHighlightBox("주문번호", data.externalOrderId)}
        ${refundInfoContent}
      `,
      )}

      ${emailAlert("info", "환불 처리 안내", `${refundGuide}<br/>정확한 환불 일정은 결제 수단(네이버페이/카카오페이)에 따라 상이할 수 있습니다.`)}
    `;

    const html = getEmailTemplate({
      title: "환불이 완료되었습니다",
      body: bodyContent,
    });

    const { data: emailData, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: data.email,
      subject: `[샤키샤키 아카이브] 환불이 완료되었습니다`,
      html,
    });

    if (error) {
      logger.error("환불 완료 이메일 발송 실패", {
        error: error.message,
        orderId: data.orderId,
      });
      return { success: false, error: error.message };
    }

    logger.info("환불 완료 이메일 발송 완료", {
      email: data.email,
      orderId: data.orderId,
      refundAmount: data.refundAmount,
      messageId: emailData?.id,
    });
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    logger.error("환불 완료 이메일 발송 중 오류", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "이메일 발송 실패",
    };
  }
}

/**
 * 반품 요청 접수 이메일 발송
 * - 반품 요청이 정상적으로 접수되었음을 안내
 * - 다음 단계(운송장 등록) 안내
 */
export async function sendReturnRequestEmail(
  data: ReturnRequestEmailData,
): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("반품 요청 이메일 (개발모드)", {
        returnId: data.returnId,
        email: data.email,
      });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    // 반품 사유 타입 한글화 (schema.ts의 returnRequestSchema와 일치)
    const reasonTypeMap: Record<string, string> = {
      change_mind: "단순 변심",
      defect: "상품 불량/파손",
      wrong_item: "오배송",
      other: "기타",
    };
    const reasonTypeKorean = reasonTypeMap[data.reasonType] || data.reasonType;

    // 반품 정보 카드 콘텐츠
    const returnInfoContent = `
      ${emailInfoItem("반품 상품", data.productName)}
      ${emailInfoItem("반품 사유", reasonTypeKorean)}
      ${data.reason ? emailInfoItem("상세 사유", data.reason) : ""}
      ${emailInfoItem("접수 일시", data.requestedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}
    `;

    // 다음 단계 안내 목록
    const nextSteps = [
      "반품 상품을 안전하게 포장해주세요.",
      "택배사를 통해 상품을 발송해주세요.",
      "마이페이지에서 운송장 번호를 등록해주세요.",
      "상품 도착 후 검수가 진행됩니다.",
      "검수 완료 후 환불이 처리됩니다.",
    ];

    // 주의사항 목록
    const warnings = [
      "상품 택(Tag)이 제거된 경우 반품이 불가합니다.",
      "착용 흔적이 있는 경우 반품이 거절될 수 있습니다.",
      "고객 귀책 사유 시 반품 배송비가 부과됩니다.",
    ];

    const bodyContent = `
      ${emailTitle("반품 요청이 접수되었습니다")}
      ${emailParagraph(`안녕하세요, ${maskName(data.userName)}님.<br/>반품 요청이 정상적으로 접수되었습니다.`)}

      ${emailInfoCard(
        "반품 정보",
        `
        ${emailHighlightBox("주문번호", data.externalOrderId)}
        ${returnInfoContent}
      `,
      )}

      ${emailAlert("info", "다음 단계 안내", emailOrderedList(nextSteps))}

      ${emailAlert("warning", "반품 시 주의사항", emailUnorderedList(warnings))}
    `;

    const html = getEmailTemplate({
      title: "반품 요청이 접수되었습니다",
      body: bodyContent,
      legalNotice: LEGAL_NOTICE.REFUND_GENERAL,
    });

    const { data: emailData, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: data.email,
      subject: `[샤키샤키 아카이브] 반품 요청이 접수되었습니다`,
      html,
    });

    if (error) {
      logger.error("반품 요청 이메일 발송 실패", {
        error: error.message,
        returnId: data.returnId,
      });
      return { success: false, error: error.message };
    }

    logger.info("반품 요청 이메일 발송 완료", {
      email: data.email,
      returnId: data.returnId,
      messageId: emailData?.id,
    });
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    logger.error("반품 요청 이메일 발송 중 오류", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "이메일 발송 실패",
    };
  }
}
