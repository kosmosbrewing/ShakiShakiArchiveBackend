# Technical Challenges and Trade-offs

> 코드 기준일: 2026-07-10. 측정되지 않은 성능 개선율이나 운영 수치를 제거하고, 현재 코드가 실제로 선택한 경계와 남은 위험을 기록합니다.

## 1. Order Creation and Stock

### Problem

client가 전달한 가격·재고를 신뢰하면 가격 변조, 품절 초과 판매, 동시에 같은 vintage item을 구매하는 race가 발생합니다.

### Current design and gap

- route에서 product/variant를 DB로 다시 조회하고 direct purchase의 product/variant 활성 상태를 확인
- direct purchase route는 `variant.productId === product.id`를 확인하지 않음
- `storage.createOrder` transaction은 전달받은 variant ID 대신 `productId + options의 size`로 variant를 다시 찾고 stock을 잠금·차감하지만 `isAvailable`을 필터하지 않음
- order를 `isStockReserved=true`, `pending_payment`로 생성
- 5분 동안 결제가 진행되지 않으면 cleanup이 재고 복구와 주문 삭제를 한 transaction으로 수행

### Trade-off

결제 전에 stock을 차감하므로 장시간 결제창이나 callback 지연이 5분 cleanup과 경합할 수 있습니다. TTL은 빠른 재고 회수와 결제 UX 사이의 정책값입니다. 현재 variant 소속 검증 누락과 size 기반 재조회 때문에 다른 상품 variant에서 가져온 size로 대상 상품의 다른/비활성 variant가 선택될 수 있어, 수정 전에는 주문 정합성 gap으로 취급합니다.

### Required verification

- 동일 variant에 대한 concurrent order test
- 다른 product의 variant ID, 같은 size의 비활성 variant를 사용한 거부 test
- callback 직전/직후 cleanup race
- payment provider별 결제 유효 시간과 5분 TTL 정렬
- cleanup 다중 task 실행에서 stock 중복 복구 방지

## 2. Multi-provider Routing

### Problem

`/payments` 아래 Toss router를 먼저 mount하면 더 구체적인 `/payments/kakaopay`, `/payments/naverpay` 요청이 Toss의 router-level disabled gate에 걸릴 수 있습니다.

### Current design

`server/routes/index.ts`는 구체 provider를 먼저 mount합니다.

```text
/payments/naverpay
/payments/kakaopay
/naverpay-order
/payments (Toss)
```

Toss/NaverPay는 enable key가 없을 때 전체 router를 `503`으로 차단하여 미사용 code path의 공격 표면을 줄입니다.

### Trade-off

provider 코드가 한 application에 모두 남아 있어 config 오류로 의도치 않게 활성화될 수 있습니다. enable 조건도 provider에 필요한 모든 key가 아니라 대표 key 하나만 확인합니다.

### Required verification

- 각 enable key 조합에서 route matrix 200/401/503 test
- 구체 prefix가 Toss gate를 우회하는지 smoke test
- 실제 운영에서 미사용 provider key 제거

## 3. Payment Idempotency and Cross-system Consistency

### Problem

PG 승인/취소는 외부 side effect이고 DB transaction과 원자적으로 묶을 수 없습니다. callback 중복, network timeout, PG 성공 뒤 DB 실패가 서로 다른 상태를 만들 수 있습니다.

### Current design

- 주문 상태 precheck/conditional update/row lock 패턴을 경로별로 사용
- provider apply/cancel에 idempotency key를 지원하는 client가 있음
- provider amount와 DB amount 비교
- 이미 결제된 callback은 success redirect로 처리하는 경로
- stock 부족 시 provider cancel 시도
- 실패 로그와 일부 Telegram alert

### Remaining gap

- provider별 상태 guard가 완전히 같은 수준인지 자동 test가 없음
- PG 성공/DB 실패를 durable하게 재시도하는 outbox/saga 없음
- partial cancel/return refund reconciliation을 수동으로 해야 할 수 있음
- notification/callback authenticity는 provider별 재검증 필요

### Recommendation

돈이 움직이는 요청마다 stable operation ID, provider response snapshot(민감정보 제외), intended state, reconciliation status를 durable하게 저장하고 관리자 멱등 재처리 경로를 두는 것이 우선입니다.

## 4. KakaoPay `tid` Across Redirects

### Problem

ready와 callback 사이에 provider `tid`가 필요하지만 web process memory만 사용하면 restart/scale-out에서 유실됩니다. 반대로 browser session만 의존하면 callback cookie 유실에 취약합니다.

### Current design

- process-local Map primary
- PostgreSQL-backed session backup
- callback에서 memory/session source를 구분해 log
- 15분 TTL, 5분 cleanup interval

### Trade-off

Map과 session은 모두 조건부입니다. callback이 다른 task로 가고 browser cookie도 없으면 lookup 실패할 수 있습니다. durable order-level storage보다 schema change가 없다는 장점만 있습니다.

### Trigger for redesign

`both-miss` 관측, task scale-out, rolling deploy 중 사용자 결제 실패가 확인되면 order/payment attempt table 또는 shared TTL store로 이동합니다.

## 5. Admin 2FA Availability vs Security

### Problem

Telegram 전달 장애 시 관리자가 완전히 잠기지 않도록 복구 경로가 필요하지만, 고정 fallback은 credential 위험입니다.

### Current design

- password 성공 후 session에 challenge ID, code hash, expiry, attempts 저장
- production code를 response에 노출하지 않음
- Telegram 실패 시 허용 조건에서만 recovery path
- `isAdmin`이 `admin2faVerifiedAt`을 요구
- high-risk admin action용 challenge 발급 route 존재

### Remaining gap

config에 recovery code fallback이 있으므로 운영 env 누락이 startup failure가 아닙니다. 운영에서 `ADMIN_2FA_RECOVERY_CODE`를 별도 secret으로 주입하고 rotation/audit 절차가 필요합니다.

## 6. Session Cookies Behind Proxies

### Problem

cross-origin frontend, HTTPS termination, API Gateway/VPC Link가 함께 있으면 Express가 request를 insecure로 판단해 secure cookie를 누락할 수 있습니다.

### Current design

- `trust proxy=1`
- `X-Original-Proto`를 `X-Forwarded-Proto`로 정규화
- optional `X-Original-Host`, `X-Original-Cookie` 처리
- production cookie `SameSite=None; Secure`
- exact-origin production CORS allowlist와 credentials

### Risk

proxy가 public client의 `X-Original-*`를 제거/덮어쓰는지 저장소에서 확인할 수 없습니다. 신뢰 경계 밖 사용자가 이 header를 조작할 수 있으면 secure 판단/host/cookie에 영향을 줄 수 있습니다.

### Verification

실제 ingress에서 spoofed header test, credentialed preflight/login/logout, callback 후 session 유지 test가 필요합니다.

## 7. In-process Schedulers and Horizontal Scaling

### Problem

web task마다 cron/interval이 시작되므로 scale-out 시 작업 수가 task 수만큼 늘어납니다.

### Current design

- auto-confirm: `FOR UPDATE SKIP LOCKED`로 DB coordination
- ghost order cleanup: 조건 조회 후 order별 atomic restore/delete
- stock reservation cleanup: legacy cleanup
- KakaoPay tid cleanup: local Map

### Trade-off

별도 worker infrastructure 없이 단순하지만 task 수와 배포 lifecycle에 결합됩니다. 모든 job이 distributed idempotency를 같은 수준으로 보장하지 않습니다.

### Verification

실제 desired task count를 먼저 확인하고, 2개 process에서 동시에 job을 실행하는 integration test를 추가합니다.

## 8. Query and Cache Scalability

### Current design

- products/users/orders 일부는 pagination
- ETag와 Cache-Control 전략
- user lookup 5분 memory cache
- Meilisearch optional, 초기화 실패 시 server 지속
- rate limit memory store

### Current gaps

- public/admin inquiry list는 pagination 없이 전체 목록을 조회
- process-local cache/rate limit은 task 간 공유되지 않음
- cache invalidation과 search index consistency에 자동 test 없음
- 검증된 p95/p99/throughput baseline 없음

측정 없이 특정 응답시간이나 개선율을 주장하지 않습니다.

## 9. Logging vs Privacy

### Current design

- requestId, raw일 수 있는 URL/query/userEmail/response summary, duration
- 객체형 request body와 일부 외부 request header/body에만 key-name based masking
- production JSON/WARN, development pretty/INFO
- 500/process error Telegram alert

### Current gaps

- `isAuthenticated` debug log가 cookie/session ID preview를 포함
- NaverPay code가 full query, payment ID/error object, client ID 일부를 log
- HTTP response와 외부 provider response summary, 문자열/XML request는 key-name masker를 거치지 않음
- 외부 non-2xx response는 production 기본 `WARN`에도 기록됨
- key-name masker가 모든 PII를 식별하지 못함
- runtime log retention/access policy가 저장소 밖

로그는 debugging 편의가 아니라 최소 필요 데이터 원칙으로 재설계해야 합니다. 특히 인증/결제 identifier는 hash/tokenize 또는 제거를 우선합니다.

## 10. Migration Reproducibility

### Problem

schema source, local generated SQL, Drizzle journal, production DB가 같은 history를 공유해야 안전한 deploy/rollback이 가능합니다.

### Current state

- `shared/schema.ts`와 Drizzle scripts 존재
- local migrations/journal 존재
- `.gitignore`가 `migrations/*`를 제외
- workflow에 migration step 없음
- CLI/custom runner TLS는 certificate identity 검증을 비활성화하며, CA가 정상 로드된 application connection보다 약함
- application DB client도 CA 경로/파일이 없으면 경고 후 `rejectUnauthorized=false`로 fail-open

### Consequence

fresh clone이 migration history를 재현하지 못하고 운영 schema version도 저장소에서 확인할 수 없습니다. 또한 CA mount 오류가 배포 실패가 아니라 identity 검증 없는 연결로 이어질 수 있습니다. migration artifact 추적과 application/CLI 양쪽의 fail-closed TLS를 다음 DB 변경 전에 해결해야 합니다.

## 11. Status Source Drift

`shared/constants/order.ts`는 `purchase_confirmed`, `refunding`, `partial_refunded` 등 현재 상태를 포함하지만 `shared/schema.ts`의 legacy `orderStatusEnum` 배열은 뒤처져 있습니다. DB가 varchar라 runtime 저장은 가능하지만 validation/type/document가 서로 달라질 수 있습니다.

단일 상태 graph와 transition test를 만들고 중복 배열을 제거하는 것이 권장됩니다.

## 12. Query Parser Assumption in NaverPay Order APIs

NaverPay product/additional-fee handler는 `product[0][id]`, `productId[0]`가 nested object/array로 파싱된다고 가정합니다. Express query parser를 extended로 명시하지 않아 실제 provider request에서 literal key로 남을 수 있습니다.

Provider enable 전에 실제 query string integration test가 필요합니다. parser를 global 변경하면 다른 route와 prototype pollution/validation 영향도 함께 검토해야 합니다.

## 13. NaverPay Guest Order Dead End

`/naverpay-order/register`는 guest CART를 받아 Naver order page까지 보낼 수 있지만, `PAYMENT_COMPLETE` 처리에서 `merchantCustomCode1`이 `guest` 또는 비UUID이면 user FK 제약 때문에 즉시 반환합니다. 이 경우 내부 주문 생성, 재고 차감, 발주확인이 수행되지 않습니다. guest UI/등록을 막거나 별도 guest identity/order model을 완성하기 전에는 end-to-end 지원으로 표시하면 안 됩니다.

## Historical Context

2026-07-08 당시 발견·수정 이력은 다음 snapshot에 보존되어 있습니다.

- [Quality Improvements 2026-07-08](./QUALITY_IMPROVEMENTS_2026-07-08.md)
- [Release 2026-07-08](./RELEASE_2026-07-08.md)

당시 운영 전제와 현재 환경은 같다고 가정하지 않습니다.

## Related Documents

- [Architecture](./ARCHITECTURE.md)
- [DevOps](./DEVOPS.md)
- [Backend Guide](../BACKEND_GUIDE.md)
- [MEMORY](../MEMORY.md)
