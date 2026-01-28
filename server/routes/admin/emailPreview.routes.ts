// server/routes/admin/emailPreview.routes.ts
// 이메일 템플릿 미리보기 API (관리자 전용)

import { Router, Request, Response } from "express";
import { isAdmin } from "../../middleware/auth.middleware";
import {
  getEmailTemplate,
  emailTitle,
  emailParagraph,
  emailHighlightBox,
  emailInfoCard,
  emailInfoItem,
  emailAmount,
  emailProductTable,
  emailProductList,
  emailShippingTable,
  emailDivider,
  emailNoticeBox,
  emailOrderedList,
  emailUnorderedList,
  LEGAL_NOTICE,
  COLORS,
  maskName,
} from "../../templates/email.template";

const router = Router();

// 이메일 템플릿 타입
type EmailTemplateType =
  | "payment_confirm"
  | "order_cancel"
  | "refund_complete"
  | "return_request"
  | "verification";

// 템플릿 목록
const TEMPLATE_LIST: Array<{ type: EmailTemplateType; name: string; description: string }> = [
  { type: "payment_confirm", name: "결제 완료", description: "주문 결제 완료 시 발송" },
  { type: "order_cancel", name: "주문 취소", description: "주문 취소 시 발송" },
  { type: "refund_complete", name: "환불 완료", description: "환불 처리 완료 시 발송" },
  { type: "return_request", name: "반품 요청", description: "반품 요청 접수 시 발송" },
  { type: "verification", name: "인증코드", description: "회원가입/비밀번호 재설정 시 발송" },
];

// 샘플 데이터
const SAMPLE_DATA = {
  userName: "홍길동",
  externalOrderId: "ORD-2026012800001",
  productName: "오버핏 데님 자켓",
  options: "L / 블루",
  quantity: 1,
  price: 89000,
  shippingFee: 3000,
  totalAmount: 92000,
  refundAmount: 89000,
  shippingName: "이규빈",
  shippingPhone: "010-3751-1234",
  shippingPostalCode: "48411",
  shippingAddress: "부산광역시 남구 전포대로 84-1 (문현동)",
  shippingDetailAddress: "104동 1234호",
  shippingMemo: "부재시 문앞에 놓아주세요.",
  cancelReason: "단순 변심",
  returnReason: "상품 불량/파손",
  verificationCode: "847291",
};

/**
 * 결제 완료 이메일 미리보기 생성
 */
function generatePaymentConfirmPreview(): string {
  const paidAtStr = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const items = [
    {
      productName: SAMPLE_DATA.productName,
      quantity: SAMPLE_DATA.quantity,
      options: SAMPLE_DATA.options,
    },
  ];

  // 주문 정보 통합 카드 콘텐츠 (가로줄로 섹션 구분)
  const orderInfoContent = `
    ${emailHighlightBox("주문번호", SAMPLE_DATA.externalOrderId)}
    ${emailInfoItem("결제 일시", paidAtStr)}
    ${emailInfoItem("결제 수단", "신용카드")}
    ${emailDivider()}
    ${emailProductList(items)}
    ${emailDivider()}
    ${emailAmount("상품 금액", SAMPLE_DATA.price)}
    ${emailAmount("배송비", SAMPLE_DATA.shippingFee)}
    ${emailDivider()}
    ${emailAmount("총 결제 금액", SAMPLE_DATA.totalAmount, true)}
  `;

  // 배송 정보 (테이블 레이아웃)
  const shippingContent = emailShippingTable({
    name: SAMPLE_DATA.shippingName,
    phone: SAMPLE_DATA.shippingPhone,
    postalCode: SAMPLE_DATA.shippingPostalCode,
    address: SAMPLE_DATA.shippingAddress,
    detailAddress: SAMPLE_DATA.shippingDetailAddress,
    memo: SAMPLE_DATA.shippingMemo,
  });

  const bodyContent = `
    ${emailTitle("주문이 완료되었습니다")}
    ${emailParagraph(`안녕하세요, ${maskName(SAMPLE_DATA.userName)}님.<br/>샤키샤키 아카이브를 이용해 주셔서 감사합니다.`)}

    ${emailInfoCard("주문 정보", orderInfoContent)}

    <div style="margin-top: 28px;">
      ${emailInfoCard("배송 정보", shippingContent)}
    </div>
  `;

  return getEmailTemplate({
    title: "주문이 완료되었습니다",
    body: bodyContent,
    legalNotice: LEGAL_NOTICE.PAYMENT_COMPLETE,
  });
}

/**
 * 주문 취소 이메일 미리보기 생성
 */
function generateOrderCancelPreview(): string {
  const cancelInfoContent = `
    ${emailInfoItem("주문 상품", SAMPLE_DATA.productName)}
    ${emailInfoItem("취소 일시", new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}
    ${emailInfoItem("취소 사유", SAMPLE_DATA.cancelReason)}
  `;

  const bodyContent = `
    ${emailTitle("주문이 취소되었습니다")}
    ${emailParagraph(`안녕하세요, ${maskName(SAMPLE_DATA.userName)}님.<br/>요청하신 주문 취소가 완료되었습니다.`)}
    ${emailInfoCard("취소 정보", `
      ${emailHighlightBox("주문번호", SAMPLE_DATA.externalOrderId)}
      ${cancelInfoContent}
    `)}
    ${emailNoticeBox("환불 안내", "결제 전 취소로 별도의 환불 절차가 필요하지 않습니다.")}
  `;

  return getEmailTemplate({
    title: "주문이 취소되었습니다",
    body: bodyContent,
  });
}

/**
 * 환불 완료 이메일 미리보기 생성
 */
function generateRefundCompletePreview(): string {
  const refundInfoContent = `
    ${emailInfoItem("취소 상품", SAMPLE_DATA.productName)}
    ${emailInfoItem("환불 처리 일시", new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 16px;">
      <tr>
        <td style="background-color: ${COLORS.backgroundMuted}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <p style="margin: 0 0 4px 0; color: ${COLORS.muted}; font-size: 12px;">환불 금액</p>
          <p style="margin: 0; color: ${COLORS.primary}; font-size: 24px; font-weight: 700;">${SAMPLE_DATA.refundAmount.toLocaleString()}원</p>
        </td>
      </tr>
    </table>
  `;

  const bodyContent = `
    ${emailTitle("환불이 완료되었습니다")}
    ${emailParagraph(`안녕하세요, ${maskName(SAMPLE_DATA.userName)}님.<br/>요청하신 환불 처리가 완료되었습니다.`)}
    ${emailInfoCard("환불 정보", `
      ${emailHighlightBox("주문번호", SAMPLE_DATA.externalOrderId)}
      ${refundInfoContent}
    `)}
    ${emailNoticeBox("환불 처리 안내", `${LEGAL_NOTICE.REFUND_CARD}<br/>정확한 환불 일정은 결제 수단(카드사/은행)에 따라 상이할 수 있습니다.`)}
  `;

  return getEmailTemplate({
    title: "환불이 완료되었습니다",
    body: bodyContent,
  });
}

/**
 * 반품 요청 이메일 미리보기 생성
 */
function generateReturnRequestPreview(): string {
  const returnInfoContent = `
    ${emailInfoItem("반품 상품", SAMPLE_DATA.productName)}
    ${emailInfoItem("반품 사유", SAMPLE_DATA.returnReason)}
    ${emailInfoItem("접수 일시", new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}
  `;

  const nextSteps = [
    "반품 상품을 안전하게 포장해주세요.",
    "택배사를 통해 상품을 발송해주세요.",
    "마이페이지에서 운송장 번호를 등록해주세요.",
    "상품 도착 후 검수가 진행됩니다.",
    "검수 완료 후 환불이 처리됩니다.",
  ];

  const warnings = [
    "상품 택(Tag)이 제거된 경우 반품이 불가합니다.",
    "착용 흔적이 있는 경우 반품이 거절될 수 있습니다.",
    "고객 귀책 사유 시 반품 배송비가 부과됩니다.",
  ];

  const bodyContent = `
    ${emailTitle("반품 요청이 접수되었습니다")}
    ${emailParagraph(`안녕하세요, ${maskName(SAMPLE_DATA.userName)}님.<br/>반품 요청이 정상적으로 접수되었습니다.`)}
    ${emailInfoCard("반품 정보", `
      ${emailHighlightBox("주문번호", SAMPLE_DATA.externalOrderId)}
      ${returnInfoContent}
    `)}
    ${emailNoticeBox("다음 단계 안내", emailOrderedList(nextSteps))}
    ${emailNoticeBox("반품 시 주의사항", emailUnorderedList(warnings))}
  `;

  return getEmailTemplate({
    title: "반품 요청이 접수되었습니다",
    body: bodyContent,
    legalNotice: LEGAL_NOTICE.REFUND_GENERAL,
  });
}

/**
 * 인증코드 이메일 미리보기 생성
 */
function generateVerificationPreview(): string {
  const bodyContent = `
    ${emailTitle("이메일 인증")}
    ${emailParagraph("안녕하세요, 샤키샤키 아카이브입니다.<br/>회원가입을 완료하려면 아래 인증코드를 입력해주세요.")}

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td style="background-color: ${COLORS.backgroundMuted}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 24px; text-align: center;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: ${COLORS.primary};">${SAMPLE_DATA.verificationCode}</span>
        </td>
      </tr>
    </table>

    ${emailParagraph(`이 인증코드는 <strong style="color: ${COLORS.primary};">10분</strong> 후에 만료됩니다.<br/>본인이 요청하지 않은 경우 이 이메일을 무시해주세요.`)}
  `;

  return getEmailTemplate({
    title: "이메일 인증코드",
    body: bodyContent,
  });
}

// ============================================================================
// API 엔드포인트
// ============================================================================

/**
 * GET /api/admin/email-preview/templates
 * 사용 가능한 이메일 템플릿 목록 조회
 */
router.get("/templates", isAdmin, (req: Request, res: Response) => {
  res.json({
    templates: TEMPLATE_LIST,
    colors: COLORS,
  });
});

/**
 * GET /api/admin/email-preview/:type
 * 특정 이메일 템플릿 미리보기 HTML 반환
 */
router.get("/:type", isAdmin, (req: Request, res: Response) => {
  const { type } = req.params;

  let html: string;

  switch (type as EmailTemplateType) {
    case "payment_confirm":
      html = generatePaymentConfirmPreview();
      break;
    case "order_cancel":
      html = generateOrderCancelPreview();
      break;
    case "refund_complete":
      html = generateRefundCompletePreview();
      break;
    case "return_request":
      html = generateReturnRequestPreview();
      break;
    case "verification":
      html = generateVerificationPreview();
      break;
    default:
      res.status(400).json({ error: "Invalid template type" });
      return;
  }

  // HTML 직접 반환 (미리보기용)
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default router;
