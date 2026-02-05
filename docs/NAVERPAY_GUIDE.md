# 네이버페이 가맹점 연동 개발 가이드

> **원본**: 네이버페이 가맹점 연동 가이드 v2.1 (87p)
> **목적**: Node.js(Express) 기반 가맹점 개발 시 필수 참조 문서
> **최종 검증**: 2025-02-05 (PDF 원본 전수 대조)

---

## 0. 환경변수 설정 (.env)

네이버페이 연동에 필요한 인증키는 총 4종이며, 모두 네이버페이센터에서 가맹점 가입 승인 시 발급된다.

### 0.1 `.env` 파일

```env
# ── 서버 전용 (절대 프론트엔드 노출 금지) ──
NAVERPAY_MERCHANT_ID=your_merchant_id      # 상점 ID
NAVERPAY_CERTI_KEY=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX  # 연동 인증키
NAVERPAY_MODE=test                          # test | production

# ── 프론트엔드 전달용 (공개키 성격) ──
NAVERPAY_BUTTON_KEY=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX  # 버튼 인증키
NAVERPAY_WCS_ACCOUNT_ID=s_XXXXXXXXX        # 유입경로 추적 Account ID (선택)
```

### 0.2 각 값의 XML/JS 삽입 위치

| 환경변수         | 삽입 위치                                                  | 노출 범위        |
| ---------------- | ---------------------------------------------------------- | ---------------- |
| `MERCHANT_ID`    | 주문등록 XML `<order><merchantId>`, 찜 API POST `SHOP_ID`  | 서버 전용        |
| `CERTI_KEY`      | 주문등록 XML `<order><certiKey>`, 찜 API POST `CERTI_KEY`  | ⚠️ **서버 전용** |
| `BUTTON_KEY`     | 프론트엔드 JS `naver.NaverPayButton.apply({ BUTTON_KEY })` | 공개             |
| `WCS_ACCOUNT_ID` | 프론트엔드 JS `wcs_add["wa"]`                              | 공개             |

### 0.3 주문등록 XML 내 위치

```xml
<order>
  <merchantId>${NAVERPAY_MERCHANT_ID}</merchantId>   <!-- ★ 서버에서 주입 -->
  <certiKey>${NAVERPAY_CERTI_KEY}</certiKey>          <!-- ★ 서버에서 주입 -->
  <product>...</product>
  <backUrl>...</backUrl>
</order>
```

### 0.4 찜 API POST body 내 위치

```
SHOP_ID=${NAVERPAY_MERCHANT_ID}    <!-- ★ 같은 상점 ID -->
CERTI_KEY=${NAVERPAY_CERTI_KEY}    <!-- ★ 같은 인증키 -->
ITEM_ID=...
ITEM_NAME=...
```

### 0.5 프론트엔드 JS 내 위치

```javascript
// 버튼 렌더링 (BUTTON_KEY)
naver.NaverPayButton.apply({
  BUTTON_KEY: "${NAVERPAY_BUTTON_KEY}", // ★ API로 전달받거나 SSR 주입
  TYPE: "E",
  COLOR: 1,
  COUNT: 2,
  ENABLE: "Y",
  "": "",
});

// 유입경로 추적 (WCS_ACCOUNT_ID) — 선택
wcs_add["wa"] = "${NAVERPAY_WCS_ACCOUNT_ID}"; // ★
```

### 0.6 엔드포인트 URL 분기

```javascript
// Express에서 환경별 URL 분기
const NAVERPAY_API_URL =
  process.env.NAVERPAY_MODE === "production"
    ? "https://api.pay.naver.com/o/customer/api/order/v20/register"
    : "https://test-api.pay.naver.com/o/customer/api/order/v20/register";

const NAVERPAY_WISHLIST_URL =
  process.env.NAVERPAY_MODE === "production"
    ? "https://pay.naver.com/customer/api/wishlist.nhn"
    : "https://test-pay.naver.com/customer/api/wishlist.nhn";
```

> **상품정보 API**(`<products>` 응답)에는 인증키가 포함되지 않는다.
> 네이버페이 서버가 가맹점 URL을 직접 호출하므로, 네이버페이센터에 등록한 URL 자체가 인증 역할을 한다.

---

## 1. 연동 구조 전체 흐름

```
[사용자] → [가맹점 사이트] → [네이버페이 서버]

① 구매 흐름 (가맹점 → 네이버페이)
   사용자가 [구매하기] 클릭
   → 가맹점이 주문 XML POST → 네이버페이 주문등록 API
   → 인증키 수신
   → 네이버페이 주문서 팝업 오픈

② 상품 정보 흐름 (네이버페이 → 가맹점)
   네이버페이 서버가 가맹점 URL로 HTTP GET 요청
   → 가맹점이 상품 정보 XML 응답
   → 네이버페이가 유효성 검증 후 주문 진행

③ 도서산간비 흐름 (네이버페이 → 가맹점)
   사용자가 배송지 입력 시
   → 네이버페이가 가맹점 URL로 HTTP GET 요청
   → 가맹점이 추가배송비 XML 응답
```

---

## 2. 주문 정보 등록 API (3.1.2절)

### 2.1 엔드포인트

| 환경   | URL                                                                |
| ------ | ------------------------------------------------------------------ |
| 테스트 | `https://test-api.pay.naver.com/o/customer/api/order/v20/register` |
| 서비스 | `https://api.pay.naver.com/o/customer/api/order/v20/register`      |

- **Method**: POST
- **Content-Type**: `application/xml; charset=utf-8`
- **Response**: 인증키 (영문+숫자, 최대 19자리)

### 2.2 XML 루트 구조

```xml
<?xml version="1.0" encoding="utf-8"?>
<order>
  <merchantId>상점ID</merchantId>
  <certiKey>인증키</certiKey>
  <product>...</product>
  <backUrl>이전페이지URL</backUrl>
  <interface>...</interface>
</order>
```

> ⚠️ **주문등록 루트 태그는 `<order>`** (상품정보 API의 `<products>`와 다름)

### 2.3 product 필수/선택 요소 (표 3-2)

| 요소                        |  필수  | 설명                   | 제약사항                                                |
| --------------------------- | :----: | ---------------------- | ------------------------------------------------------- |
| `product/id`                |   Y    | 상품 번호              | 최대 30자, 영문+숫자+특수문자(`!+-/=_\|`), 공백 불가    |
| `product/merchantProductId` |   N    | 판매자 상품 번호       | 최대 100자                                              |
| `product/ecMallProductId`   |   N    | 네이버쇼핑 EP mall_pid | 네이버쇼핑 가맹점이면 필수                              |
| `product/name`              |   Y    | 상품 이름              | 최대 100자                                              |
| `product/basePrice`         |   Y    | 본상품 판매가          | 1 이상                                                  |
| `product/taxType`           |   N    | 과세 종류              | `TAX`(기본) / `TAX_FREE` / `ZERO_TAX`                   |
| `product/infoUrl`           |   Y    | 상품 상세 페이지 URL   | 유효한 URL 필수                                         |
| `product/imageUrl`          |   Y    | 상품 원본 이미지 URL   | 유효한 URL 필수                                         |
| `product/giftName`          |   N    | 사은품명               | 최대 200자                                              |
| `product/single/quantity`   | 조건부 | 단일상품 주문수량      | 옵션 없는 본상품이면 필수, 1 이상. **옵션과 공존 불가** |
| `product/option`            |   N    | 옵션 상품 정보         | 조합 수만큼 반복, **single과 공존 불가**                |
| `product/shippingPolicy`    |   Y    | 배송비 정책            | 상품마다 필수                                           |
| `product/supplement`        |   N    | 추가 상품 정보         | 구매 추가상품 수만큼 반복                               |
| `backUrl`                   |   Y    | 이전 페이지 URL        | 필수                                                    |

### 2.4 option 상세 (표 3-3) — 주문등록용

```xml
<option>
  <quantity>1</quantity>                    <!-- Y: 주문수량, 1 이상 -->
  <price>1000</price>                       <!-- N: 옵션 추가금액 (manageCode 있을 때만) -->
  <manageCode>R_S</manageCode>              <!-- N: 옵션 조합 관리코드 -->
  <selectedItem>                            <!-- Y: 옵션 종류만큼 반복 -->
    <type>SELECT</type>                     <!-- Y: SELECT 또는 INPUT -->
    <name>색상</name>                       <!-- Y: 최대 20자 -->
    <value>
      <id>R</id>                            <!-- Y: 최대 50자 (INPUT 시 생략) -->
      <text>빨강</text>                     <!-- Y: 최대 50자 -->
    </value>
  </selectedItem>
</option>
```

**핵심 규칙**:

- `option/price`: `-(basePrice의 50%)` 이상만 가능 (예: basePrice 10,000원 → -5,000 이상)
- `option/price`: manageCode가 없으면 이 값도 없어야 함
- `option/manageCode`: 최대 100자, 선택형 옵션 포함 시에만 사용
- INPUT 타입은 `value/id` 생략, `value/text`만 전송
- `selectedItem/name`: **최대 20자** (초과 시 에러)

### 2.5 shippingPolicy 상세 (표 3-4)

| 요소                        |  필수  | 설명                                                                             |
| --------------------------- | :----: | -------------------------------------------------------------------------------- |
| `groupId`                   |   N    | 배송비 묶음 그룹 ID                                                              |
| `method`                    |   N    | `DELIVERY`(기본) / `QUICK_SVC` / `DIRECT_DELIVERY` / `VISIT_RECEIPT` / `NOTHING` |
| `feeType`                   |   Y    | `FREE` / `CHARGE` / `CONDITIONAL_FREE` / `CHARGE_BY_QUANTITY`                    |
| `feePayType`                |   Y    | `FREE` / `PREPAYED` / `CASH_ON_DELIVERY`                                         |
| `feePrice`                  |   Y    | 0~200,000. FREE이거나 착불일 때만 0 허용                                         |
| `conditionalFree/basePrice` | 조건부 | feeType=CONDITIONAL_FREE 시 필수                                                 |
| `chargeByQuantity/type`     | 조건부 | feeType=CHARGE_BY_QUANTITY 시 필수. `REPEAT` / `RANGE`                           |
| `surchargeByArea`           |   N    | **사용 안 하면 요소 자체를 제거**                                                |

**배송 방법 자동 처리**:

- `QUICK_SVC`: 묶음불가, 유형=유료, 결제=착불, 금액=빈값
- `VISIT_RECEIPT`: 묶음불가, 유형=무료
- `NOTHING`: 묶음불가, 유형=무료

### 2.6 supplement 상세 (표 3-5)

```xml
<supplement>
  <id>SP001</id>           <!-- Y: 최대 50자 -->
  <name>사탕 10개</name>    <!-- Y: 최대 50자 -->
  <price>3000</price>      <!-- N: 기본 0, 0 이상 -->
  <quantity>1</quantity>   <!-- Y: 1 이상 -->
</supplement>
```

### 2.7 기타 요소

| 요소                        | 필수 | 설명                                       |
| --------------------------- | :--: | ------------------------------------------ |
| `interface/salesCode`       |  N   | 경로별 매출코드, 최대 300자                |
| `interface/cpaInflowCode`   |  N   | 네이버쇼핑 CPA 코드 (쿠키 CPAValidator 값) |
| `interface/naverInflowCode` |  N   | 네이버 서비스 유입경로 (쿠키 NA_CO 값)     |
| `interface/saClickId`       |  N   | 네이버 검색광고 CLICK ID (NVADID)          |
| `merchantCustomCode1`       |  N   | 가맹점 임의 필드, UTF8 300바이트           |
| `merchantCustomCode2`       |  N   | 가맹점 임의 필드, UTF8 300바이트           |
| `mcstCultureBenefitYn`      |  N   | 도서공연비 소득공제 대상 시 `true`         |

### 2.8 주문등록 XML 완성 예시

#### 본상품 (옵션 없음, 추가상품 있음)

```xml
<?xml version="1.0" encoding="utf-8"?>
<order>
  <product>
    <id>P002</id>
    <merchantProductId>P002</merchantProductId>
    <name>노트북</name>
    <basePrice>500000</basePrice>
    <infoUrl>https://mydomain.com/product/P002</infoUrl>
    <imageUrl>https://mydomain.com/images/P002.jpg</imageUrl>
    <taxType>TAX</taxType>
    <single>
      <quantity>2</quantity>
    </single>
    <supplement>
      <id>SP002</id>
      <name>마우스</name>
      <quantity>1</quantity>
      <price>10000</price>
    </supplement>
    <shippingPolicy>
      <groupId>10000</groupId>
      <method>DELIVERY</method>
      <feePayType>PREPAYED</feePayType>
      <feeType>CHARGE</feeType>
      <feePrice>2500</feePrice>
    </shippingPolicy>
  </product>
  <merchantId>상점ID</merchantId>
  <certiKey>인증키</certiKey>
  <backUrl>https://mydomain.com/cart</backUrl>
</order>
```

#### 조합형 옵션 (+입력형 옵션, +추가상품)

```xml
<?xml version="1.0" encoding="utf-8"?>
<order>
  <product>
    <id>P001</id>
    <name>티셔츠</name>
    <basePrice>1000</basePrice>
    <infoUrl>https://mydomain.com/product/P001</infoUrl>
    <imageUrl>https://mydomain.com/images/P001.jpg</imageUrl>
    <taxType>TAX</taxType>
    <!-- 옵션 조합 1: 빨강/S -->
    <option>
      <quantity>1</quantity>
      <price>1000</price>
      <manageCode>R_S</manageCode>
      <selectedItem>
        <type>SELECT</type>
        <name>색상</name>
        <value><id>R</id><text>빨강</text></value>
      </selectedItem>
      <selectedItem>
        <type>SELECT</type>
        <name>사이즈</name>
        <value><id>S</id><text>S</text></value>
      </selectedItem>
    </option>
    <!-- 옵션 조합 2: 파랑/L -->
    <option>
      <quantity>2</quantity>
      <price>0</price>
      <manageCode>B_L</manageCode>
      <selectedItem>
        <type>SELECT</type>
        <name>색상</name>
        <value><id>B</id><text>파랑</text></value>
      </selectedItem>
      <selectedItem>
        <type>SELECT</type>
        <name>사이즈</name>
        <value><id>L</id><text>L</text></value>
      </selectedItem>
    </option>
    <supplement>
      <id>SP001</id>
      <name>목걸이</name>
      <price>500</price>
      <quantity>1</quantity>
    </supplement>
    <shippingPolicy>
      <groupId>10000</groupId>
      <method>DELIVERY</method>
      <feePayType>PREPAYED</feePayType>
      <feeType>CHARGE</feeType>
      <feePrice>2500</feePrice>
    </shippingPolicy>
  </product>
  <merchantId>상점ID</merchantId>
  <certiKey>인증키</certiKey>
  <backUrl>https://mydomain.com/cart</backUrl>
</order>
```

---

## 3. 상품 정보 API (3.2절) ⭐ 핵심

> 네이버페이 서버가 가맹점에 **HTTP GET**으로 요청. 가맹점은 **XML로 응답**.
> 찜 목록에서 직접 주문 시 이 API로만 상품 정보를 가져옴.

### 3.1 요청 형식 (표 3-7)

```
GET /가맹점페이지?product[0][id]=P001&product[0][optionManageCodes]=R_S,B_M&product[1][id]=P002&product[1][supplementIds]=SP002&supplementSearch=true&optionSearch=true
```

| 파라미터                        | 필수 | 설명                                     |
| ------------------------------- | :--: | ---------------------------------------- |
| `product[N][id]`                |  Y   | 상품 번호 (복수 가능)                    |
| `product[N][ecmallproductId]`   |  N   | 네이버쇼핑 EP mall_pid (id 없을 시 필수) |
| `product[N][optionManageCodes]` |  N   | 조합 옵션 관리코드 (콤마 구분)           |
| `product[N][supplementIds]`     |  N   | 추가상품 코드 (콤마 구분)                |
| `optionSearch`                  |  N   | 옵션 조회 여부 (기본 false)              |
| `supplementSearch`              |  N   | 추가상품 조회 여부 (기본 false)          |

### 3.2 응답 XML 구조

```xml
<?xml version="1.0" encoding="utf-8"?>
<products>
  <product>
    <!-- 필수 기본 정보 -->
    <id>P001</id>
    <name>티셔츠</name>
    <basePrice>1000</basePrice>
    <infoUrl>https://mydomain.com/product/P001</infoUrl>
    <imageUrl>https://mydomain.com/images/P001.jpg</imageUrl>

    <!-- 선택 정보 -->
    <merchantProductId>P001</merchantProductId>
    <ecMallProductId>6194974972</ecMallProductId>
    <taxType>TAX</taxType>
    <giftName>사은품명</giftName>
    <stockQuantity>100</stockQuantity>
    <status>ON_SALE</status>
    <supplementSupport>false</supplementSupport>
    <optionSupport>true</optionSupport>
    <returnShippingFee>2500</returnShippingFee>
    <exchangeShippingFee>5000</exchangeShippingFee>

    <!-- 반품주소 (선택) -->
    <returnInfo>...</returnInfo>

    <!-- 배송정책 (필수) -->
    <shippingPolicy>...</shippingPolicy>

    <!-- 옵션 (optionSearch=true 시) -->
    <option>...</option>

    <!-- 추가상품 (supplementSearch=true 시) -->
    <supplement>...</supplement>
  </product>
</products>
```

> ⚠️ **루트 태그: `<products>`** (주문등록의 `<order>`와 다름!)
> ⚠️ **Content-Type: `application/xml; charset=utf-8`** (JSON이나 text/html 불가)

### 3.3 주문등록 vs 상품정보 — 결정적 차이점

| 구분                    | 주문등록 API                 | 상품정보 API                                                    |
| ----------------------- | ---------------------------- | --------------------------------------------------------------- |
| 방향                    | 가맹점 → 네이버페이          | 네이버페이 → 가맹점                                             |
| 루트 태그               | `<order>`                    | `<products>`                                                    |
| 옵션 태그               | `<selectedItem>`             | `<optionItem>`                                                  |
| 옵션 구조               | 사용자가 **선택한** 옵션만   | **전체** 옵션 목록                                              |
| 조합 정보               | `<manageCode>` (option 하위) | `<combination>` (별도 블록)                                     |
| 추가 필드               | —                            | `stockQuantity`, `status`, `optionSupport`, `supplementSupport` |
| `merchantId`/`certiKey` | 포함                         | 미포함                                                          |

### 3.4 상품정보 option 구조 (표 3-10) — 주문등록과 완전히 다름

```xml
<option>
  <!-- 1. 옵션 항목 (전체 목록) -->
  <optionItem>
    <type>SELECT</type>
    <name>색상</name>
    <value>
      <id>R</id>
      <text>빨강</text>
      <status>true</status>    <!-- 선택: 기본 true, false면 구매불가 -->
    </value>
    <value>
      <id>B</id>
      <text>파랑</text>
    </value>
    <value>
      <id>Y</id>
      <text>노랑</text>
    </value>
  </optionItem>
  <optionItem>
    <type>SELECT</type>
    <name>사이즈</name>
    <value><id>S</id><text>S</text></value>
    <value><id>M</id><text>M</text></value>
    <value><id>L</id><text>L</text></value>
  </optionItem>

  <!-- 2. 조합 정보 (optionManageCodes로 필터링 또는 전체) -->
  <combination>
    <manageCode>R_S</manageCode>
    <price>1000</price>
    <stockQuantity>50</stockQuantity>   <!-- 선택: 0=품절 -->
    <status>true</status>                <!-- 선택: false=구매불가 -->
    <options>
      <name>색상</name>
      <id>R</id>
    </options>
    <options>
      <name>사이즈</name>
      <id>S</id>
    </options>
  </combination>
  <combination>
    <manageCode>B_M</manageCode>
    <price>0</price>
    <options><name>색상</name><id>B</id></options>
    <options><name>사이즈</name><id>M</id></options>
  </combination>
</option>
```

### 3.5 상품정보 supplement (표 3-11)

```xml
<supplement>
  <id>SP002</id>
  <name>마우스</name>
  <price>10000</price>
  <stockQuantity>100</stockQuantity>   <!-- 선택: 0=품절 -->
  <status>true</status>                 <!-- 선택: false=구매불가 -->
</supplement>
```

### 3.6 상품정보 전용 필드 (표 3-8)

| 요소                  | 필수 | 설명                                                                     |
| --------------------- | :--: | ------------------------------------------------------------------------ |
| `stockQuantity`       |  N   | 본상품 재고. 미입력=재고 미확인, 0=품절. 옵션+manageCode 있으면 무시됨   |
| `status`              |  N   | `ON_SALE`(기본) / `SOLD_OUT` / `NOT_SALE`                                |
| `supplementSupport`   |  N   | 추가상품 제공 여부 (기본 false)                                          |
| `optionSupport`       |  N   | 옵션 제공 여부 (기본 false)                                              |
| `returnShippingFee`   |  N   | 편도 반품배송비, 1~200,000                                               |
| `exchangeShippingFee` |  N   | 왕복 교환배송비, 1~200,000                                               |
| `returnInfo`          |  N   | 상품별 반품주소 (zipcode, address1, address2, sellername, contact1 필수) |

### 3.7 상품정보 완성 응답 예시

```xml
<?xml version="1.0" encoding="utf-8"?>
<products>
  <product>
    <id>P001</id>
    <merchantProductId>P001</merchantProductId>
    <name>티셔츠</name>
    <basePrice>1000</basePrice>
    <infoUrl>https://mydomain.com/product/P001</infoUrl>
    <imageUrl>https://mydomain.com/images/P001.jpg</imageUrl>
    <stockQuantity>100</stockQuantity>
    <status>ON_SALE</status>
    <supplementSupport>false</supplementSupport>
    <optionSupport>true</optionSupport>
    <shippingPolicy>
      <groupId>10000</groupId>
      <method>DELIVERY</method>
      <feePayType>PREPAYED</feePayType>
      <feeType>CHARGE</feeType>
      <feePrice>2500</feePrice>
    </shippingPolicy>
    <returnInfo>
      <zipcode>13591</zipcode>
      <address1>경기도 성남시 분당구 서현동</address1>
      <address2>266-1</address2>
      <sellername>가맹점명</sellername>
      <contact1>0312224444</contact1>
      <contact2>0312224444</contact2>
    </returnInfo>
    <option>
      <optionItem>
        <type>SELECT</type>
        <name>색상</name>
        <value><id>R</id><text>빨강</text></value>
        <value><id>B</id><text>파랑</text></value>
        <value><id>Y</id><text>노랑</text></value>
      </optionItem>
      <optionItem>
        <type>SELECT</type>
        <name>사이즈</name>
        <value><id>S</id><text>S</text></value>
        <value><id>M</id><text>M</text></value>
        <value><id>L</id><text>L</text></value>
      </optionItem>
      <combination>
        <manageCode>R_S</manageCode>
        <price>1000</price>
        <options><name>색상</name><id>R</id></options>
        <options><name>사이즈</name><id>S</id></options>
      </combination>
      <combination>
        <manageCode>B_M</manageCode>
        <price>0</price>
        <options><name>색상</name><id>B</id></options>
        <options><name>사이즈</name><id>M</id></options>
      </combination>
    </option>
  </product>
</products>
```

---

## 4. 도서산간비 API (3.3절)

### 4.1 요청 형식

```
GET /가맹점페이지?productId[0]=P001&productId[1]=P002&zipcode=13591&address1=6rK96riw64-EIOyEseuCqOyLnCDrtoTri7nqtawg7ISc7ZiE64-Z
```

| 파라미터       | 필수 | 설명                                   |
| -------------- | :--: | -------------------------------------- |
| `productId[N]` |  Y   | 상품 번호 (복수 가능)                  |
| `zipcode`      |  Y   | 배송지 우편번호                        |
| `address1`     |  Y   | 기본주소 (UTF-8 → base64 url encoding) |

### 4.2 응답 XML

```xml
<?xml version="1.0" encoding="utf-8"?>
<additionalFees>
  <additionalFee>
    <id>P001</id>
    <surprice>0</surprice>
  </additionalFee>
  <additionalFee>
    <id>P002</id>
    <surprice>1000</surprice>
  </additionalFee>
</additionalFees>
```

> **주의**: `address1`은 UTF-8 디코딩 → base64 url encoding 방식 전달

---

## 5. 찜 정보 연동 (3.4절)

### 5.1 엔드포인트

| 환경   | URL                                                    |
| ------ | ------------------------------------------------------ |
| 테스트 | `https://test-pay.naver.com/customer/api/wishlist.nhn` |
| 서비스 | `https://pay.naver.com/customer/api/wishlist.nhn`      |

### 5.2 등록 요청 (POST, application/x-www-form-urlencoded)

| 항목          | 필수 | 설명                    |
| ------------- | :--: | ----------------------- |
| `SHOP_ID`     |  Y   | 상점 ID                 |
| `CERTI_KEY`   |  Y   | 인증키                  |
| `ITEM_ID`     |  Y   | 상품 ID                 |
| `EC_MALL_PID` |  N   | 네이버쇼핑 EP mall_pid  |
| `ITEM_NAME`   |  Y   | 상품 이름               |
| `ITEM_DESC`   |  N   | 상품 설명               |
| `ITEM_UPRICE` |  Y   | 개별 상품 단가 (0 초과) |
| `ITEM_IMAGE`  |  Y   | 상품 사진 URL           |
| `ITEM_URL`    |  Y   | 상품 정보 URL           |

### 5.3 찜 목록 팝업

| 환경            | URL                                                         |
| --------------- | ----------------------------------------------------------- |
| 테스트 (PC)     | `https://test-pay.naver.com/customer/wishlistPopup.nhn`     |
| 테스트 (모바일) | `https://test-m.pay.naver.com/mobile/customer/wishList.nhn` |
| 서비스 (PC)     | `https://pay.naver.com/customer/wishlistPopup.nhn`          |
| 서비스 (모바일) | `https://m.pay.naver.com/mobile/customer/wishList.nhn`      |

GET 파라미터: `SHOP_ID`, `ITEM_ID` (찜 등록 response로 받은 네이버페이 상품 ID)

---

## 6. 네이버페이 버튼 (2장)

### 6.1 버튼 스크립트

```html
<!-- PC -->
<script
  src="http://pay.naver.com/customer/js/naverPayButton.js"
  charset="UTF-8"
></script>

<!-- 모바일 -->
<script
  src="http://pay.naver.com/customer/js/mobile/naverPayButton.js"
  charset="UTF-8"
></script>
```

### 6.2 버튼 설정

```javascript
naver.NaverPayButton.apply({
  BUTTON_KEY: "버튼 인증키",
  TYPE: "E", // PC: A~E, 모바일: MA, MB
  COLOR: 1, // 색상
  COUNT: 2, // 1=구매만, 2=구매+찜 (+톡톡 연동 시 변동)
  ENABLE: "Y", // N=비활성 (품절 등)
  BUY_BUTTON_HANDLER: buyHandler,
  WISHLIST_BUTTON_HANDLER: wishlistHandler,
  BUY_BUTTON_LINK_URL: "http://...",
  WISHLIST_BUTTON_LINK_URL: "http://...",
  "": "",
});
```

### 6.3 버튼 클릭 시 검증 항목 (표 2-3)

| 상황                  | 팝업 메시지                                            |
| --------------------- | ------------------------------------------------------ |
| 옵션 미선택           | "상품 옵션을 선택해 주세요."                           |
| 수량 0                | "수량을 입력해 주세요."                                |
| 수량 1,000 이상       | "수량을 999개 이하로 입력해 주세요."                   |
| 배송방법 미선택       | "배송방법을 선택해 주세요."                            |
| 배송비 미선택         | "배송비를 선택해 주세요."                              |
| 입력형 옵션 50자 초과 | "최대 50자 이내로 입력해 주세요."                      |
| 비활성 버튼           | "죄송합니다. 네이버페이로 구매가 불가능한 상품입니다." |

---

## 7. 유입 경로 스크립트 (4장)

```html
<!-- 1. wcslog.js 삽입 -->
<script src="http://wcs.naver.net/wcslog.js"></script>

<!-- 2. Account ID 설정 + whitelist + 유입 추적 -->
<script>
  if (!wcs_add) var wcs_add = {};
  wcs_add["wa"] = "AccountId"; // 네이버 공통 인증키

  // whitelist (선택)
  wcs.checkoutWhitelist = ["aaa.com", "bbb.com"];

  // 유입 추적 호출 (네이버페이 버튼 삽입 전에 호출 필수)
  wcs.inflow("mydomain.com");
</script>

<!-- 3. 페이지 로딩 완료 후 (</body> 직전) -->
<script>
  wcs_do();
</script>
```

- `wcs.inflow()`: 유입 경로 추적 → 쿠키에 `NA_CO` 값 기록
- `wcs_do()`: 로그 수집 서버로 로그 전송
- Account ID: 네이버페이센터 > 내 정보 > 가맹점 가입 정보에서 확인

---

## 8. Express(Node.js) 구현 체크리스트

### 8.1 주문등록 엔드포인트

```
POST /api/naverpay/order/register
```

- [ ] XML 빌드 시 루트: `<order>`
- [ ] `merchantId`, `certiKey` 환경변수에서 로드
- [ ] `product/id`: 30자 이내, 영문+숫자+`!+-/=_|`, 공백 없음
- [ ] `product/name`: CDATA 래핑
- [ ] `product/basePrice`: 1 이상 정수
- [ ] `product/infoUrl`, `imageUrl`: 유효한 절대 URL
- [ ] 옵션 있으면 `<single>` 제거, 옵션 없으면 `<single><quantity>` 필수
- [ ] `option/selectedItem/name`: 20자 제한
- [ ] `option/selectedItem/value/text`: 50자 제한
- [ ] `option/price`: manageCode 없으면 price도 제거
- [ ] `shippingPolicy`: feeType별 하위 요소 조건부 필수 준수
- [ ] `surchargeByArea`: 사용 안 하면 **요소 자체 제거**
- [ ] Content-Type: `application/xml; charset=utf-8`
- [ ] 네이버페이 응답에서 인증키 파싱

### 8.2 상품정보 응답 엔드포인트

```
GET /api/naverpay/product-info
```

- [ ] XML 응답 루트: `<products>` (**`<order>` 아님**)
- [ ] Content-Type: `application/xml; charset=utf-8`
- [ ] 쿼리 파라미터 `product[N][id]` 배열 파싱
- [ ] `optionSearch` 파라미터 확인 → true일 때만 `<option>` 포함
- [ ] `supplementSearch` 파라미터 확인 → true일 때만 `<supplement>` 포함
- [ ] `optionManageCodes`로 조합 필터링 (없으면 전체)
- [ ] `supplementIds`로 추가상품 필터링 (없으면 전체)
- [ ] 옵션 태그: `<optionItem>` 사용 (`<selectedItem>` 아님)
- [ ] 조합 정보: `<combination>` 블록으로 분리
- [ ] `stockQuantity`, `status`, `optionSupport`, `supplementSupport` 포함
- [ ] `infoUrl`이 주문등록 시와 동일한 URL

### 8.3 도서산간비 응답 엔드포인트

```
GET /api/naverpay/additional-fee
```

- [ ] 루트: `<additionalFees>`
- [ ] `productId[N]` 배열 파싱
- [ ] `address1` base64 url 디코딩 → UTF-8 변환
- [ ] 각 상품별 `<additionalFee>` 응답

### 8.4 네이버페이 서버 접근성

- [ ] localhost는 네이버페이 서버에서 도달 불가 → **ngrok 필수**
- [ ] ngrok URL을 네이버페이센터에 등록
- [ ] 상품정보 API URL과 도서산간비 API URL 모두 등록

---

## 9. 자주 발생하는 에러와 해결

| 에러                | 원인                        | 해결                                                        |
| ------------------- | --------------------------- | ----------------------------------------------------------- |
| ERR-OR-100013       | XML 파싱 실패               | Content-Type 확인, XML 유효성 검증                          |
| ERR-OR-100019       | 필수 요소 누락              | id, name, basePrice, infoUrl, imageUrl, shippingPolicy 확인 |
| ERR-OR-100055       | 필드값 유효성 위반          | basePrice≥1, feePrice 범위, 옵션명 20자 등                  |
| 상품정보 조회 실패  | 루트 태그 오류              | `<products>` 사용 (not `<order>`)                           |
| 상품정보 조회 실패  | 옵션 태그 오류              | `<optionItem>` 사용 (not `<selectedItem>`)                  |
| "잘못된 접근"       | 결제창 팝업 실패            | 인증키, merchantId, 총 주문금액 확인                        |
| localhost 접근 불가 | 네이버페이→가맹점 연결 실패 | ngrok 사용 + 센터 URL 등록                                  |

---

## 10. 입력값 제약 조건 요약

| 항목                           | 최대 길이             | 허용 문자                          |
| ------------------------------ | --------------------- | ---------------------------------- |
| product/id                     | 30자                  | 영문, 숫자, `!+-/=_\|` (공백 불가) |
| product/merchantProductId      | 100자                 | 영문, 숫자, `!+-/=_\|` (공백 불가) |
| product/name                   | 100자                 | -                                  |
| product/giftName               | 200자                 | -                                  |
| option/selectedItem/name       | **20자**              | -                                  |
| option/selectedItem/value/id   | 50자                  | 영문, 숫자, `!+-/=_\|` (공백 불가) |
| option/selectedItem/value/text | 50자                  | -                                  |
| option/manageCode              | 100자                 | 영문, 숫자, `!+-/=_\|` (공백 불가) |
| supplement/id                  | 50자                  | 영문, 숫자, `!+-/=_\|` (공백 불가) |
| supplement/name                | 50자                  | -                                  |
| feePrice                       | 0~200,000             | 정수                               |
| basePrice                      | 1 이상                | 정수                               |
| option/price                   | -(basePrice×50%) 이상 | 정수                               |
| merchantCustomCode             | UTF8 300바이트        | -                                  |
| salesCode                      | 300자                 | -                                  |
