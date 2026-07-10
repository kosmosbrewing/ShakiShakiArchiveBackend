# System Architecture

> 코드 기준일: 2026-07-10. 이 문서는 저장소에서 확인 가능한 application architecture만 설명합니다. 실제 AWS 네트워크, task 수, load balancer/CDN, RDS topology는 Needs Verification입니다.

## 1. Context

ShakiShaki Archive Backend는 하나의 Node.js 프로세스에 다음 역할을 함께 둔 모듈형 monolith입니다.

```text
Frontend / PG callback / NaverPay server
                    |
                 HTTP(S)
                    |
        Express application (/api)
        |         |          |
     Routes    Services    In-process jobs
        |         |          |
        +------ Storage ------+
                    |
             PostgreSQL / sessions

Optional outbound: OAuth providers, payment providers, Resend,
Telegram, Cloudinary, Meilisearch, GA4, GitHub API
```

저장소에는 Docker/ECR/ECS 배포 코드와 API Gateway/VPC Link용 proxy header 보정 코드가 있지만, 위 구성 요소가 실제 운영에 모두 존재한다고 보장하지 않습니다.

## 2. Code Boundaries

| Layer | Location | Responsibility |
| --- | --- | --- |
| Composition | `server/index.ts` | middleware order, HTTP server, startup, shutdown |
| Config | `server/config/` | env validation, CORS, session, Helmet/rate limits |
| Routes | `server/routes/` | HTTP contract, validation, auth/ownership, orchestration |
| Services | `server/services/` | OAuth/PG/email/search/notification provider calls |
| Storage | `server/storage.ts` | DB query, transaction, row lock, aggregate loading |
| Jobs | `server/jobs/`, cleanup utilities | in-process scheduled state transitions |
| Shared model | `shared/schema.ts` | Drizzle schema and Zod input schemas |
| Shared policy | `shared/constants/` | status, shipping, security, scheduler, messages |

`server/storage.ts`는 단일 파일이지만 사실상 data access와 여러 transaction boundary를 모두 소유합니다. 새 기능은 route에서 ad-hoc SQL을 늘리기 전에 기존 storage 패턴을 우선합니다. 단, 결제/lock처럼 transaction client가 필요한 일부 route는 `pool`을 직접 사용합니다.

## 3. Request Lifecycle

실제 middleware 순서는 `server/index.ts` 기준입니다.

```text
Request
  -> Helmet
  -> global rate limit
  -> X-Original-* proxy header normalization
  -> JSON/urlencoded parser (1 MiB, JSON rawBody retained)
  -> CORS
  -> PostgreSQL session
  -> populateUser (5-minute process-local user cache)
  -> compression
  -> request/response logger + requestId
  -> /api router
  -> central error handler
```

### Important consequences

- `trust proxy=1`과 proxy header middleware가 cookie의 secure 판단에 영향을 줍니다.
- 운영 CORS allowlist는 앱 import 시 검증되며 비어 있거나 `*`이면 시작에 실패합니다.
- session store는 `sessions` table을 자동 생성하지 않습니다.
- JSON raw body는 향후 webhook 검증 용도로 보존하지만, 현재 모든 결제 webhook이 signature 검증을 수행한다는 뜻은 아닙니다.
- 등록되지 않은 route를 위한 별도 `notFoundHandler`가 export되어 있으나 현재 `server/index.ts`에 마운트되지 않았습니다. Express 기본 404 형식이 나갈 수 있습니다.

## 4. Authentication Model

### User sessions

`express-session`이 session ID만 cookie에 저장하고 실제 session은 PostgreSQL에 둡니다. 로그인 성공 시 session fixation 방지를 위해 regenerate합니다.

```text
email verification -> signup -> session.userId
password login      -> regenerate -> session.userId
OAuth callback      -> provider identity -> local user -> session.userId
```

Cookie policy:

- production + secure cookie: httpOnly, secure, SameSite=None
- otherwise: httpOnly, non-secure, SameSite=Lax
- max age: 7 days

### Admin sessions

관리자 접근은 다음 세 상태를 함께 요구합니다.

```text
session.userId
  + cached/DB user.isAdmin
  + session.admin2faVerifiedAt
```

로그인 challenge 코드는 hash만 session에 보관합니다. Telegram 전달 장애 시 복구 코드 경로가 있으므로 운영에서 별도 `ADMIN_2FA_RECOVERY_CODE` 주입이 보안 경계입니다.

### Known logging risk

`auth.middleware.ts`의 debug 인증 로그가 cookie와 session ID preview를 포함합니다. 운영 기본 WARN에서는 억제되지만 설정으로 debug를 켤 수 있으므로 제거 전 debug 운영 사용을 금지해야 합니다.

## 5. Authorization and Ownership

- `isAuthenticated`: `session.userId` 존재 확인
- `populateUser`: user cache/DB에서 요청 사용자 주입
- `isAdmin`: 인증, 관리자 flag, admin 2FA 확인
- user-owned resource: route와 storage의 `userId` 조건으로 소유권 확인
- 일부 주문/결제 조회: 소유자 또는 `hasVerifiedAdminSession`
- 관리자 role 변경: 코드에 지정된 super-admin email 추가 확인

IDOR 방지는 route의 사전 조회만이 아니라 mutation query의 owner predicate로 유지해야 합니다.

## 6. Domain and Data Model

```text
users
  |-- sessions / email_verifications
  |-- cart_items -------- products -- categories
  |-- wishlist_items -----|    |
  |-- delivery_addresses  |    +-- product_variants -- product_size_measurements
  |-- orders -- order_items
  |             |
  |             +-- returns
  |-- inquiries -- inquiry_replies

site_images
stock_reservations (legacy route disabled, cleanup remains)
```

### Order/stock boundary

일반 주문 생성은 client 가격을 신뢰하지 않고 상품/variant를 DB에서 hydrate한 뒤 transaction 안에서 stock을 확인하고 차감합니다. 결제 전 주문도 `isStockReserved=true`로 표시되며, 만료 cleanup이 재고 복구와 주문 삭제를 transaction으로 묶습니다.

### Status model

DB 상태 컬럼은 PostgreSQL enum이 아니라 varchar입니다. 현재 전체 상태 집합은 `shared/constants/order.ts`가 더 최신입니다. `shared/schema.ts`의 legacy `orderStatusEnum` 배열은 `purchase_confirmed`, `refunding`, `partial_refunded` 등을 빠뜨려 drift가 있으므로 제거/통합 전까지 authoritative source로 쓰지 않습니다.

## 7. Consistency Boundaries

### DB-only operations

- 주문 생성/재고 차감
- 유령 주문 재고 복구/삭제
- 자동 구매확정 대상 lock (`FOR UPDATE SKIP LOCKED`)
- 여러 order/item 상태 동기화

PostgreSQL transaction과 conditional update가 원자성을 제공합니다.

### DB + external provider operations

결제 승인/취소, 이메일, Telegram은 단일 ACID transaction에 포함할 수 없습니다.

```text
PG API side effect -> DB state update -> stock/cache/message side effects
```

PG 성공 뒤 DB update 실패는 자동 rollback이 불가능합니다. 현재 일부 경로는 오류 로그/Telegram으로 관측하지만 durable outbox, saga, idempotent replay queue가 없습니다. 특히 부분 취소/반품 환불은 운영 재처리 절차가 필요합니다.

### KakaoPay callback state

KakaoPay ready의 `tid`는 process-local Map이 primary이고 PostgreSQL session에 backup합니다. callback은 cookie 유실을 허용하려고 session 비의존 경로도 지원합니다. 재시작/다중 task에서 Map miss와 session cookie 부재가 함께 발생할 가능성은 관측이 필요합니다.

## 8. Payment Modules

```text
/payments                  -> Toss router
/payments/kakaopay         -> KakaoPay router
/payments/naverpay         -> NaverPay payment router
/naverpay-order            -> NaverPay order-form router
```

- Toss: `TOSS_SECRET_KEY`로 router enable
- KakaoPay: `KAKAOPAY_SECRET_KEY`로 state-changing route enable
- NaverPay payment: `NAVERPAY_CLIENT_ID`로 router enable
- NaverPay order: `NAVERPAY_CERTI_KEY`로 router enable

구체적인 결제 route가 `/payments`보다 먼저 마운트되어 Toss router gate가 다른 provider를 가로채지 않습니다. provider 코드와 운영 활성 상태는 별개입니다.

NaverPay order-form의 guest register는 입력 단계에서 허용되지만 notification의 payment-complete handler는 `guest`/비UUID user를 즉시 반환합니다. 따라서 guest 주문은 내부 order 생성, stock 반영, provider confirm까지 완결되지 않습니다.

## 9. Cache and Search

- ETag/cache headers: product/category/site image/constants/SEO 등 GET
- user lookup cache: process-local Map, 5분 TTL
- rate-limit store: express-rate-limit 기본 memory store
- Meilisearch: `MEILISEARCH_HOST`가 있을 때 초기화; 실패해도 서버 지속
- DB search/fallback 동작: product search route/service 구현 기준

다중 task에서는 cache와 rate limit이 공유되지 않습니다. cache invalidation과 전역 제한이 요구되면 Redis/공유 store 같은 별도 설계가 필요하지만 실제 task 수 확인이 먼저입니다.

## 10. Background Processing

| Worker | Trigger | Coordination |
| --- | --- | --- |
| Auto confirm | cron, daily 03:00 KST | DB row lock + skip locked |
| Ghost order cleanup | interval 1m | 조건 조회 후 order별 transaction; 다중 worker 영향 검증 필요 |
| Stock reservation cleanup | interval 1m | legacy reservation cleanup |
| KakaoPay tid cleanup | interval 5m | process-local Map only |

전용 worker나 queue가 없고 web process가 작업을 실행합니다. rolling deployment, scale-out, clock drift가 scheduler 실행 횟수에 영향을 줄 수 있습니다.

## 11. External HTTP

`server/utils/http-client.ts`는 기본 30초 timeout과 AbortController를 제공합니다. header와 객체형 request body에는 키 기반 마스킹을 적용하지만 문자열/XML request와 provider response summary는 길이 제한만 적용된 원문일 수 있습니다. non-2xx response는 `WARN`이라 production 기본 레벨에도 기록됩니다. Toss/NaverPay 계열이 주로 사용합니다.

Naver/Kakao OAuth, Kakao search, GA4, Telegram, GitHub dispatch 등 일부 service/route는 직접 `fetch`를 사용합니다. 모든 직접 호출에 timeout/retry가 일관되게 적용되어 있지는 않으므로 새 변경에서 표준화가 필요합니다.

재시도는 side effect와 read request를 구분해야 합니다. 결제 approve/cancel에 임의 재시도를 추가하지 말고 provider idempotency와 현재 DB 상태를 먼저 확인합니다.

## 12. Error Handling and Observability

- custom console logger: production JSON, development pretty
- default level: production WARN, development INFO
- request ID: process-local timestamp/random 조합
- HTTP middleware: request/response body 요약과 duration
- 500: error log + optional Telegram system alert
- unhandled rejection: log/alert; process는 유지
- uncaught exception: log/alert 후 graceful shutdown

Winston, file transport, CloudWatch SDK, Sentry는 코드에 없습니다. 컨테이너 stdout/stderr가 어디로 수집되는지는 runtime 설정 Needs Verification입니다.

HTTP request middleware도 객체형 request body만 마스킹합니다. full URL/query/userEmail과 response summary는 raw일 수 있습니다. credential 외 PII, 문자열/XML payload, provider response, 새로운 secret key 이름을 자동 보호하지 않습니다.

## 13. Startup, Health, Shutdown

### Startup

1. 필수 env와 production CORS를 module load에서 검증
2. `localhost`(development) 또는 `0.0.0.0`(production) bind
3. DB `SELECT 1`; 실패해도 서버 지속
4. Meilisearch init; 실패해도 서버 지속
5. intervals/cron 시작

### Health

`GET /api/health`는 timestamp와 `status=ok`만 반환합니다. DB 또는 provider readiness가 아닙니다.

### Shutdown

SIGTERM/SIGINT에서 신규 HTTP 수신을 닫고 진행 요청을 drain한 다음 DB pool을 닫습니다. 10초 후에는 강제 종료합니다. 두 번째 signal도 강제 종료합니다.

## 14. Deployment Boundary

코드로 확인 가능한 artifact:

- Docker: Node 20 Alpine, non-root runtime, RDS CA bundle, port 8080, Docker healthcheck
- OIDC workflow: ECR image push, current ECS task definition render, ECS service deploy
- Access Key workflow: 별도 ECR repository에 수동 image push
- ignored local ECR script: ECR push 뒤 App Runner 설정 안내

확인 불가:

- 실제 public entry point/API Gateway/ALB/CloudFront 조합
- ECS launch type, task count, auto scaling, deployment circuit breaker
- RDS instance class/Multi-AZ/storage/backup
- CloudWatch retention/alarms와 비용
- 현재 활성 workflow와 repository 이름

## 15. Security Controls and Gaps

Implemented controls:

- Helmet/HSTS production policy
- explicit production CORS allowlist
- httpOnly/secure cookie policy
- session regeneration on login
- auth/payment/admin/email/global rate limits
- 1 MiB body limit
- Zod validation on major inputs
- owner predicates on user resources
- structured error/request logging with partial key-based request masking

Open gaps:

- auth debug cookie/session preview
- raw URL/query/userEmail/response summary와 외부 문자열 payload가 로그에 남을 수 있음
- admin recovery code code fallback; production explicit env required
- no automated security/integration tests
- process-local rate limit in multi-task topology
- provider callback authenticity/idempotency must be evaluated per route
- PG-success/DB-failure compensation is not durable
- liveness only, no DB readiness

보안 완전성 또는 규정 준수 상태를 이 저장소만으로 주장하지 않습니다.

## 16. Needs Verification

- actual production topology and active delivery workflow
- production task count and scheduler duplication behavior
- production DB schema/migration version and `sessions` index
- active OAuth/payment/provider configuration without exposing values
- callback URLs and credentialed CORS/cookie behavior
- Docker healthcheck command in the built runner image
- measured latency, error rate, throughput, availability and cost

## Related Documents

- [README](../README.md)
- [Backend Guide](../BACKEND_GUIDE.md)
- [DevOps](./DEVOPS.md)
- [Technical Challenges](./TECHNICAL-CHALLENGES.md)
- [MEMORY](../MEMORY.md)
