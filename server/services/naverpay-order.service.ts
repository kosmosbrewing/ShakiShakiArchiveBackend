// server/services/naverpay-order.service.ts
// 네이버페이 주문형 API 서비스
// 참고: 주문형 네이버페이 서비스 연동하기 V2.1 문서

import { config } from "../config";
import { httpRequest, postFormUrlEncoded } from "../utils/http-client";
import { createLogger } from "../utils/logger";
import {
  safeOptionName,
  safeOptionValueId,
  safeOptionValueText,
  safeManageCode,
  safeProductName,
} from "../utils/naverpay-validators";

const logger = createLogger("NaverPayOrder");

// ============================================================
// API URL 설정
// ============================================================

/**
 * 주문등록 API URL
 * 테스트: https://test-api.pay.naver.com/o/customer/api/order/v20/register
 * 운영: https://api.pay.naver.com/o/customer/api/order/v20/register
 */
function getOrderRegisterUrl(): string {
  return config.naverpayOrder.mode === "production"
    ? "https://api.pay.naver.com/o/customer/api/order/v20/register"
    : "https://test-api.pay.naver.com/o/customer/api/order/v20/register";
}

/**
 * 네이버페이 버튼 스크립트 URL (PC)
 */
export function getButtonScriptUrl(): string {
  return config.naverpayOrder.mode === "production"
    ? "https://pay.naver.com/customer/js/naverPayButton.js"
    : "https://test-pay.naver.com/customer/js/naverPayButton.js";
}

/**
 * 네이버페이 버튼 스크립트 URL (Mobile)
 */
export function getButtonScriptUrlMobile(): string {
  return config.naverpayOrder.mode === "production"
    ? "https://pay.naver.com/customer/js/mobile/naverPayButton.js"
    : "https://test-pay.naver.com/customer/js/mobile/naverPayButton.js";
}

/**
 * 네이버페이 찜하기 API URL
 * 테스트: https://test-pay.naver.com/customer/api/wishlist.nhn
 * 운영: https://pay.naver.com/customer/api/wishlist.nhn
 */
function getWishlistUrl(): string {
  return config.naverpayOrder.mode === "production"
    ? "https://pay.naver.com/customer/api/wishlist.nhn"
    : "https://test-pay.naver.com/customer/api/wishlist.nhn";
}

/**
 * 네이버페이 찜하기 등록 파라미터
 */
export interface WishlistRegisterParams {
  itemId: string;       // 상품 ID (네이버페이용 짧은 ID)
  itemName: string;     // 상품명
  itemUprice: number;   // 상품 가격
  itemImage: string;    // 상품 이미지 URL
  itemUrl: string;      // 상품 상세 페이지 URL
}

/**
 * 네이버페이 찜하기 API 호출
 * 가이드 5장: 찜 버튼 클릭 시 가맹점 → 네이버페이 서버로 POST
 *
 * @param params 찜하기 등록 파라미터
 * @returns 성공 여부
 */
export async function registerWishlist(params: WishlistRegisterParams): Promise<{ success: boolean; message: string }> {
  const url = getWishlistUrl();
  const { merchantId, certiKey } = config.naverpayOrder;

  try {
    const response = await postFormUrlEncoded<string>(url, {
      SHOP_ID: merchantId,
      CERTI_KEY: certiKey,
      ITEM_ID: params.itemId,
      ITEM_NAME: params.itemName,
      ITEM_UPRICE: params.itemUprice,
      ITEM_IMAGE: params.itemImage,
      ITEM_URL: params.itemUrl,
    }, {}, { timeout: 10000 });

    const responseText = response.data;
    logger.info("네이버페이 찜하기 API 응답", {
      status: response.status,
      body: typeof responseText === "string" ? responseText.substring(0, 200) : responseText,
    });

    // 응답 처리 (SUCCESS 또는 FAIL)
    if (response.status === 200) {
      return { success: true, message: "찜 목록에 등록되었습니다" };
    }

    return { success: false, message: `네이버페이 찜하기 실패 (HTTP ${response.status})` };
  } catch (error) {
    logger.error("네이버페이 찜하기 API 호출 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, message: "네이버페이 찜하기 API 호출에 실패했습니다" };
  }
}

// ============================================================
// 타입 정의
// ============================================================

/** 세금 유형 (가이드 표 3-2) */
export type TaxType = "TAX" | "TAX_FREE" | "ZERO_TAX";

/** 배송 방법 (가이드 표 3-4) */
export type ShippingMethod =
  | "DELIVERY"         // 택배/등기/소포
  | "QUICK_SVC"        // 퀵서비스
  | "DIRECT_DELIVERY"  // 직접전달
  | "VISIT_RECEIPT"    // 방문수령
  | "NOTHING";         // 배송없음

/** 배송비 유형 (가이드 표 3-4) */
export type ShippingFeeType =
  | "FREE"              // 무료
  | "CHARGE"            // 유료
  | "CONDITIONAL_FREE"  // 조건부 무료
  | "CHARGE_BY_QUANTITY"; // 수량별 부과

/** 배송비 결제 유형 (가이드 표 3-4) */
export type FeePayType = "FREE" | "PREPAYED" | "CASH_ON_DELIVERY";

/** 상품 상태 (가이드 표 3-8) */
export type ProductStatus = "ON_SALE" | "SOLD_OUT" | "NOT_SALE";

/**
 * 단일상품 (옵션 없음) - 레거시 지원용, 내부적으로 옵션으로 변환됨
 */
export interface SingleProduct {
  quantity: number;
}

/**
 * 옵션 선택 항목 (주문등록용 selectedItem)
 * 주문등록 API에서 사용자가 선택한 옵션을 표현
 */
export interface SelectedItem {
  type: "SELECT" | "INPUT";   // SELECT: 선택형, INPUT: 입력형
  name: string;               // 옵션명 (최대 20자)
  valueId?: string;           // 옵션값 ID (SELECT 타입, 최대 50자)
  valueText: string;          // 옵션값 텍스트 (최대 50자)
}

/**
 * 옵션 상품
 * 네이버페이 v2.0+: 옵션이 있으면 single 대신 option 사용
 * selectedItems로 사용자가 선택한 옵션 상세 정보 전달
 */
export interface OptionProduct {
  name?: string;                    // 레거시: 옵션명 (예: "기본", "L / 블랙")
  optionManageCode: string;         // 옵션 조합 관리 코드 (최대 100자)
  quantity: number;
  optionPrice: number;              // 옵션 추가 금액
  selectedItems?: SelectedItem[];   // 옵션 상세 (사이즈, 색상 등)
}

/**
 * 도서산간비 설정
 */
export interface SurchargeByArea {
  apiSupport?: boolean;   // 도서산간 API 사용 여부
  splitUnit?: number;     // 분할 단위
  area2Price?: number;    // 제주도 추가 배송비
  area3Price?: number;    // 제주 외 도서산간 추가 배송비
}

/**
 * 조건부 무료배송 설정
 */
export interface ConditionalFree {
  basePrice: number; // 무료배송 기준 금액
}

/**
 * 배송 정책
 */
export interface ShippingPolicy {
  groupId: string;           // 배송 그룹 ID (묶음배송용)
  method: ShippingMethod;    // 배송 방법
  feeType: ShippingFeeType;  // 배송비 유형
  feePayType: FeePayType;    // 배송비 결제 유형
  feePrice: number;          // 배송비
  conditionalFree?: ConditionalFree; // 조건부 무료배송 설정
  surchargeByArea?: SurchargeByArea; // 도서산간비 설정
}

/**
 * 반품 정보
 */
export interface ReturnInfo {
  zipcode: string;
  address1: string;
  address2?: string;
  sellername: string;
  contact1: string;
  contact2?: string;
}

/**
 * 주문 등록용 상품 정보
 */
export interface OrderProduct {
  id: string;                    // 상품 ID
  ecMallProductId: string;       // 쇼핑몰 상품 ID (보통 id와 동일)
  name: string;                  // 상품명
  basePrice: number;             // 상품 기본 가격
  taxType: TaxType;              // 세금 유형
  infoUrl: string;               // 상품 상세 페이지 URL
  imageUrl: string;              // 상품 이미지 URL
  single?: SingleProduct;        // 단일 상품 (옵션 없을 때)
  option?: OptionProduct[];      // 옵션 상품 (옵션 있을 때)
  shippingPolicy: ShippingPolicy;
}

/**
 * 유입 경로 정보
 */
export interface InterfaceInfo {
  salesCode?: string;
  cpaInflowCode?: string;    // CPAValidator 쿠키 값
  naverInflowCode?: string;  // NA_CO 쿠키 값
  saClickId?: string;        // NVADID 쿠키 값
  merchantCustomCode1?: string;
  merchantCustomCode2?: string;
}

/**
 * 주문 등록 요청 데이터
 */
export interface OrderRegisterRequest {
  merchantId: string;
  certiKey: string;
  products: OrderProduct[];
  backUrl: string;          // 뒤로가기/취소 시 돌아갈 URL
  interface?: InterfaceInfo;
}

/**
 * 주문 등록 응답
 */
export interface OrderRegisterResponse {
  code: string;      // "Success" or error code
  message: string;
  body?: {
    orderId: string;     // 네이버페이 주문 ID (인증키로 사용)
    merchantNo?: string; // 가맹점번호 (URL 구성에 필요, XML 응답에서는 없을 수 있음)
  };
}

/**
 * 상품정보 API용 옵션 항목 (optionItem)
 * 상품정보 API에서 전체 옵션 목록을 표현
 */
export interface OptionItemXml {
  type: "SELECT" | "INPUT";
  name: string;                 // 옵션명 (사이즈, 색상 등)
  values: Array<{
    id: string;                 // 옵션값 ID
    text: string;               // 옵션값 텍스트
    status?: boolean;           // 구매 가능 여부 (기본 true)
  }>;
}

/**
 * 상품정보 API용 옵션 조합 (combination)
 * 상품정보 API에서 옵션 조합 정보를 표현
 */
export interface CombinationXml {
  manageCode: string;           // 조합 관리 코드
  price: number;                // 옵션 추가 금액
  stockQuantity?: number;       // 재고 (0=품절)
  status?: boolean;             // 구매 가능 여부 (기본 true)
  options: Array<{
    name: string;               // 옵션명
    id: string;                 // 선택된 옵션값 ID
  }>;
}

/**
 * 상품정보 XML 응답용 상품 데이터
 */
export interface ProductInfoXml {
  id: string;
  ecMallProductId: string;
  name: string;
  basePrice: number;
  taxType: TaxType;
  infoUrl: string;
  imageUrl: string;
  status: ProductStatus;
  stockQuantity: number;
  optionSupport: boolean;
  supplementSupport: boolean;
  returnShippingFee: number;
  exchangeShippingFee: number;
  returnInfo: ReturnInfo;
  shippingPolicy: ShippingPolicy;
  // 레거시 옵션 형식 (하위 호환)
  options?: Array<{
    optionManageCode: string;
    optionName: string;
    optionPrice: number;
    stockQuantity: number;
    status: ProductStatus;
  }>;
  // 새 옵션 형식 (표 3-10 규격)
  optionItems?: OptionItemXml[];
  combinations?: CombinationXml[];
}

/**
 * 도서산간비 응답
 */
export interface AdditionalFeeResponse {
  id: string;
  surprice: number; // 추가 배송비
}

// ============================================================
// XML 생성 함수
// ============================================================

/**
 * XML 특수문자 이스케이프
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * CDATA로 감싸기
 */
function cdata(str: string): string {
  return `<![CDATA[${str}]]>`;
}

/**
 * 주문 등록용 XML 생성
 */
export function buildOrderRegisterXml(request: OrderRegisterRequest): string {
  const { merchantId, certiKey, products, backUrl, interface: interfaceInfo } = request;

  let xml = `<?xml version="1.0" encoding="utf-8"?>
<order>
  <merchantId>${escapeXml(merchantId)}</merchantId>
  <certiKey>${escapeXml(certiKey)}</certiKey>`;

  // 상품 목록
  for (const product of products) {
    xml += `
  <product>
    <id>${escapeXml(product.id)}</id>
    <ecMallProductId>${escapeXml(product.ecMallProductId)}</ecMallProductId>
    <name>${cdata(safeProductName(product.name))}</name>
    <basePrice>${product.basePrice}</basePrice>
    <taxType>${product.taxType}</taxType>
    <infoUrl>${cdata(product.infoUrl)}</infoUrl>
    <imageUrl>${cdata(product.imageUrl)}</imageUrl>`;

    // 옵션 상품과 단일 상품 처리 (⚠️ single과 option은 공존 불가!)
    if (product.option && product.option.length > 0) {
      // 옵션 상품: <option> 블록 사용 (표 3-3)
      for (const opt of product.option) {
        xml += `
    <option>
      <quantity>${opt.quantity}</quantity>`;

        // optionPrice와 manageCode는 같이 사용 (manageCode 없으면 price도 제거)
        if (opt.optionManageCode) {
          xml += `
      <price>${opt.optionPrice || 0}</price>
      <manageCode>${escapeXml(safeManageCode(opt.optionManageCode))}</manageCode>`;
        }

        // selectedItems: 사용자가 선택한 옵션 상세 (사이즈, 색상 등)
        if (opt.selectedItems && opt.selectedItems.length > 0) {
          for (const item of opt.selectedItems) {
            xml += `
      <selectedItem>
        <type>${item.type}</type>
        <name>${cdata(safeOptionName(item.name))}</name>
        <value>`;

            // SELECT 타입은 id 포함, INPUT 타입은 id 생략
            if (item.type === "SELECT" && item.valueId) {
              xml += `<id>${escapeXml(safeOptionValueId(item.valueId))}</id>`;
            }
            xml += `<text>${cdata(safeOptionValueText(item.valueText))}</text>`;
            xml += `</value>
      </selectedItem>`;
          }
        }

        xml += `
    </option>`;
      }
    } else if (product.single) {
      // 단일 상품 (옵션 없음): <single> 블록 사용
      xml += `
    <single>
      <quantity>${product.single.quantity}</quantity>
    </single>`;
    } else {
      // 둘 다 없으면 기본 단일 상품 (수량 1)
      xml += `
    <single>
      <quantity>1</quantity>
    </single>`;
    }

    // 배송 정책
    const sp = product.shippingPolicy;
    xml += `
    <shippingPolicy>
      <groupId>${escapeXml(sp.groupId)}</groupId>
      <method>${sp.method}</method>
      <feeType>${sp.feeType}</feeType>
      <feePayType>${sp.feePayType}</feePayType>
      <feePrice>${sp.feePrice}</feePrice>`;

    if (sp.conditionalFree) {
      xml += `
      <conditionalFree>
        <basePrice>${sp.conditionalFree.basePrice}</basePrice>
      </conditionalFree>`;
    }

    // 비회원 주문에서는 surchargeByArea(도서산간비) 미사용

    xml += `
    </shippingPolicy>
  </product>`;
  }

  // backUrl
  xml += `
  <backUrl>${cdata(backUrl)}</backUrl>`;

  // interface (유입경로 정보)
  if (interfaceInfo) {
    xml += `
  <interface>
    <salesCode>${interfaceInfo.salesCode || ""}</salesCode>
    <cpaInflowCode>${interfaceInfo.cpaInflowCode || ""}</cpaInflowCode>
    <naverInflowCode>${interfaceInfo.naverInflowCode || ""}</naverInflowCode>
    <saClickId>${interfaceInfo.saClickId || ""}</saClickId>
    <merchantCustomCode1>${interfaceInfo.merchantCustomCode1 || ""}</merchantCustomCode1>
    <merchantCustomCode2>${interfaceInfo.merchantCustomCode2 || ""}</merchantCustomCode2>
  </interface>`;
  }

  xml += `
</order>`;

  return xml;
}

/**
 * 상품정보 XML 응답 생성
 */
export function buildProductInfoXml(products: ProductInfoXml[]): string {
  let xml = `<?xml version="1.0" encoding="utf-8"?>
<products>`;

  for (const product of products) {
    xml += `
  <product>
    <id>${escapeXml(product.id)}</id>
    <ecMallProductId>${escapeXml(product.ecMallProductId)}</ecMallProductId>
    <name>${cdata(safeProductName(product.name))}</name>
    <basePrice>${product.basePrice}</basePrice>
    <taxType>${product.taxType}</taxType>
    <infoUrl>${cdata(product.infoUrl)}</infoUrl>
    <imageUrl>${cdata(product.imageUrl)}</imageUrl>
    <status>${product.status}</status>
    <stockQuantity>${product.stockQuantity}</stockQuantity>
    <optionSupport>${product.optionSupport}</optionSupport>
    <supplementSupport>${product.supplementSupport}</supplementSupport>
    <returnShippingFee>${product.returnShippingFee}</returnShippingFee>
    <exchangeShippingFee>${product.exchangeShippingFee}</exchangeShippingFee>
    <returnInfo>
      <zipcode>${escapeXml(product.returnInfo.zipcode)}</zipcode>
      <address1>${cdata(product.returnInfo.address1)}</address1>
      <address2>${cdata(product.returnInfo.address2 || "")}</address2>
      <sellername>${cdata(product.returnInfo.sellername)}</sellername>
      <contact1>${escapeXml(product.returnInfo.contact1)}</contact1>
      <contact2>${escapeXml(product.returnInfo.contact2 || "")}</contact2>
    </returnInfo>
    <shippingPolicy>
      <groupId>${escapeXml(product.shippingPolicy.groupId)}</groupId>
      <method>${product.shippingPolicy.method}</method>
      <feeType>${product.shippingPolicy.feeType}</feeType>
      <feePayType>${product.shippingPolicy.feePayType}</feePayType>
      <feePrice>${product.shippingPolicy.feePrice}</feePrice>`;

    if (product.shippingPolicy.conditionalFree) {
      xml += `
      <conditionalFree>
        <basePrice>${product.shippingPolicy.conditionalFree.basePrice}</basePrice>
      </conditionalFree>`;
    }

    if (product.shippingPolicy.surchargeByArea) {
      const sa = product.shippingPolicy.surchargeByArea;
      xml += `
      <surchargeByArea>`;
      if (sa.apiSupport !== undefined) {
        xml += `
        <apiSupport>${sa.apiSupport}</apiSupport>`;
      }
      if (sa.splitUnit !== undefined) {
        xml += `
        <splitUnit>${sa.splitUnit}</splitUnit>`;
      }
      if (sa.area2Price !== undefined) {
        xml += `
        <area2Price>${sa.area2Price}</area2Price>`;
      }
      if (sa.area3Price !== undefined) {
        xml += `
        <area3Price>${sa.area3Price}</area3Price>`;
      }
      xml += `
      </surchargeByArea>`;
    }

    xml += `
    </shippingPolicy>`;

    // 옵션 정보 (표 3-10 규격: optionItem + combination 구조)
    if ((product.optionItems && product.optionItems.length > 0) ||
        (product.combinations && product.combinations.length > 0)) {
      xml += `
    <option>`;

      // 1. optionItem: 전체 옵션 항목 목록
      if (product.optionItems) {
        for (const item of product.optionItems) {
          xml += `
      <optionItem>
        <type>${item.type}</type>
        <name>${cdata(safeOptionName(item.name))}</name>`;

          for (const val of item.values) {
            xml += `
        <value>
          <id>${escapeXml(safeOptionValueId(val.id))}</id>
          <text>${cdata(safeOptionValueText(val.text))}</text>`;
            if (val.status !== undefined) {
              xml += `
          <status>${val.status}</status>`;
            }
            xml += `
        </value>`;
          }

          xml += `
      </optionItem>`;
        }
      }

      // 2. combination: 옵션 조합 정보
      if (product.combinations) {
        for (const combo of product.combinations) {
          xml += `
      <combination>
        <manageCode>${escapeXml(safeManageCode(combo.manageCode))}</manageCode>
        <price>${combo.price}</price>`;

          if (combo.stockQuantity !== undefined) {
            xml += `
        <stockQuantity>${combo.stockQuantity}</stockQuantity>`;
          }
          if (combo.status !== undefined) {
            xml += `
        <status>${combo.status}</status>`;
          }

          for (const opt of combo.options) {
            xml += `
        <options>
          <name>${cdata(safeOptionName(opt.name))}</name>
          <id>${escapeXml(safeOptionValueId(opt.id))}</id>
        </options>`;
          }

          xml += `
      </combination>`;
        }
      }

      xml += `
    </option>`;
    } else if (product.options && product.options.length > 0) {
      // 레거시 옵션 형식 (하위 호환) - 추후 제거 예정
      xml += `
    <options>`;
      for (const opt of product.options) {
        xml += `
      <option>
        <optionManageCode>${escapeXml(safeManageCode(opt.optionManageCode))}</optionManageCode>
        <optionName>${cdata(safeOptionName(opt.optionName))}</optionName>
        <optionPrice>${opt.optionPrice}</optionPrice>
        <stockQuantity>${opt.stockQuantity}</stockQuantity>
        <status>${opt.status}</status>
      </option>`;
      }
      xml += `
    </options>`;
    }

    xml += `
  </product>`;
  }

  xml += `
</products>`;

  return xml;
}

/**
 * 도서산간비 응답 XML 생성
 */
export function buildAdditionalFeesXml(fees: AdditionalFeeResponse[]): string {
  let xml = `<?xml version="1.0" encoding="utf-8"?>
<additionalFees>`;

  for (const fee of fees) {
    xml += `
  <additionalFee>
    <id>${escapeXml(fee.id)}</id>
    <surprice>${fee.surprice}</surprice>
  </additionalFee>`;
  }

  xml += `
</additionalFees>`;

  return xml;
}

// ============================================================
// API 함수
// ============================================================

/**
 * 주문 등록 API 호출
 *
 * @param request 주문 등록 요청 데이터
 * @returns 주문 등록 응답 (orderId 포함)
 */
export async function registerOrder(
  request: OrderRegisterRequest
): Promise<OrderRegisterResponse> {
  const url = getOrderRegisterUrl();
  const xml = buildOrderRegisterXml(request);

  // 요청 로깅 (certiKey 마스킹)
  const maskedXml = xml.replace(/<certiKey>[^<]+<\/certiKey>/, "<certiKey>****</certiKey>");
  logger.debug("주문등록 요청", { url, xml: maskedXml });

  try {
    const response = await httpRequest<string>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: xml,
      timeout: 60000,
    });

    // 응답 로깅
    const responseText = response.data;
    logger.debug("주문등록 응답", {
      status: response.status,
      body: responseText,
    });

    // 평문 성공 응답 처리 (예: "SUCCESS:HC-E89lGCvtS_AAm80C3gA:300091190")
    // orderId: 동적 인증키 (URL 구성에 사용)
    // merchantNo: 가맹점번호 (URL 구성에 사용)
    const plainSuccessMatch = responseText.match(/^SUCCESS:([^:]+):(.+)$/);
    if (plainSuccessMatch) {
      const result: OrderRegisterResponse = {
        code: "Success",
        message: "주문 등록 성공",
        body: {
          orderId: plainSuccessMatch[1],
          merchantNo: plainSuccessMatch[2],
        },
      };
      logger.info("주문 등록 성공", {
        orderId: result.body?.orderId,
        merchantNo: result.body?.merchantNo,
      });
      return result;
    }

    // 평문 오류 응답 처리 (예: "FAIL:[ERR-OR-100013] 옵션별 주문수량 정보가 없습니다.")
    const plainErrorMatch = responseText.match(/^FAIL:\[([^\]]+)\]\s*(.+)$/);
    if (plainErrorMatch) {
      const errorCode = plainErrorMatch[1];
      const errorMessage = plainErrorMatch[2];
      const errorDetail = getErrorDetail(errorCode);

      const result: OrderRegisterResponse = {
        code: errorCode,
        message: errorMessage,
      };

      // 상세 에러 정보 로깅
      logger.error("주문 등록 실패", {
        code: result.code,
        message: result.message,
        detail: errorDetail,
      });

      // 에러 상세 디버그 로깅
      if (errorDetail) {
        logger.debug("네이버페이 에러 상세", {
          code: errorCode,
          message: errorMessage,
          cause: errorDetail.cause,
          solution: errorDetail.solution,
        });
      }

      return result;
    }

    // XML 응답 파싱
    const codeMatch = responseText.match(/<code>([^<]+)<\/code>/);
    const messageMatch = responseText.match(/<message>([^<]+)<\/message>/);
    const orderIdMatch = responseText.match(/<orderId>([^<]+)<\/orderId>/);

    const result: OrderRegisterResponse = {
      code: codeMatch?.[1] || "Unknown",
      message: messageMatch?.[1] || responseText.substring(0, 500),
    };

    if (orderIdMatch) {
      result.body = {
        orderId: orderIdMatch[1],
      };
    }

    if (result.code !== "Success") {
      logger.error("주문 등록 실패", { code: result.code, message: result.message });
    } else {
      logger.info("주문 등록 성공", { orderId: result.body?.orderId });
    }

    return result;
  } catch (error) {
    logger.error("주문등록 API 호출 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 주문형 네이버페이 SDK 설정 반환
 * 프론트엔드에서 네이버페이 버튼 렌더링에 필요한 정보
 */
export function getNaverPayOrderSDKConfig() {
  return {
    // 가이드 0.2절: BUTTON_KEY는 프론트엔드 전달용 (공개)
    buttonKey: config.naverpayOrder.buttonKey,
    // 가이드 0.1절: test | production
    mode: config.naverpayOrder.mode,
    // 활성화 여부
    isEnabled: config.naverpayOrder.isEnabled,
    // SDK 스크립트 URL (가이드 6.1절)
    buttonScriptUrl: getButtonScriptUrl(),
    buttonScriptUrlMobile: getButtonScriptUrlMobile(),
    // 주문서 열기 방식: PAGE = 현재 창 이동, POPUP = 새 창 (기본)
    openType: "PAGE" as const,
  };
}

// ============================================================
// 에러 코드 매핑 (가이드 9장 참고)
// ============================================================

/**
 * 네이버페이 주요 에러 코드와 원인/해결방법 매핑
 */
export const NAVERPAY_ERROR_MESSAGES: Record<string, { cause: string; solution: string }> = {
  // XML 파싱 관련
  "ERR-OR-100013": {
    cause: "XML 파싱 실패",
    solution: "Content-Type 확인 (application/xml; charset=utf-8), XML 유효성 검증",
  },
  // 필수 요소 관련
  "ERR-OR-100019": {
    cause: "필수 요소 누락",
    solution: "id, name, basePrice, infoUrl, imageUrl, shippingPolicy 확인",
  },
  // 필드값 유효성 관련
  "ERR-OR-100055": {
    cause: "필드값 규격 위반",
    solution: "basePrice≥1, feePrice 0~200,000, 옵션명 20자 제한 등 확인",
  },
  // 옵션 관련
  "ERR-OR-100056": {
    cause: "옵션별 주문수량 정보 누락",
    solution: "option 블록에 quantity 필드 확인, single과 option 공존 불가",
  },
  // 인증 관련
  "ERR-OR-100001": {
    cause: "인증 실패",
    solution: "merchantId, certiKey 값 확인",
  },
  // 상품 관련
  "ERR-OR-100020": {
    cause: "상품 정보 오류",
    solution: "상품 ID 30자 제한, 허용 문자(영문,숫자,!+-/=_|) 확인",
  },
  // 금액 관련
  "ERR-OR-100030": {
    cause: "금액 오류",
    solution: "basePrice 1원 이상, optionPrice가 basePrice의 -50% 이상인지 확인",
  },
  // 배송 관련
  "ERR-OR-100040": {
    cause: "배송 정책 오류",
    solution: "feeType, feePayType 조합 확인, feePrice 범위 확인",
  },
};

/**
 * 에러 코드로 상세 메시지 조회
 * @param code 네이버페이 에러 코드
 * @returns 원인과 해결방법
 */
export function getErrorDetail(code: string): { cause: string; solution: string } | undefined {
  return NAVERPAY_ERROR_MESSAGES[code];
}

/**
 * 에러 응답을 사용자 친화적 메시지로 변환
 * @param code 에러 코드
 * @param originalMessage 원본 메시지
 * @returns 사용자 친화적 메시지
 */
export function formatErrorMessage(code: string, originalMessage: string): string {
  const detail = getErrorDetail(code);
  if (detail) {
    return `${originalMessage} (원인: ${detail.cause})`;
  }
  return originalMessage;
}

// ============================================================
// 에러 클래스
// ============================================================

export class NaverPayOrderError extends Error {
  public detail?: { cause: string; solution: string };

  constructor(
    public code: string,
    public override message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "NaverPayOrderError";
    this.detail = getErrorDetail(code);
  }

  /**
   * 사용자 친화적 메시지 반환
   */
  getUserMessage(): string {
    if (this.detail) {
      return `${this.message} (원인: ${this.detail.cause})`;
    }
    return this.message;
  }

  /**
   * 개발자용 상세 메시지 반환
   */
  getDebugMessage(): string {
    if (this.detail) {
      return `[${this.code}] ${this.message}\n원인: ${this.detail.cause}\n해결: ${this.detail.solution}`;
    }
    return `[${this.code}] ${this.message}`;
  }
}
