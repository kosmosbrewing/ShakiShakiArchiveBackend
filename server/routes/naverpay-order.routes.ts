// server/routes/naverpay-order.routes.ts
// 네이버페이 주문형 라우트
// 참고: 주문형 네이버페이 서비스 연동하기 V2.1 문서

import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, populateUser } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import { config } from "../config";
import { createLogger } from "../utils/logger";
import {
  SHIPPING,
  calculateShippingFee,
  isRemoteArea,
  RETURN_INFO,
  RETURN_SHIPPING_FEE,
} from "../constants";
import {
  registerOrder,
  buildProductInfoXml,
  buildAdditionalFeesXml,
  getNaverPayOrderSDKConfig,
  getErrorDetail,
  formatErrorMessage,
  type OrderRegisterRequest,
  type OrderProduct,
  type ProductInfoXml,
  type AdditionalFeeResponse,
  type SelectedItem,
  type OptionItemXml,
  type CombinationXml,
} from "../services/naverpay-order.service";
import { decodeBase64Url } from "../utils/naverpay-validators";
import {
  toNaverPayProductId,
  toNaverPayOptionCode,
  shortIdToUuid,
} from "../utils/shortId";

const router = Router();
const logger = createLogger("NaverPayOrder");

// ============================================================
// 미들웨어
// ============================================================

/**
 * 주문형 네이버페이 활성화 여부 확인
 */
function checkNaverPayOrderEnabled(_req: Request, res: Response, next: any) {
  if (!config.naverpayOrder.isEnabled) {
    return res.status(503).json({
      message: "네이버페이 주문형 서비스가 비활성화되어 있습니다",
    });
  }
  next();
}

// ============================================================
// 스키마 정의
// ============================================================

// 주문 등록 요청 스키마 (프론트엔드 형식 지원)
const orderRegisterSchema = z.object({
  // 주문 타입: PRODUCT (상품 상세에서 바로 구매), CART (장바구니)
  type: z.enum(["PRODUCT", "CART"]),
  // PRODUCT 타입일 때 필수
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive().optional().default(1),
  // CART 타입 (비회원용) - productId, variantId, quantity만 전달
  // 가격은 백엔드에서 DB 조회 (Hydration)
  cartItems: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional().nullable(),
    quantity: z.number().int().positive(),
  })).optional(),
  // 유입경로 쿠키값 (프론트에서 전달)
  cpaInflowCode: z.string().optional(),
  naverInflowCode: z.string().optional(),
  saClickId: z.string().optional(),
});

// ============================================================
// SDK 설정 API
// ============================================================

/**
 * 네이버페이 주문형 SDK 설정 조회
 * GET /api/naverpay-order/sdk-config
 */
router.get("/sdk-config", checkNaverPayOrderEnabled, (_req, res) => {
  const sdkConfig = getNaverPayOrderSDKConfig();

  logger.info("네이버페이 주문형 SDK 설정 반환", {
    mode: sdkConfig.mode,
    isEnabled: sdkConfig.isEnabled,
  });

  res.json(sdkConfig);
});

// ============================================================
// 주문 등록 API
// ============================================================

/**
 * 주문 등록 (구매하기 버튼 클릭 시)
 * POST /api/naverpay-order/register
 *
 * 프론트엔드에서 구매하기 버튼 클릭 시 호출
 * 상품 정보를 XML로 변환하여 네이버페이에 등록
 * 성공 시 주문서 페이지 URL 반환
 */
router.post(
  "/register",
  checkNaverPayOrderEnabled,
  populateUser, // 비회원도 접근 가능 (회원이면 userId 설정)
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session?.userId; // 비회원은 undefined

    // 요청 데이터 검증
    const validation = orderRegisterSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "요청 데이터가 올바르지 않습니다",
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { type, productId, variantId, quantity, cartItems, cpaInflowCode, naverInflowCode, saClickId } = validation.data;

    // 상품 목록 구성 (PRODUCT: 단일 상품, CART: 장바구니 전체)
    interface ProductItem {
      productId: string;
      variantId?: string | null;
      quantity: number;
    }
    let requestProducts: ProductItem[] = [];

    if (type === "PRODUCT") {
      // 상품 상세에서 바로 구매
      if (!productId) {
        return res.status(400).json({
          message: "상품 ID가 필요합니다",
        });
      }
      requestProducts = [{ productId, variantId, quantity: quantity || 1 }];
    } else if (type === "CART") {
      // 장바구니 전체 구매 (회원/비회원 분기)
      if (userId) {
        // 회원: DB에서 장바구니 조회
        const dbCartItems = await storage.getCartItems(userId);
        if (dbCartItems.length === 0) {
          return res.status(400).json({
            message: "장바구니가 비어있습니다",
          });
        }
        requestProducts = dbCartItems.map((item) => ({
          productId: item.productId,
          variantId: item.variantId || undefined,
          quantity: item.quantity,
        }));
      } else if (cartItems && cartItems.length > 0) {
        // 비회원: 프론트엔드에서 받은 cartItems 사용
        // (가격/상품명은 아래 루프에서 DB 조회 - Hydration)
        requestProducts = cartItems.map((item) => ({
          productId: item.productId,
          variantId: item.variantId || undefined,
          quantity: item.quantity,
        }));
        logger.info("비회원 네이버페이 주문", { itemCount: cartItems.length });
      } else {
        return res.status(400).json({
          message: "장바구니가 비어있습니다",
        });
      }
    }

    // 상품 정보 조회 및 변환
    const orderProducts: OrderProduct[] = [];
    let totalAmount = 0;

    for (const item of requestProducts) {
      // 상품 조회
      const product = await storage.getProduct(item.productId);
      if (!product) {
        return res.status(404).json({
          message: `상품을 찾을 수 없습니다: ${item.productId}`,
        });
      }

      // 상품 판매 가능 여부 확인
      if (!product.isAvailable) {
        return res.status(400).json({
          message: `판매 중지된 상품입니다: ${product.name}`,
        });
      }

      // 옵션(variant) 조회
      let variant = null;
      let optionPrice = 0;
      let optionManageCode = "";

      if (item.variantId) {
        variant = await storage.getProductVariant(item.variantId);
        if (!variant) {
          return res.status(404).json({
            message: `상품 옵션을 찾을 수 없습니다: ${item.variantId}`,
          });
        }

        // 재고 확인
        if (variant.stockQuantity < item.quantity) {
          return res.status(400).json({
            message: `재고가 부족합니다: ${product.name} (${variant.size || ""} ${variant.color || ""})`,
          });
        }

        // 옵션 추가 금액 계산
        if (variant.price) {
          optionPrice = parseFloat(variant.price);
        }
        // 네이버페이 옵션 관리 코드 (30자 제한)
        optionManageCode = toNaverPayOptionCode(variant.sku, variant.id);
      }

      const basePrice = parseFloat(product.price);
      const itemTotal = (basePrice + optionPrice) * item.quantity;
      totalAmount += itemTotal;

      // 상품 상세 페이지 URL (FRONTEND_URL 사용)
      const infoUrl = `${config.frontendUrl}/productDetail/${product.id}`;

      // 상품 이미지 URL
      const imageUrl = product.imageUrl || product.images?.[0] || "";

      // OrderProduct 생성 (네이버페이 상품ID 30자 제한 → UUID를 짧게 변환)
      const naverPayProductId = toNaverPayProductId(product.id);
      const orderProduct: OrderProduct = {
        id: naverPayProductId,
        ecMallProductId: naverPayProductId,
        name: product.name,
        basePrice,
        taxType: "TAX", // 과세 상품
        infoUrl,
        imageUrl,
        shippingPolicy: {
          groupId: "default", // 묶음배송 그룹
          method: "DELIVERY",
          feeType: totalAmount >= SHIPPING.FREE_THRESHOLD ? "CONDITIONAL_FREE" : "CHARGE",
          feePayType: "PREPAYED",
          feePrice: SHIPPING.FEE,
          conditionalFree: {
            basePrice: SHIPPING.FREE_THRESHOLD,
          },
          surchargeByArea: {
            // 네이버페이 권역별 추가배송비 사용
            splitUnit: 1,
            area2Price: SHIPPING.EXTRA_FEE, // 제주
            area3Price: SHIPPING.EXTRA_FEE, // 도서산간
          },
        },
      };

      // 옵션이 있는 경우
      if (variant) {
        // selectedItems 구성 (네이버페이 표 3-3 규격)
        // 사이즈와 색상을 각각 별도의 selectedItem으로 분리
        const selectedItems: SelectedItem[] = [];

        // valueId는 영문/숫자만 허용되므로, 한글인 경우 영문 prefix + 인덱스 사용
        // valueText에는 원본 한글값 유지
        if (variant.size) {
          // size가 영문/숫자면 그대로, 한글이면 SZ_ prefix 사용
          const sizeId = /^[a-zA-Z0-9!+\-\/=_|]+$/.test(variant.size)
            ? variant.size
            : `SZ_${variant.size.length}`;  // 한글은 ID로 사용 불가, 대체값 사용

          selectedItems.push({
            type: "SELECT",
            name: "사이즈",                    // 최대 20자
            valueId: sizeId,                  // 최대 50자, 영문/숫자만
            valueText: variant.size,          // 최대 50자, 원본값
          });
        }

        if (variant.color) {
          // color가 영문/숫자면 그대로, 한글이면 CL_ prefix 사용
          const colorId = /^[a-zA-Z0-9!+\-\/=_|]+$/.test(variant.color)
            ? variant.color
            : `CL_${variant.color.length}`;  // 한글은 ID로 사용 불가, 대체값 사용

          selectedItems.push({
            type: "SELECT",
            name: "색상",                      // 최대 20자
            valueId: colorId,                 // 최대 50자, 영문/숫자만
            valueText: variant.color,         // 최대 50자, 원본값
          });
        }

        // selectedItems가 비어있으면 기본 옵션 추가
        if (selectedItems.length === 0) {
          const optionName = [variant.size, variant.color].filter(Boolean).join(" / ") || "옵션";
          selectedItems.push({
            type: "SELECT",
            name: "옵션",
            valueId: optionManageCode,        // manageCode는 이미 영문/숫자
            valueText: optionName,
          });
        }

        orderProduct.option = [
          {
            optionManageCode,
            quantity: item.quantity,
            optionPrice,
            selectedItems,
          },
        ];

        logger.info("옵션 상품 설정", {
          productId: product.id,
          variantId: variant.id,
          optionManageCode,
          quantity: item.quantity,
          optionPrice,
          selectedItems,
        });
      } else {
        // 단일 상품 (옵션 없음) - 네이버페이 v2.0+에서는 XML 생성 시 기본 옵션으로 변환됨
        orderProduct.single = {
          quantity: item.quantity,
        };
        logger.info("단일 상품 설정", {
          productId: product.id,
          quantity: item.quantity,
        });
      }

      orderProducts.push(orderProduct);
    }

    // 뒤로가기 URL (FRONTEND_URL/cart 사용)
    const backUrl = `${config.frontendUrl}/cart`;

    // 주문 등록 요청
    const registerRequest: OrderRegisterRequest = {
      merchantId: config.naverpayOrder.merchantId,
      certiKey: config.naverpayOrder.certiKey,
      products: orderProducts,
      backUrl,
      interface: {
        cpaInflowCode,
        naverInflowCode,
        saClickId,
        merchantCustomCode1: userId || "guest", // 사용자 ID 저장 (비회원은 "guest")
      },
    };

    const result = await registerOrder(registerRequest);

    if (result.code !== "Success" || !result.body?.orderId || !result.body?.merchantNo) {
      const errorDetail = getErrorDetail(result.code);

      logger.error("주문 등록 실패", {
        code: result.code,
        message: result.message,
        detail: errorDetail,
      });

      return res.status(400).json({
        message: formatErrorMessage(result.code, result.message || "주문 등록에 실패했습니다"),
        code: result.code,
        // 개발 환경에서만 상세 정보 포함
        ...(process.env.NODE_ENV !== "production" && errorDetail && {
          debug: {
            cause: errorDetail.cause,
            solution: errorDetail.solution,
          },
        }),
      });
    }

    // User-Agent로 PC/Mobile 구분
    const userAgent = req.headers["user-agent"] || "";
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

    // 주문서 페이지 URL 생성 (응답에서 받은 orderId와 merchantNo 사용)
    // 형식: https://test-order.pay.naver.com/customer/buy/{orderId}/{merchantNo}
    const { orderId, merchantNo } = result.body;
    const baseUrl = config.naverpayOrder.mode === "production"
      ? (isMobile ? "https://m.pay.naver.com/o/customer/buy" : "https://order.pay.naver.com/customer/buy")
      : (isMobile ? "https://test-m.pay.naver.com/o/customer/buy" : "https://test-order.pay.naver.com/customer/buy");
    const orderPageUrl = `${baseUrl}/${orderId}/${merchantNo}`;

    logger.info("주문 등록 성공", {
      orderId,
      merchantNo,
      orderPageUrl,
      userId,
      productCount: orderProducts.length,
      totalAmount,
      isMobile,
    });

    // 프론트엔드 타입에 맞게 응답 (tempOrderId 사용)
    res.json({
      message: "주문이 등록되었습니다",
      tempOrderId: result.body.orderId,
      orderPageUrl, // 추가 정보
    });
  })
);

// ============================================================
// 상품정보 XML API (네이버페이가 호출)
// ============================================================

/**
 * 상품정보 XML 조회
 * GET /api/naverpay-order/product-info
 *
 * 네이버페이가 비주기적으로 호출하여 상품 정보 확인
 * 쿼리 파라미터: product[0][id]=xxx&product[1][id]=yyy
 */
router.get(
  "/product-info",
  asyncHandler(async (req: Request, res: Response) => {
    // ========== 디버그: 요청 전체 로깅 ==========
    console.log("\n" + "=".repeat(80));
    console.log("[상품정보 API] REQUEST RECEIVED");
    console.log("=".repeat(80));
    console.log("URL:", req.originalUrl);
    console.log("Query (raw):", JSON.stringify(req.query, null, 2));
    console.log("Headers:", JSON.stringify(req.headers, null, 2));
    console.log("=".repeat(80));

    // 쿼리 파라미터에서 상품 ID 추출
    // product[0][id]=xxx&product[1][id]=yyy 형식
    const productIds: string[] = [];
    const optionCodes: Map<string, string[]> = new Map();

    // optionSearch, supplementSearch 파라미터 (가이드 표 3-7)
    const optionSearch = req.query.optionSearch === "true";
    const supplementSearch = req.query.supplementSearch === "true";

    // 쿼리 파라미터 파싱
    for (const [key, value] of Object.entries(req.query)) {
      // product[0][id] 형식 파싱
      const idMatch = key.match(/^product\[(\d+)\]\[id\]$/);
      if (idMatch && typeof value === "string") {
        productIds.push(value);
        console.log(`[상품정보 API] 상품 ID 파싱: ${key} = ${value}`);
      }

      // product[0][optionManageCodes] 형식 파싱
      const optionMatch = key.match(/^product\[(\d+)\]\[optionManageCodes\]$/);
      if (optionMatch && typeof value === "string") {
        const index = parseInt(optionMatch[1], 10);
        const productId = productIds[index];
        if (productId) {
          optionCodes.set(productId, value.split(","));
        }
      }
    }

    console.log(`[상품정보 API] 파싱된 상품 ID 목록: [${productIds.join(", ")}]`);

    if (productIds.length === 0) {
      console.log("[상품정보 API] ERROR: 상품 ID가 없음!");
      return res.status(400).send("상품 ID가 필요합니다");
    }

    logger.info("상품정보 XML 요청", {
      productIds,
      optionCodes: Object.fromEntries(optionCodes),
      optionSearch,
      supplementSearch,
    });

    // 상품 정보 조회
    const productsInfo: ProductInfoXml[] = [];

    for (const shortProductId of productIds) {
      console.log(`\n[상품정보 API] 상품 처리 시작: shortId=${shortProductId}`);

      // 짧은 ID를 UUID로 변환 (네이버페이는 우리가 등록한 짧은 ID로 호출)
      let productId: string;
      try {
        productId = shortIdToUuid(shortProductId);
        console.log(`[상품정보 API] ID 변환 성공: ${shortProductId} → ${productId}`);
      } catch (e) {
        // 변환 실패 시 원본 ID 사용 (하위 호환)
        productId = shortProductId;
        console.log(`[상품정보 API] ID 변환 실패, 원본 사용: ${productId}`, e);
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        console.log(`[상품정보 API] ERROR: 상품을 찾을 수 없음! productId=${productId}`);
        logger.warn("상품을 찾을 수 없음", { productId, shortProductId });
        continue;
      }
      console.log(`[상품정보 API] 상품 조회 성공: ${product.name} (isAvailable=${product.isAvailable})`);

      // 상품 옵션(variant) 조회
      const variants = await storage.getProductVariants(productId);

      // 상품 상태 결정 (가이드 표 3-8: ON_SALE, SOLD_OUT, NOT_SALE)
      let status: "ON_SALE" | "SOLD_OUT" | "NOT_SALE" = "ON_SALE";
      if (!product.isAvailable) {
        status = "NOT_SALE";
      } else {
        // 재고 확인 (variant가 있으면 variant 재고, 없으면 판매 가능)
        const totalStock = variants.reduce(
          (sum, v) => sum + (v.stockQuantity || 0),
          0
        );
        if (variants.length > 0 && totalStock === 0) {
          status = "SOLD_OUT";
        }
      }

      // 네이버페이에 응답할 때도 짧은 ID 사용
      const naverPayProductId = toNaverPayProductId(product.id);
      const productInfo: ProductInfoXml = {
        id: naverPayProductId,
        ecMallProductId: naverPayProductId,
        name: product.name,
        basePrice: parseFloat(product.price),
        taxType: "TAX",
        infoUrl: `${config.frontendUrl}/productDetail/${product.id}`,
        imageUrl: product.imageUrl || product.images?.[0] || "",
        status,
        stockQuantity: variants.reduce((sum, v) => sum + (v.stockQuantity || 0), 0),
        optionSupport: variants.length > 0,
        supplementSupport: false,
        returnShippingFee: RETURN_SHIPPING_FEE.RETURN,
        exchangeShippingFee: RETURN_SHIPPING_FEE.EXCHANGE,
        returnInfo: RETURN_INFO,
        shippingPolicy: {
          groupId: "default",
          method: "DELIVERY",
          feeType: "CONDITIONAL_FREE",
          feePayType: "PREPAYED",
          feePrice: SHIPPING.FEE,
          conditionalFree: {
            basePrice: SHIPPING.FREE_THRESHOLD,
          },
          surchargeByArea: {
            apiSupport: true,   // 도서산간 API 활성화 (네이버페이가 additional-fee API 호출)
            splitUnit: 1,
            area2Price: SHIPPING.EXTRA_FEE,  // 제주 추가배송비
            area3Price: SHIPPING.EXTRA_FEE,  // 도서산간 추가배송비
          },
        },
      };

      // 옵션 정보 추가 (표 3-10 규격: optionItem + combination 구조)
      if (variants.length > 0) {
        // 한글 → 영문 ID 변환 헬퍼 (상품정보 API에서는 ID와 text가 동일해야 네이버페이가 매칭함)
        // 하지만 ID는 영문/숫자만 허용되므로, 한글인 경우 인덱스 기반 ID 생성
        const sizeIdMap = new Map<string, string>();  // 원본값 → 영문ID
        const colorIdMap = new Map<string, string>(); // 원본값 → 영문ID
        let sizeIdx = 0;
        let colorIdx = 0;

        // 1. 옵션 항목 수집 (사이즈, 색상별 고유값)
        const sizeValues = new Map<string, boolean>(); // 원본값 → status
        const colorValues = new Map<string, boolean>();

        for (const v of variants) {
          const isAvailable = (v.stockQuantity || 0) > 0;

          if (v.size) {
            // ID 매핑 생성 (한글이면 SZ_0, SZ_1 형태)
            if (!sizeIdMap.has(v.size)) {
              const id = /^[a-zA-Z0-9!+\-\/=_|]+$/.test(v.size)
                ? v.size
                : `SZ_${sizeIdx++}`;
              sizeIdMap.set(v.size, id);
            }

            // 이미 있고 구매 가능한 것은 유지
            const existing = sizeValues.get(v.size);
            if (existing === undefined || !existing) {
              sizeValues.set(v.size, isAvailable);
            }
          }
          if (v.color) {
            // ID 매핑 생성 (한글이면 CL_0, CL_1 형태)
            if (!colorIdMap.has(v.color)) {
              const id = /^[a-zA-Z0-9!+\-\/=_|]+$/.test(v.color)
                ? v.color
                : `CL_${colorIdx++}`;
              colorIdMap.set(v.color, id);
            }

            const existing = colorValues.get(v.color);
            if (existing === undefined || !existing) {
              colorValues.set(v.color, isAvailable);
            }
          }
        }

        // 2. optionItems 생성
        const optionItems: OptionItemXml[] = [];

        if (sizeValues.size > 0) {
          optionItems.push({
            type: "SELECT",
            name: "사이즈",
            values: Array.from(sizeValues.entries()).map(([text, status]) => ({
              id: sizeIdMap.get(text) || text,  // 매핑된 영문 ID 사용
              text,                              // 원본 한글값
              status,
            })),
          });
        }

        if (colorValues.size > 0) {
          optionItems.push({
            type: "SELECT",
            name: "색상",
            values: Array.from(colorValues.entries()).map(([text, status]) => ({
              id: colorIdMap.get(text) || text,  // 매핑된 영문 ID 사용
              text,                               // 원본 한글값
              status,
            })),
          });
        }

        // 3. combinations 생성 (각 variant가 하나의 조합)
        const combinations: CombinationXml[] = variants.map((v) => {
          const options: Array<{ name: string; id: string }> = [];

          if (v.size) {
            options.push({
              name: "사이즈",
              id: sizeIdMap.get(v.size) || v.size,  // 매핑된 영문 ID 사용
            });
          }
          if (v.color) {
            options.push({
              name: "색상",
              id: colorIdMap.get(v.color) || v.color,  // 매핑된 영문 ID 사용
            });
          }

          return {
            manageCode: toNaverPayOptionCode(v.sku, v.id),
            price: v.price ? parseFloat(v.price) : 0,
            stockQuantity: v.stockQuantity || 0,
            status: (v.stockQuantity || 0) > 0,
            options,
          };
        });

        // optionSearch=true일 때만 옵션 정보 포함 (가이드 표 3-7)
        if (optionSearch) {
          // 옵션이 있으면 새 규격 사용
          if (optionItems.length > 0) {
            productInfo.optionItems = optionItems;
            productInfo.combinations = combinations;
          } else {
            // 사이즈/색상이 모두 없는 경우 레거시 형식 사용 (하위 호환)
            productInfo.options = variants.map((v) => ({
              optionManageCode: toNaverPayOptionCode(v.sku, v.id),
              optionName: [v.size, v.color].filter(Boolean).join(" / ") || "기본",
              optionPrice: v.price ? parseFloat(v.price) : 0,
              stockQuantity: v.stockQuantity || 0,
              status:
                (v.stockQuantity || 0) > 0 ? ("ON_SALE" as const) : ("SOLD_OUT" as const),
            }));
          }
        }
      }

      productsInfo.push(productInfo);
    }

    // XML 응답 생성
    const xml = buildProductInfoXml(productsInfo);

    // ========== 디버그: 응답 로깅 ==========
    console.log("\n" + "=".repeat(80));
    console.log("[상품정보 API] RESPONSE");
    console.log("=".repeat(80));
    console.log(`상품 수: ${productsInfo.length}`);
    if (productsInfo.length === 0) {
      console.log("WARNING: 반환할 상품이 없음! (네이버페이에서 '상품정보 조회 실패' 오류 발생)");
    }
    console.log("-".repeat(80));
    console.log("XML Response:");
    console.log("-".repeat(80));
    console.log(xml);
    console.log("=".repeat(80) + "\n");

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.send(xml);
  })
);

// ============================================================
// 도서산간비 API (네이버페이가 호출)
// ============================================================

/**
 * 도서산간 추가배송비 조회
 * GET /api/naverpay-order/additional-fee
 *
 * 네이버페이가 배송지 입력 시 호출
 * 쿼리: productId[0]=xxx&productId[1]=yyy&zipcode=12345&address1=base64encoded
 */
router.get(
  "/additional-fee",
  asyncHandler(async (req: Request, res: Response) => {
    const { zipcode, address1: address1Encoded } = req.query;

    // 상품 ID 추출
    const productIds: string[] = [];
    for (const [key, value] of Object.entries(req.query)) {
      const match = key.match(/^productId\[(\d+)\]$/);
      if (match && typeof value === "string") {
        productIds.push(value);
      }
    }

    if (!zipcode || typeof zipcode !== "string") {
      return res.status(400).send("우편번호가 필요합니다");
    }

    // address1 base64url 디코딩 (네이버페이는 주소를 base64url로 인코딩해서 전달)
    let address1 = "";
    if (address1Encoded && typeof address1Encoded === "string") {
      address1 = decodeBase64Url(address1Encoded);
    }

    logger.info("도서산간비 API 요청", {
      productIds,
      zipcode,
      address1Encoded,
      address1,  // 디코딩된 주소
    });

    // 도서산간 여부 확인 및 추가 배송비 계산
    const additionalFees: AdditionalFeeResponse[] = [];

    for (const shortProductId of productIds) {
      // 네이버페이가 보내는 짧은 ID 그대로 응답에 사용
      const productId = shortProductId;
      let additionalFee = 0;

      // 우편번호로 도서산간 여부 판단
      // isRemoteArea 함수 사용 (shared/constants에서 가져옴)
      if (isRemoteArea(zipcode)) {
        // 제주 지역 (63으로 시작)
        if (zipcode.startsWith("63")) {
          additionalFee = SHIPPING.EXTRA_FEE;
        } else {
          // 기타 도서산간
          additionalFee = SHIPPING.EXTRA_FEE;
        }
      }

      additionalFees.push({
        id: productId,
        surprice: additionalFee,
      });
    }

    // XML 응답 생성
    const xml = buildAdditionalFeesXml(additionalFees);

    logger.info("도서산간비 응답", {
      productCount: productIds.length,
      fees: additionalFees,
    });

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.send(xml);
  })
);

// ============================================================
// 찜하기 API
// ============================================================

/**
 * 찜하기 등록
 * POST /api/naverpay-order/wishlist
 *
 * 네이버페이 찜 버튼 클릭 시 호출
 */
router.post(
  "/wishlist",
  checkNaverPayOrderEnabled,
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        message: "상품 ID가 필요합니다",
      });
    }

    // 상품 조회
    const product = await storage.getProduct(productId);
    if (!product) {
      return res.status(404).json({
        message: "상품을 찾을 수 없습니다",
      });
    }

    // 위시리스트에 추가
    try {
      await storage.addWishlistItem(userId, productId);
      logger.info("네이버페이 찜하기 성공", { userId, productId });

      res.json({
        success: true,
        message: "찜 목록에 추가되었습니다",
      });
    } catch (error) {
      // 이미 찜한 상품인 경우
      logger.warn("이미 찜한 상품", { userId, productId });
      res.json({
        success: true,
        message: "이미 찜 목록에 있는 상품입니다",
      });
    }
  })
);

export default router;
