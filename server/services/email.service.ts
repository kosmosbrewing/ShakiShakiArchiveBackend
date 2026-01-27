// server/services/email.service.ts
// Resend 이메일 서비스

import { Resend } from "resend";
import { config } from "../config";
import { createLogger } from "../utils/logger";
import {
  VERIFICATION_CODE,
  generateVerificationCode as generateCode,
} from "../constants";

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
  code: string
): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    // 개발 환경에서는 콘솔에 코드 출력
    if (config.isDev) {
      logger.debug("인증코드 (개발모드)", { code, email });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: email,
      subject: "샤키샤키 아카이브 이메일 인증코드",
      html: `
        <div style="font-family: 'Noto Sans KR', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">이메일 인증</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            안녕하세요, 샤키샤키 아카이브(ShakiShaki Archive)입니다.<br/>
            회원가입을 완료하려면 아래 인증코드를 입력해주세요.
          </p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
          </div>
          <p style="color: #999; font-size: 14px;">
            이 인증코드는 ${
              config.email.verificationCodeExpiry
            }분 후에 만료됩니다.<br/>
            본인이 요청하지 않은 경우 이 이메일을 무시해주세요.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">
            © ${new Date().getFullYear()} ShakiShaki. All rights reserved.
          </p>
        </div>
      `,
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
  code: string
): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("비밀번호 재설정 코드 (개발모드)", { code, email });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: email,
      subject: "샤키샤키 아카이브 비밀번호 재설정 인증코드",
      html: `
        <div style="font-family: 'Noto Sans KR', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">비밀번호 재설정</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            안녕하세요, 샤키샤키 아카이브(ShakiShaki Archive)입니다.<br/>
            비밀번호를 재설정하려면 아래 인증코드를 입력해주세요.
          </p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
          </div>
          <p style="color: #999; font-size: 14px;">
            이 인증코드는 ${
              config.email.verificationCodeExpiry
            }분 후에 만료됩니다.<br/>
            본인이 요청하지 않은 경우 이 이메일을 무시해주세요.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">
            © ${new Date().getFullYear()} ShakiShaki. All rights reserved.
          </p>
        </div>
      `,
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
  shippingAddress: string;
  shippingDetailAddress?: string | null;
  shippingPhone: string;
  paymentMethod?: string | null;
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

// ============================================================================
// 주문 관련 이메일 발송 함수
// ============================================================================

/**
 * 결제 완료 이메일 발송
 * - 전자상거래법 제12조: 결제 완료 시 주문 내역 통지
 */
export async function sendPaymentConfirmEmail(data: OrderEmailData): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("결제 완료 이메일 (개발모드)", { orderId: data.orderId, email: data.email });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const itemsHtml = data.items.map(item => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px 0;">
          ${item.productName}${item.options ? `<br/><span style="color: #666; font-size: 13px;">${item.options}</span>` : ''}
        </td>
        <td style="text-align: center; padding: 12px 0;">${item.quantity}개</td>
        <td style="text-align: right; padding: 12px 0;">${item.price.toLocaleString()}원</td>
      </tr>
    `).join('');

    const { data: emailData, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: data.email,
      subject: `[샤키샤키 아카이브] 주문이 완료되었습니다 (주문번호: ${data.externalOrderId})`,
      html: `
        <div style="font-family: 'Noto Sans KR', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">주문이 완료되었습니다</h1>

          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            안녕하세요, ${data.userName}님.<br/>
            샤키샤키 아카이브를 이용해 주셔서 감사합니다.
          </p>

          <!-- 주문 번호 -->
          <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #666; margin: 0; font-size: 14px;">주문번호</p>
            <p style="font-size: 18px; font-weight: bold; margin: 8px 0 0 0; color: #333;">${data.externalOrderId}</p>
          </div>

          <!-- 주문 상품 목록 -->
          <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h3 style="color: #333; margin: 0 0 12px 0; font-size: 16px;">주문 상품</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 2px solid #e5e7eb;">
                  <th style="text-align: left; padding: 8px 0; color: #666; font-size: 13px;">상품명</th>
                  <th style="text-align: center; padding: 8px 0; color: #666; font-size: 13px;">수량</th>
                  <th style="text-align: right; padding: 8px 0; color: #666; font-size: 13px;">금액</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
            <div style="border-top: 2px solid #333; margin-top: 12px; padding-top: 12px;">
              <p style="margin: 4px 0; color: #666;">상품 금액: ${data.itemsAmount.toLocaleString()}원</p>
              <p style="margin: 4px 0; color: #666;">배송비: ${data.shippingFee > 0 ? data.shippingFee.toLocaleString() + '원' : '무료'}</p>
              <p style="font-size: 18px; font-weight: bold; margin: 12px 0 0 0; color: #333;">총 결제 금액: ${data.totalAmount.toLocaleString()}원</p>
            </div>
          </div>

          <!-- 배송 정보 -->
          <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h3 style="color: #333; margin: 0 0 12px 0; font-size: 16px;">배송 정보</h3>
            <p style="margin: 4px 0; color: #333;">${data.shippingName}</p>
            <p style="margin: 4px 0; color: #666;">${data.shippingAddress}${data.shippingDetailAddress ? ' ' + data.shippingDetailAddress : ''}</p>
            <p style="margin: 4px 0; color: #666;">${data.shippingPhone}</p>
            <p style="margin: 12px 0 0 0; color: #999; font-size: 13px;">
              * 영업일 기준 3~7일 이내 배송됩니다.
            </p>
          </div>

          ${data.paymentMethod ? `
          <!-- 결제 수단 -->
          <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h3 style="color: #333; margin: 0 0 8px 0; font-size: 16px;">결제 수단</h3>
            <p style="margin: 0; color: #666;">${data.paymentMethod}</p>
          </div>
          ` : ''}

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px; text-align: center;">
            문의사항은 고객센터로 연락해주세요.<br/>
            © ${new Date().getFullYear()} ShakiShaki. All rights reserved.
          </p>
        </div>
      `,
    });

    if (error) {
      logger.error("결제 완료 이메일 발송 실패", { error: error.message, orderId: data.orderId });
      return { success: false, error: error.message };
    }

    logger.info("결제 완료 이메일 발송 완료", { email: data.email, orderId: data.orderId, messageId: emailData?.id });
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    logger.error("결제 완료 이메일 발송 중 오류", { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : "이메일 발송 실패" };
  }
}

/**
 * 주문 취소 이메일 발송 (결제 전 취소)
 * - 전자상거래법 제14조: 취소 처리 시 환불 안내
 */
export async function sendOrderCancelEmail(data: CancelEmailData): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("주문 취소 이메일 (개발모드)", { orderId: data.orderId, email: data.email });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const { data: emailData, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: data.email,
      subject: `[샤키샤키 아카이브] 주문이 취소되었습니다 (주문번호: ${data.externalOrderId})`,
      html: `
        <div style="font-family: 'Noto Sans KR', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">주문이 취소되었습니다</h1>

          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            안녕하세요, ${data.userName}님.<br/>
            요청하신 주문 취소가 완료되었습니다.
          </p>

          <!-- 취소 정보 -->
          <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #666; margin: 0 0 8px 0; font-size: 14px;">주문번호</p>
            <p style="font-size: 18px; font-weight: bold; margin: 0 0 16px 0; color: #333;">${data.externalOrderId}</p>

            <p style="color: #666; margin: 0 0 4px 0; font-size: 14px;">주문 상품</p>
            <p style="margin: 0 0 16px 0; color: #333;">${data.orderName}</p>

            <p style="color: #666; margin: 0 0 4px 0; font-size: 14px;">취소 일시</p>
            <p style="margin: 0 0 16px 0; color: #333;">${data.canceledAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>

            ${data.cancelReason ? `
            <p style="color: #666; margin: 0 0 4px 0; font-size: 14px;">취소 사유</p>
            <p style="margin: 0; color: #333;">${data.cancelReason}</p>
            ` : ''}
          </div>

          <!-- 환불 안내 -->
          <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h3 style="color: #92400e; margin: 0 0 8px 0; font-size: 16px;">환불 안내</h3>
            <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
              결제 전 취소로 별도의 환불 절차가 필요하지 않습니다.
            </p>
          </div>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px; text-align: center;">
            문의사항은 고객센터로 연락해주세요.<br/>
            © ${new Date().getFullYear()} ShakiShaki. All rights reserved.
          </p>
        </div>
      `,
    });

    if (error) {
      logger.error("주문 취소 이메일 발송 실패", { error: error.message, orderId: data.orderId });
      return { success: false, error: error.message };
    }

    logger.info("주문 취소 이메일 발송 완료", { email: data.email, orderId: data.orderId, messageId: emailData?.id });
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    logger.error("주문 취소 이메일 발송 중 오류", { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : "이메일 발송 실패" };
  }
}

/**
 * 환불 완료 이메일 발송 (결제 후 환불)
 * - 전자상거래법 제16조: 환불 시 처리 기간 안내
 */
export async function sendRefundCompleteEmail(data: CancelEmailData): Promise<EmailResult> {
  if (!resend) {
    logger.warn("Resend가 설정되지 않았습니다. 이메일 발송을 건너뜁니다.");
    if (config.isDev) {
      logger.debug("환불 완료 이메일 (개발모드)", { orderId: data.orderId, email: data.email, refundAmount: data.refundAmount });
    }
    return { success: true, messageId: "dev-mode" };
  }

  try {
    // 결제 수단별 환불 안내 메시지
    let refundGuide = "환불은 결제 수단에 따라 영업일 기준 3~5일 이내 처리됩니다.";
    if (data.paymentMethod) {
      const method = data.paymentMethod.toLowerCase();
      if (method.includes("카드") || method.includes("card")) {
        refundGuide = "카드 결제 취소는 카드사에 따라 영업일 기준 3~7일 이내 처리됩니다.";
      } else if (method.includes("계좌") || method.includes("bank") || method.includes("transfer")) {
        refundGuide = "계좌이체 환불은 영업일 기준 1~3일 이내 처리됩니다.";
      }
    }

    const { data: emailData, error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.fromEmail}>`,
      to: data.email,
      subject: `[샤키샤키 아카이브] 환불이 완료되었습니다 (주문번호: ${data.externalOrderId})`,
      html: `
        <div style="font-family: 'Noto Sans KR', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">환불이 완료되었습니다</h1>

          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            안녕하세요, ${data.userName}님.<br/>
            요청하신 환불 처리가 완료되었습니다.
          </p>

          <!-- 환불 정보 -->
          <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #666; margin: 0 0 8px 0; font-size: 14px;">주문번호</p>
            <p style="font-size: 18px; font-weight: bold; margin: 0 0 16px 0; color: #333;">${data.externalOrderId}</p>

            <p style="color: #666; margin: 0 0 4px 0; font-size: 14px;">취소 상품</p>
            <p style="margin: 0 0 16px 0; color: #333;">${data.orderName}</p>

            <p style="color: #666; margin: 0 0 4px 0; font-size: 14px;">환불 처리 일시</p>
            <p style="margin: 0 0 16px 0; color: #333;">${data.canceledAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>

            <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 12px;">
              <p style="color: #666; margin: 0 0 4px 0; font-size: 14px;">환불 금액</p>
              <p style="font-size: 24px; font-weight: bold; margin: 0; color: #2563eb;">${data.refundAmount.toLocaleString()}원</p>
            </div>
          </div>

          <!-- 환불 안내 -->
          <div style="background: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h3 style="color: #1e40af; margin: 0 0 8px 0; font-size: 16px;">환불 처리 안내</h3>
            <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 1.6;">
              ${refundGuide}<br/>
              정확한 환불 일정은 결제 수단(카드사/은행)에 따라 상이할 수 있습니다.
            </p>
          </div>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px; text-align: center;">
            문의사항은 고객센터로 연락해주세요.<br/>
            © ${new Date().getFullYear()} ShakiShaki. All rights reserved.
          </p>
        </div>
      `,
    });

    if (error) {
      logger.error("환불 완료 이메일 발송 실패", { error: error.message, orderId: data.orderId });
      return { success: false, error: error.message };
    }

    logger.info("환불 완료 이메일 발송 완료", { email: data.email, orderId: data.orderId, refundAmount: data.refundAmount, messageId: emailData?.id });
    return { success: true, messageId: emailData?.id };
  } catch (error) {
    logger.error("환불 완료 이메일 발송 중 오류", { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : "이메일 발송 실패" };
  }
}
