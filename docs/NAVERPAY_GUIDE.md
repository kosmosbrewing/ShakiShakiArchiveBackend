# NaverPay Integration Guide

> 코드 기준일: 2026-07-10. 이 문서는 현재 저장소 구현을 설명합니다. NaverPay 외부 규격의 최신성, 가맹점 승인 상태, 실제 callback 등록은 운영 전 공식 문서·가맹점 설정으로 다시 확인해야 합니다.

## 1. Two Separate Integrations

이 저장소에는 서로 다른 NaverPay 방식이 함께 있습니다.

| Mode | Router | Purpose | Enable key |
| --- | --- | --- | --- |
| 결제형 | `/api/payments/naverpay` | 기존 내부 주문을 NaverPay로 승인/조회/취소 | `NAVERPAY_CLIENT_ID` |
| 주문형 | `/api/naverpay-order` | Naver 주문서 등록, 상품 XML, 주문 변경 알림, 찜 | `NAVERPAY_CERTI_KEY` |

두 router 모두 enable key가 없으면 router-level gate가 `503`을 반환합니다. 코드 존재는 production 활성화를 뜻하지 않습니다.

## 2. Environment

실제 값은 secret store/runtime env로 주입하고 문서·로그에 복사하지 않습니다.

### Shared

```dotenv
FRONTEND_URL=https://frontend.example
NAVERPAY_MERCHANT_ID=...
NAVERPAY_MODE=test
```

`NAVERPAY_MODE`는 `test` 또는 `production`으로 사용됩니다. 미설정 기본은 `test`입니다.

### Payment mode

```dotenv
NAVERPAY_CLIENT_ID=...
NAVERPAY_CLIENT_SECRET=...
NAVERPAY_CHAIN_ID=...
NAVERPAY_RETURN_URL=https://api.example/api/payments/naverpay/callback
```

활성화 판정은 client ID 하나만 확인하지만 provider API 호출은 secret과 chain ID도 사용합니다. 운영 enable 전 세 값과 return URL을 함께 검증해야 합니다.

### Order-form mode

```dotenv
NAVERPAY_CERTI_KEY=...
NAVERPAY_BUTTON_KEY=...
```

활성화 판정은 certi key 하나만 확인합니다. 주문 등록에는 merchant ID도 필요하고 frontend SDK에는 button key가 필요하므로 세 값을 함께 검증합니다.

## 3. Payment Mode

### Routes

| Method | Path | Access | Behavior |
| --- | --- | --- | --- |
| GET | `/api/payments/naverpay/sdk-config` | public when enabled | client ID, chain ID, SDK mode, return URL |
| GET | `/api/payments/naverpay/client-info` | public when enabled | legacy client config response |
| GET | `/api/payments/naverpay/callback` | provider/browser redirect | approve and redirect frontend |
| GET | `/api/payments/naverpay/:orderId/status` | owner or verified admin | DB/provider status |
| POST | `/api/payments/naverpay/:orderId/cancel` | owner or verified admin, rate limited | full/partial cancel |

### Approval flow

```text
authenticated user creates internal order
-> frontend gets SDK config
-> NaverPay payment UI
-> GET callback(orderId, paymentId, resultCode)
-> load internal order
-> require pending_payment/paying
-> provider apply API with idempotency key
-> verify provider admissionState
-> compare provider totalPayAmount with DB order.totalAmount
-> update order payment fields/status
-> clear legacy reservation/cart
-> fire-and-forget Telegram/email
-> redirect FRONTEND_URL/checkout/success
```

실패는 `FRONTEND_URL/checkout/fail`로 redirect합니다.

### Provider client

`server/services/naverpay.service.ts`가 다음을 수행합니다.

- mode별 dev/production API base URL
- client ID/secret/chain headers
- apply/cancel에 random UUID idempotency key
- shared HTTP client와 timeout 사용
- provider response normalization

### Payment-mode risks before enable

- callback의 payable-state precheck와 DB update가 하나의 conditional update로 묶였는지 재검증해야 합니다. 동시 callback TOCTOU 가능성을 integration test로 확인하세요.
- callback/request/provider error logging이 full query, payment ID, error object를 포함합니다. 운영 로그 데이터 분류와 최소화를 먼저 검토하세요.
- `getHeaders`가 client ID 일부를 직접 `console.log`에 기록합니다. credential metadata라도 운영 로그에 남길 필요가 있는지 검토하세요.
- PG 성공 후 DB/stock/cart/message side effect 실패를 durable하게 재처리하는 queue/outbox가 없습니다.
- cancel API 성공 후 DB update 실패 reconciliation이 필요합니다.

## 4. Order-form Mode

### Routes

| Method | Path | Caller/access | Behavior |
| --- | --- | --- | --- |
| GET | `/api/naverpay-order/sdk-config` | frontend | mode/button script/key config |
| POST | `/api/naverpay-order/register` | guest or session | DB hydrate 후 Naver 주문 XML 등록; guest 완료 처리는 현재 미지원 |
| GET | `/api/naverpay-order/product-info` | NaverPay server | 상품/option XML response |
| GET | `/api/naverpay-order/additional-fee` | NaverPay server | 도서산간 추가비 XML response |
| POST | `/api/naverpay-order/notification` | NaverPay server | 변경 상품주문 ID 조회/반영 |
| POST | `/api/naverpay-order/wishlist` | session | Naver wishlist register |

### Register request

`POST /register`는 두 타입을 받습니다.

```json
{
  "type": "PRODUCT",
  "productId": "uuid",
  "variantId": "uuid",
  "quantity": 1
}
```

```json
{
  "type": "CART",
  "cartItems": [
    { "productId": "uuid", "variantId": "uuid", "quantity": 1 }
  ]
}
```

- session user의 CART는 DB cart를 사용합니다.
- guest CART는 register 단계에서 전달한 IDs/quantity를 받아 가격·이름·재고를 DB에서 hydrate합니다. 그러나 `PAYMENT_COMPLETE`는 `merchantCustomCode1`이 `guest`이거나 UUID가 아니면 user FK 때문에 즉시 반환하므로 내부 주문 생성·재고 반영·발주확인까지 이어지지 않습니다. guest는 end-to-end 지원 경로로 간주하면 안 됩니다.
- 상품 enable, variant 존재와 수량/재고를 확인합니다.
- 현재 register 경로는 `variant.isAvailable`과 `variant.productId === product.id`를 확인하지 않습니다. 다른 상품의 variant UUID가 섞이면 option price/code 정합성이 깨질 수 있으므로 provider enable 전 거부 검증이 필요합니다.
- XML과 order page URL을 provider mode에 맞춰 구성합니다.
- 성공 응답은 `tempOrderId`, `orderPageUrl`을 포함합니다.

### Product info XML

요청 의도:

```text
GET /api/naverpay-order/product-info
  ?product[0][id]=<mapped-product-id>
  &product[0][optionManageCodes]=<mapped-variant-code>
  &optionSearch=true
```

응답은 `application/xml; charset=utf-8`의 `<products>` document입니다. 내부 UUID를 직접 노출하지 않도록 `shortId` 변환 utility를 사용하고, product/variant/option 정보를 DB에서 조회합니다.

### Additional fee XML

요청 의도:

```text
GET /api/naverpay-order/additional-fee
  ?productId[0]=<mapped-product-id>
  &zipcode=<postal-code>
  &address1=<base64url-address>
```

응답은 `<additionalFees>` XML이며 `shared/constants/shipping.ts`의 remote-area 규칙을 사용합니다.

### Notification flow

```text
POST notification (form-urlencoded product_order_id*)
-> parse product order IDs
-> provider change-detail API
-> group by Naver order ID
-> PAYMENT_COMPLETE: 기존 external order가 있으면 no-op; 없고 session user UUID가 유효하면 create + provider confirm
-> CANCEL_REQUEST/CANCEL_DONE: warning log, manual handling
-> always provider-compatible success XML in many error/no-data cases
```

알림 body를 신뢰해 상태를 직접 쓰기보다 provider API로 상세를 다시 조회합니다. 다만 request 자체의 signature/IP/authentication 요구사항은 현재 코드에서 확인되지 않으므로 공식 요구사항과 배포 ingress policy를 검증해야 합니다.

## 5. Critical Parser Verification

`product-info`와 `additional-fee` code는 bracket query가 nested object/array로 파싱된다고 가정합니다. 그러나 `server/index.ts`는 Express query parser를 `extended`로 명시하지 않습니다.

운영 enable 전에 다음 형태가 실제로 원하는 `req.query`로 변환되는지 integration test가 필수입니다.

```text
product[0][id]
product[0][optionManageCodes]
productId[0]
```

simple parser에서 literal key로 남으면 현재 handler는 product ID를 찾지 못합니다. parser 설정을 바꿀 때는 모든 기존 query route의 prototype pollution/입력 검증 영향도 함께 검토합니다.

## 6. Local Smoke Tests

실제 provider 호출 없이 disabled gate부터 확인합니다.

```bash
curl -i http://localhost:8080/api/payments/naverpay/client-info
curl -i http://localhost:8080/api/naverpay-order/sdk-config
```

관련 enable key가 없으면 `503`이 정상입니다.

Provider sandbox test 전 최소 확인:

```bash
npm run verify
```

그리고 별도 test DB에서:

1. payment/order-form mode가 test인지
2. callback/product/additional-fee URL이 외부에서 HTTPS 접근 가능한지
3. 내부 order/variant와 provider mapped ID가 일치하는지
4. 금액·재고가 server-side 값으로 검증되는지
5. duplicate callback/notification 결과가 한 번만 반영되는지
6. provider 성공 뒤 DB 실패 reconciliation 절차가 있는지
7. 로그에 credential/token/full PII가 없는지

실제 결제/취소는 금전 side effect이므로 승인된 sandbox credential과 test order로만 실행합니다.

## 7. Production Checklist

- [ ] 실제 사용할 방식(결제형/주문형/둘 다) 확정
- [ ] 모든 관련 env 존재 여부 확인; 값 출력 금지
- [ ] `NAVERPAY_MODE=production` 의도 확인
- [ ] backend callback/product/additional-fee URL 등록 확인
- [ ] frontend URL/SDK script/button key 확인
- [ ] credentialed CORS와 session cookie 확인
- [ ] bracket query parser integration test
- [ ] duplicate callback/notification/idempotency test
- [ ] 금액 mismatch와 재고 부족 자동 취소 test
- [ ] cancellation/reconciliation runbook
- [ ] notification authenticity/ingress restriction 공식 요구사항 확인
- [ ] request/provider response logging 최소화
- [ ] disabled unused NaverPay mode remains 503

## 8. Troubleshooting

### All routes return 503

해당 mode의 enable key가 없습니다. 값 자체를 로그에 출력하지 말고 env 존재 여부와 startup enable status만 확인합니다.

### SDK config exists but provider call fails

Payment mode는 client ID만으로 enable됩니다. client secret, chain ID, mode, return URL을 함께 확인합니다.

### Register succeeds but order page fails

Merchant ID, certi key, mapped product/option code, order page URL mode, provider error detail을 확인합니다. error detail에는 민감 정보가 없는지 먼저 검토합니다.

### Product info says no products

1. bracket query가 nested structure로 파싱됐는지
2. mapped short ID를 UUID로 되돌릴 수 있는지
3. product/variant가 active인지
4. option manage code mapping이 일치하는지

### Notification is received but state is unchanged

provider change-detail API 결과, status mapping, internal order mapping, confirm API 결과를 확인합니다. cancel statuses는 현재 자동 처리하지 않고 warning/manual path입니다.

### Payment completed but DB is pending

재결제를 유도하지 말고 provider payment ID와 내부 order 상태를 reconciliation합니다. PG approve/cancel을 임의 반복 호출하지 않습니다.

## 9. Needs Verification

- current official NaverPay protocol/field/endpoint requirements
- merchant onboarding and registered URLs
- active integration mode in production
- Express bracket query parsing behavior for provider requests
- notification authenticity and network allowlist requirements
- duplicate callback/notification behavior under concurrent tasks
- NaverPay logging data classification and retention
- PG-success/DB-failure recovery procedure

## Related Documents

- [README](../README.md)
- [Backend Guide](../BACKEND_GUIDE.md)
- [Architecture](./ARCHITECTURE.md)
- [DevOps](./DEVOPS.md)
- [MEMORY](../MEMORY.md)
