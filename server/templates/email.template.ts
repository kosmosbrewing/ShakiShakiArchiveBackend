// server/templates/email.template.ts
// 공통 이메일 레이아웃 템플릿

// ============================================================================
// 디자인 시스템 색상 (프론트엔드 CSS 변수와 동기화 - Order.vue 참고)
// ============================================================================
export const COLORS = {
  // Primary: hsl(335, 56%, 63%) → 로즈/핑크 (강조용)
  primary: "#D77CA2",

  // Foreground: hsl(31, 34%, 28%) → 갈색 계열 (기본 텍스트)
  foreground: "#5F4C38",

  // Muted: hsl(20, 13%, 44%) → 회갈색 (보조 텍스트)
  muted: "#7D7067",

  // Border: hsl(335, 10%, 90%) → 연한 그레이 (테두리)
  border: "#E8E4E5",

  // Background
  background: "#FFFFFF",
  backgroundMuted: "#FAF9F9",

  // 로고 이미지 URL (Cloudinary 최적화)
  logoUrl:
    "https://res.cloudinary.com/diyuvt3qg/image/upload/f_auto,q_auto,w_400,c_scale/v1769605869/shakishaki/products/i686ekdc6fqhanbx7mai.png",
} as const;

/**
 * 이메일 템플릿 옵션
 */
export interface EmailTemplateOptions {
  /** 이메일 제목 */
  title: string;
  /** 본문 HTML 콘텐츠 */
  body: string;
  /** 법적 안내 슬롯 (선택적) */
  legalNotice?: string;
}

/**
 * 공통 이메일 레이아웃 템플릿
 */
export function getEmailTemplate(options: EmailTemplateOptions): string {
  const { title, body, legalNotice } = options;
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.backgroundMuted}; font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <!-- 미리보기 텍스트 -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${title} - 샤키샤키 아카이브
  </div>

  <!-- 전체 컨테이너 -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${COLORS.backgroundMuted};">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <!-- 메인 컨테이너 -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: ${COLORS.background}; border-radius: 12px; overflow: hidden; border: 1px solid ${COLORS.border};">

          <!-- HEADER: 로고 -->
          <tr>
            <td style="padding: 32px 32px 48px 32px; text-align: center;">
              <img
                src="${COLORS.logoUrl}"
                alt="SHAKISHAKI ARCHIVE"
                width="280"
                height="auto"
                style="display: block; margin: 0 auto; max-width: 280px; height: auto;"
              />
            </td>
          </tr>

          <!-- BODY: 콘텐츠 -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              ${body}
            </td>
          </tr>

          <!-- LEGAL NOTICE (선택적) -->
          ${
            legalNotice
              ? `
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <p style="margin: 0; padding: 12px 16px; background-color: ${COLORS.backgroundMuted}; border-radius: 8px; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">
                ${legalNotice}
              </p>
            </td>
          </tr>
          `
              : ""
          }

          <!-- FOOTER -->
          <tr>
            <td style="padding: 24px 32px; background-color: ${COLORS.backgroundMuted};">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <p style="margin: 0 0 6px 0; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">
                      본 메일은 시스템에 의해 자동으로 발송되는 발신 전용 메일입니다.
                    </p>
                    <p style="margin: 0 0 6px 0; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">
                      주문하신 상품의 배송 상태 확인, 취소 및 반품 신청은 마이페이지 &gt; 주문내역에서 직접 확인하실 수 있습니다.
                    </p>
                    <p style="margin: 0; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">
                      상품의 반품 및 환불은 관련 법령 및 전자상거래 표준약관에 따라 보호받으실 수 있습니다.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding-top: 16px;">
                    <p style="margin: 0 0 4px 0; color: ${COLORS.muted}; font-size: 11px; line-height: 1.6;">
                      샤키샤키 아카이브&ensp;|&ensp;사업자등록번호 157-18-02463
                    </p>
                    <p style="margin: 0; color: ${COLORS.muted}; font-size: 11px; line-height: 1.6;">
                      Copyright &copy; ${currentYear} 샤키샤키 아카이브&ensp;|&ensp;<a href="https://shakishakiarchive.com/privacy" style="color: ${COLORS.muted}; text-decoration: none;">개인정보 처리방침</a>&ensp;|&ensp;<a href="https://shakishakiarchive.com/terms" style="color: ${COLORS.muted}; text-decoration: none;">이용약관</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ============================================================================
// 이메일 본문 컴포넌트 헬퍼 함수
// ============================================================================

/**
 * 제목 컴포넌트 (타이틀 위에만 padding)
 */
export function emailTitle(text: string): string {
  return `
    <h2 style="margin: 0 0 8px 0; padding-top: 8px; color: ${COLORS.foreground}; font-size: 20px; font-weight: 700; line-height: 1.3;">
      ${text}
    </h2>
  `;
}

/**
 * 본문 텍스트 컴포넌트
 */
export function emailParagraph(text: string): string {
  return `
    <p style="margin: 0 0 16px 0; color: ${COLORS.foreground}; font-size: 14px; line-height: 1.6;">
      ${text}
    </p>
  `;
}

/**
 * 주문번호 컴포넌트 - 좌/우 정렬 (강조 표시)
 */
export function emailHighlightBox(label: string, value: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 4px;">
      <tr>
        <td style="color: ${COLORS.muted}; font-size: 13px; text-align: left; vertical-align: top;">${label}</td>
        <td style="color: ${COLORS.primary}; font-size: 14px; font-weight: 700; text-align: right; vertical-align: top;">${value}</td>
      </tr>
    </table>
  `;
}

/**
 * 가로줄 구분선 컴포넌트
 */
export function emailDivider(): string {
  return `<hr style="border: none; border-top: 1px solid ${COLORS.border}; margin: 10px 0;" />`;
}

/**
 * 정보 카드 컴포넌트 (Card 스타일) - 좌우 여백 없음 (바깥 텍스트와 정렬)
 */
export function emailInfoCard(title: string, content: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 48px 0 8px 0;">
      <tr>
        <td style="padding-bottom: 12px; border-bottom: 1px solid ${COLORS.border};">
          <h3 style="margin: 0; color: ${COLORS.foreground}; font-size: 14px; font-weight: 600;">${title}</h3>
        </td>
      </tr>
      <tr>
        <td style="padding-top: 12px;">
          ${content}
        </td>
      </tr>
    </table>
  `;
}

/**
 * 정보 항목 (라벨 + 값) - 좌/우 정렬
 */
export function emailInfoItem(label: string, value: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 4px;">
      <tr>
        <td style="color: ${COLORS.muted}; font-size: 13px; text-align: left; vertical-align: top;">${label}</td>
        <td style="color: ${COLORS.foreground}; font-size: 14px; text-align: right; vertical-align: top;">${value}</td>
      </tr>
    </table>
  `;
}

/**
 * 정보 항목 (라벨 + 값) - 왼쪽 정렬 (배송 정보 등 긴 텍스트용)
 */
export function emailInfoItemLeft(label: string, value: string): string {
  return `
    <p style="margin: 0 0 8px 0;">
      <span style="color: ${COLORS.muted}; font-size: 13px;">${label}</span><br/>
      <span style="color: ${COLORS.foreground}; font-size: 14px;">${value}</span>
    </p>
  `;
}

/**
 * 배송 정보 테이블 컴포넌트
 * 라벨(왼쪽 고정폭) + 값(오른쪽) 형태의 테이블 레이아웃
 */
export interface ShippingInfoData {
  name: string; // 수령인
  phone: string; // 연락처
  postalCode?: string; // 우편번호
  address: string; // 기본 주소
  detailAddress?: string; // 상세 주소
  memo?: string; // 배송 메모
}

export function emailShippingTable(data: ShippingInfoData): string {
  const rows: string[] = [];

  // 수령인
  rows.push(`
    <tr>
      <td style="padding: 2px 0; color: ${COLORS.muted}; font-size: 13px; vertical-align: top; width: 70px;">수령인</td>
      <td style="padding: 2px 0; color: ${COLORS.foreground}; font-size: 14px; vertical-align: top;">${maskName(data.name)}</td>
    </tr>
  `);

  // 연락처
  rows.push(`
    <tr>
      <td style="padding: 2px 0; color: ${COLORS.muted}; font-size: 13px; vertical-align: top; width: 70px;">연락처</td>
      <td style="padding: 2px 0; color: ${COLORS.foreground}; font-size: 14px; vertical-align: top;">${maskPhone(data.phone)}</td>
    </tr>
  `);

  // 배송지 (우편번호 + 주소 + 상세주소를 여러 줄로)
  const addressLines: string[] = [];
  if (data.postalCode) {
    addressLines.push(data.postalCode);
  }
  addressLines.push(data.address);
  if (data.detailAddress) {
    addressLines.push(maskAddress(data.detailAddress));
  }

  rows.push(`
    <tr>
      <td style="padding: 2px 0; color: ${COLORS.muted}; font-size: 13px; vertical-align: top; width: 70px;">배송지</td>
      <td style="padding: 2px 0; color: ${COLORS.foreground}; font-size: 14px; vertical-align: top; line-height: 1.6;">
        ${addressLines.join("<br/>")}
      </td>
    </tr>
  `);

  // 배송 메모 (있을 경우만)
  if (data.memo) {
    rows.push(`
      <tr>
        <td style="padding: 2px 0; color: ${COLORS.muted}; font-size: 13px; vertical-align: top; width: 70px;">배송메모</td>
        <td style="padding: 2px 0; color: ${COLORS.foreground}; font-size: 14px; vertical-align: top;">${data.memo}</td>
      </tr>
    `);
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
      <tbody>
        ${rows.join("")}
      </tbody>
    </table>
    <p style="margin: 6px 0 0 0; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">* 영업일 기준 3~7일 이내 배송됩니다.</p>
  `;
}

/**
 * 금액 표시 컴포넌트
 */
export function emailAmount(
  label: string,
  amount: number,
  isTotal: boolean = false,
): string {
  if (isTotal) {
    return `
      <div style="margin: 6px 0 0 0; overflow: hidden;">
        <span style="color: ${COLORS.foreground}; font-size: 14px; font-weight: 600;">${label}</span>
        <span style="float: right; color: ${COLORS.primary}; font-size: 16px; font-weight: 700;">${amount.toLocaleString()}원</span>
      </div>
    `;
  }
  return `
    <div style="margin: 0 0 2px 0; overflow: hidden;">
      <span style="color: ${COLORS.muted}; font-size: 13px;">${label}</span>
      <span style="float: right; color: ${COLORS.foreground}; font-size: 13px;">${amount.toLocaleString()}원</span>
    </div>
  `;
}

/**
 * 상품 목록 테이블 컴포넌트 (가격 포함)
 */
export function emailProductTable(
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
    options?: string | null;
  }>,
): string {
  const rows = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 8px 0; vertical-align: top; border-bottom: 1px solid ${COLORS.border};">
        <p style="margin: 0; color: ${COLORS.foreground}; font-size: 14px;">${item.productName}</p>
        ${item.options ? `<p style="margin: 2px 0 0 0; color: ${COLORS.muted}; font-size: 12px;">${item.options} / ${item.quantity}개</p>` : `<p style="margin: 2px 0 0 0; color: ${COLORS.muted}; font-size: 12px;">${item.quantity}개</p>`}
      </td>
      <td style="padding: 8px 0; text-align: right; vertical-align: top; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.foreground}; font-size: 14px;">${item.price.toLocaleString()}원</td>
    </tr>
  `,
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-top: 8px;">
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * 상품 목록 컴포넌트 (가격 없음, 좌/우 정렬)
 * 주문 상품               오버핏 데님 자켓
 *                         L / 블루 / 1개
 */
export function emailProductList(
  items: Array<{
    productName: string;
    quantity: number;
    options?: string | null;
  }>,
): string {
  const rows = items
    .map(
      (item) => `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 4px;">
      <tr>
        <td style="color: ${COLORS.muted}; font-size: 13px; text-align: left; vertical-align: top; width: 80px;">주문 상품</td>
        <td style="color: ${COLORS.foreground}; font-size: 14px; text-align: right; vertical-align: top;">
          <span style="display: block;">${item.productName}</span>
          <span style="display: block; color: ${COLORS.muted}; font-size: 12px; margin-top: 2px;">${item.options ? `${item.options} / ${item.quantity}개` : `${item.quantity}개`}</span>
        </td>
      </tr>
    </table>
  `,
    )
    .join("");

  return rows;
}

/**
 * 안내 박스 컴포넌트 (단순화) - 좌우 여백 없음 (바깥 텍스트와 정렬)
 */
export function emailNoticeBox(title: string, content: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 16px 0 8px 0;">
      <tr>
        <td style="padding-top: 12px; border-top: 1px solid ${COLORS.border};">
          <p style="margin: 0 0 6px 0; color: ${COLORS.foreground}; font-size: 13px; font-weight: 600;">${title}</p>
          <div style="color: ${COLORS.muted}; font-size: 13px; line-height: 1.6;">
            ${content}
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * 순서 목록 컴포넌트 (단계별 안내용)
 */
export function emailOrderedList(items: string[]): string {
  const listItems = items
    .map(
      (item, index) => `
    <p style="margin: 0 0 4px 0; color: ${COLORS.foreground}; font-size: 13px; line-height: 1.6;">
      ${index + 1}. ${item}
    </p>
  `,
    )
    .join("");

  return listItems;
}

/**
 * 비순서 목록 컴포넌트 (주의사항용)
 */
export function emailUnorderedList(items: string[]): string {
  const listItems = items
    .map(
      (item) => `
    <p style="margin: 0 0 4px 0; color: ${COLORS.foreground}; font-size: 13px; line-height: 1.6;">
      • ${item}
    </p>
  `,
    )
    .join("");

  return listItems;
}

// ============================================================================
// 개인정보 마스킹 유틸리티
// ============================================================================

/**
 * 전화번호 마스킹 (010-1234-5678 → 010-****-5678)
 */
export function maskPhone(phone: string): string {
  if (!phone) return "";
  // 하이픈 제거 후 처리
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 11) {
    // 010-1234-5678 형태
    return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    // 02-1234-5678 또는 031-123-5678 형태
    return `${digits.slice(0, 2)}-****-${digits.slice(6)}`;
  }
  // 기타: 중간 4자리 마스킹
  const len = digits.length;
  if (len >= 8) {
    const start = Math.floor((len - 4) / 2);
    return digits.slice(0, start) + "****" + digits.slice(start + 4);
  }
  return phone;
}

/**
 * 이름 마스킹 (홍길동 → 홍*동, 김철수 → 김*수)
 */
export function maskName(name: string): string {
  if (!name) return "";
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  // 3글자 이상: 첫 글자와 마지막 글자만 표시
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

/**
 * 주소 마스킹 (상세 주소용)
 * - 아파트: "104동 1234호" → "104동 ***"
 * - 일반: "샤키빌딩 5층" → "샤키빌딩 ***"
 */
export function maskAddress(address: string): string {
  if (!address) return "";

  // 1. 아파트/오피스텔 형식: "XXX동 YYY호" → "XXX동 ***"
  const aptMatch = address.match(/^(.+동)\s*\d+.*호?$/);
  if (aptMatch) {
    return aptMatch[1] + " ***";
  }

  // 2. 호수만 있는 경우: "1234호" → "***"
  if (/^\d+호?$/.test(address)) {
    return "***";
  }

  // 3. 층수 형식: "XXX 5층" → "XXX ***"
  const floorMatch = address.match(/^(.+?)\s*\d+층.*$/);
  if (floorMatch) {
    return floorMatch[1] + " ***";
  }

  // 4. 공백으로 구분된 경우: 마지막 부분 마스킹
  const parts = address.split(" ");
  if (parts.length >= 2) {
    return parts.slice(0, -1).join(" ") + " ***";
  }

  // 5. 기타: 전체 마스킹
  return "***";
}

/**
 * 이메일 마스킹 (test@example.com → te**@example.com)
 */
export function maskEmail(email: string): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return local + "@" + domain;
  return local.slice(0, 2) + "**@" + domain;
}

// ============================================================================
// 법적 안내 문구 상수
// ============================================================================

export const LEGAL_NOTICE = {
  PAYMENT_COMPLETE:
    "택배 배송은 영업일 기준 3~7일 이내 도착하며, 상품 수령 후 7일 이내 청약철회가 가능합니다.",
  REFUND_GENERAL: "반품은 상품 회수 및 검수 완료 후 3영업일 내 처리됩니다.",
  REFUND_CARD: "결제 취소는 결제 수단에 따라 즉시 ~ 3영업일 내 완료됩니다.",
  REFUND_BANK: "환불은 결제 수단에 따라 즉시 ~ 3영업일 내 완료됩니다.",
  RETURN_RESTRICTION: "상품이 훼손된 경우 환불이 불가합니다. (라벨제거/세탁/착용 등)",
} as const;

// 하위 호환성을 위한 alias (기존 emailAlert 사용처 대응)
export type AlertType = "info" | "warning" | "success";
export function emailAlert(
  _type: AlertType,
  title: string,
  content: string,
): string {
  return emailNoticeBox(title, content);
}
