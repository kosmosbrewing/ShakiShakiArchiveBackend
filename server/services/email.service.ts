// server/services/email.service.ts
// Resend 이메일 서비스

import { Resend } from "resend";
import { config } from "../config";
import { createLogger } from "../utils/logger";

const logger = createLogger("Email");

// Resend 클라이언트 초기화
const resend = config.email.isEnabled
  ? new Resend(config.email.resendApiKey)
  : null;

/**
 * 6자리 인증코드 생성
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
      subject: "[ShakiShaki] 이메일 인증코드",
      html: `
        <div style="font-family: 'Noto Sans KR', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">이메일 인증</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            안녕하세요, ShakiShaki입니다.<br/>
            회원가입을 완료하려면 아래 인증코드를 입력해주세요.
          </p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
          </div>
          <p style="color: #999; font-size: 14px;">
            이 인증코드는 ${config.email.verificationCodeExpiry}분 후에 만료됩니다.<br/>
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
    logger.error("발송 중 오류", { error: error instanceof Error ? error.message : String(error) });
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
      subject: "[ShakiShaki] 비밀번호 재설정 인증코드",
      html: `
        <div style="font-family: 'Noto Sans KR', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">비밀번호 재설정</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            안녕하세요, ShakiShaki입니다.<br/>
            비밀번호를 재설정하려면 아래 인증코드를 입력해주세요.
          </p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
          </div>
          <p style="color: #999; font-size: 14px;">
            이 인증코드는 ${config.email.verificationCodeExpiry}분 후에 만료됩니다.<br/>
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
    logger.error("발송 중 오류", { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : "이메일 발송 실패";
    return { success: false, error: message };
  }
}
