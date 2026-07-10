# ShakiShaki Archive Backend Guide

> 코드 기준일: 2026-07-10. endpoint의 최종 진실 소스는 `server/routes/`, 스키마는 `shared/schema.ts`, 운영 상수는 `shared/constants/`입니다.

## 1. Local Development

```bash
npm ci
cp .env.example .env
# 로컬 DB 생성 후, local-only schema bootstrap
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/shakishaki_dev'
export DB_SSL=false
npm run db:push
./startShaki.sh
```

필수 환경 변수는 `DATABASE_URL`, `SESSION_SECRET`입니다. 앱은 `.env`를 자체 로드하지 않으므로 `./startShaki.sh`가 Node `--env-file=.env`로 로드합니다. DB/admin package scripts도 환경 변수를 셸에 주입한 뒤 사용합니다. IDE/셸이 주입한다면 `npm run dev`를 사용할 수 있습니다.

정적 완료 기준:

```bash
npm run verify
```

`verify`는 문서 링크/환경 변수 카탈로그, TypeScript, production bundle을 확인합니다. 자동 테스트와 source-code lint는 아직 없습니다.

## 2. Application Composition

`server/index.ts`가 다음 순서로 앱을 구성합니다.

1. Helmet과 전역 rate limit
2. API Gateway/VPC Link proxy header 정규화
3. JSON/urlencoded parser, 각각 1 MiB
4. CORS
5. PostgreSQL session store
6. 사용자 정보 주입, compression, request logger
7. `/api` router
8. 중앙 error handler

서버 시작 callback에서 DB 연결을 검사하지만 실패해도 프로세스는 계속 실행합니다. 이후 Meilisearch 초기화, 재고 선점 정리, 유령 주문 정리, 자동 구매확정 scheduler를 시작합니다.

## 3. Authentication and Authorization

### Session

- Cookie: httpOnly
- Production + secure cookie: `secure=true`, `sameSite=none`
- Development 또는 `SECURE_COOKIE=false`: `secure=false`, `sameSite=lax`
- TTL: 7일
- Store: PostgreSQL `sessions`; `createTableIfMissing=false`
- CORS credential: `Access-Control-Allow-Credentials: true`

### Email/password flow

1. `POST /api/auth/send-verification` (`type=signup`)
2. `POST /api/auth/verify-email`
3. `POST /api/auth/signup`; 검증 완료 기록이 없으면 거부
4. `POST /api/auth/login`; 성공 시 session ID 재생성

비밀번호는 bcrypt로 저장되며 `shared/schema.ts`의 Zod schema가 최소 8자와 문자 종류 조합을 검증합니다. 비밀번호 재설정도 이메일 인증 기록을 요구합니다.

### Social login

- Naver: `GET /api/oauth/naver`, `/naver/login`, callback `/naver/callback`
- Kakao: `GET /api/oauth/kakao`, `/kakao/login`, callback `/kakao/callback`

Google OAuth backend route는 없습니다.

### Admin 2FA

관리자 비밀번호 로그인은 `202`와 challenge를 반환하고, `POST /api/auth/admin-2fa/verify` 성공 후에만 `admin2faVerifiedAt`이 설정됩니다. `isAdmin`은 다음을 모두 확인합니다.

1. `session.userId`
2. DB user의 `isAdmin`
3. `session.admin2faVerifiedAt`

운영에서 Telegram 전달이 실패할 때만 허용되는 복구 경로가 있습니다. `ADMIN_2FA_RECOVERY_CODE`를 별도 secret으로 반드시 주입해야 하며 코드 fallback을 운영값으로 사용하면 안 됩니다.

### Logging warning

현재 `isAuthenticated` debug 로그는 cookie 앞부분과 session ID 일부를 기록합니다. 제거 전에는 운영 `LOG_LEVEL=debug`를 사용하지 말고, 새 인증 로그는 cookie/session 원문이나 preview를 기록하지 않습니다.

## 4. API Map

모든 endpoint는 `/api` prefix를 사용합니다. 아래는 router 단위 지도이며, 세부 입력 schema는 각 route 파일의 Zod 정의가 기준입니다.

### Public and mixed routes

| Prefix | Main operations | Access |
| --- | --- | --- |
| `/health` | process liveness | public |
| `/auth` | signup/login/logout, user, password, email verification, admin 2FA | mixed |
| `/oauth` | Naver/Kakao start and callback | public callback flow |
| `/products` | list/detail, variant list, view count | public |
| `/categories`, `/variants` | category/variant lookup | public |
| `/search/address`, `/search/keyword` | Kakao search proxy | public, key required |
| `/search/products` | Meilisearch/fallback search; stats/reindex also live here | public search, admin stats/reindex |
| `/site-images` | main/hero/marquee/journal images | public |
| `/inquiries` | public list/detail, user create/my/delete, admin reply/status | mixed |
| `/seo`, `/feeds`, `/constants` | SEO metadata, feeds, shared constants | public |

주의: `/api/inquiries` public/admin list는 현재 pagination 없이 `storage.getInquiries`를 호출합니다.

### Session routes

| Prefix | Main operations |
| --- | --- |
| `/cart` | list/add/update/delete with owner filtering |
| `/orders` | create/list/detail, paying transition, cleanup, partial/full cancel, delete, item confirm |
| `/returns` | request, tracking, list/detail; admin receive/inspect/refund paths |
| `/wishlist` | list/add/delete |
| `/user/addresses` | list/create/update/delete |

주문 생성 시 server-side 상품/variant/가격/재고를 다시 조회하고 DB transaction에서 재고를 차감합니다. `stock.routes.ts`의 public reservation router는 현재 마운트하지 않지만 legacy cleanup은 시작됩니다.

### Payment routes

| Prefix | Enable condition | Main operations |
| --- | --- | --- |
| `/payments` | `TOSS_SECRET_KEY` | client key, confirm, cancel, status |
| `/payments/kakaopay` | `KAKAOPAY_SECRET_KEY` | client info, ready/callback, status, cancel |
| `/payments/naverpay` | `NAVERPAY_CLIENT_ID` | SDK/client info, callback, status, cancel |
| `/naverpay-order` | `NAVERPAY_CERTI_KEY` | SDK config, register, product XML, area fee XML, notification, wishlist |

Toss/NaverPay routers는 enable key가 없으면 router-level `503` gate를 사용합니다. KakaoPay callback은 결제창 redirect를 위해 세션 비의존 조회 경로를 포함합니다. 코드 존재만으로 운영 활성화를 판단하지 않습니다.

NaverPay 주문형 register는 guest 요청도 받지만 결제 완료 handler가 `guest`/비UUID user를 user FK 때문에 처리하지 않습니다. 내부 주문·재고·발주확인까지 이어지는 guest end-to-end 경로는 현재 미지원입니다.

### Admin routes

`/api/admin`은 별도 5분/300회 limiter를 사용합니다. 각 handler는 원칙적으로 `isAuthenticated` + `isAdmin`을 붙입니다.

| Prefix | Scope |
| --- | --- |
| `/admin/products`, `/admin/categories` | catalog CRUD |
| `/admin/orders`, `/admin/order-items` | order/item status, manual refund |
| `/admin/payments` | payment lookup/cancel |
| `/admin/variants`, `/admin/measurements` | variant/measurement CRUD |
| `/admin/images`, `/admin/site-images` | Cloudinary/site image management |
| `/admin/users` | paginated users, detail, role change |
| `/admin/inquiries` | inquiry list/detail |
| `/admin/analytics/overview` | GA4 visitors + product views |
| `/admin/email-preview` | email template preview |

관리자 role 변경은 코드에 지정된 super-admin email만 허용합니다. 운영 계정 정책은 별도 확인이 필요합니다.

## 5. Data Model

`shared/schema.ts`가 정의하는 테이블은 다음과 같습니다.

| Domain | Tables |
| --- | --- |
| Auth | `users`, `sessions`, `email_verifications` |
| Catalog | `categories`, `products`, `product_variants`, `product_size_measurements` |
| Shopping | `cart_items`, `wishlist_items`, `delivery_addresses` |
| Order | `orders`, `order_items`, `returns`, `stock_reservations` |
| Content | `site_images`, `inquiries`, `inquiry_replies` |

별도 payments table은 없습니다. provider, payment key, method, paid/cancel/refund 정보는 `orders`에 저장됩니다.

### Status source

운영 코드의 전체 주문/아이템/반품 상태 집합은 `shared/constants/order.ts`에 있습니다. DB 컬럼은 varchar입니다. `shared/schema.ts` 안의 legacy `orderStatusEnum` 배열은 일부 신규 상태를 포함하지 않아 타입/문서 근거로 사용하면 안 되며 통합이 필요합니다.

### Storage layer

- Route는 가능하면 `storage` 메서드를 통해 DB를 다룹니다.
- 결제·재고·주문 상태 전이는 `pool` transaction과 conditional update/row lock을 사용합니다.
- 새 메서드를 추가할 때 ID만 받지 말고 user-owned resource에는 `userId` 조건을 포함합니다.
- PG 성공 뒤 DB update가 실패할 수 있는 순서를 설계할 때 durable retry/운영 재처리 경로를 함께 둡니다.

## 6. Validation and Errors

- 도메인 입력: `shared/schema.ts`의 Zod 또는 route-local Zod
- UUID/query helper: `server/utils/validation.ts`
- async rejection: `asyncHandler` → `errorHandler`
- 예상치 못한 production error response: 일반 메시지 + `requestId`
- route handler가 직접 반환하는 domain error 형식은 아직 완전히 통일되지 않았습니다.

요청 logger는 객체형 request body에만 키 이름 기반 마스킹을 적용합니다. full URL/query/userEmail과 response summary는 별도 sanitize 없이 기록될 수 있으므로 모든 PII가 보호된다고 가정하면 안 됩니다.

## 7. Cache and Rate Limits

- Global: 15분/1000; health와 admin 제외; development 기본 비활성
- Auth: 15분/15; development 기본 비활성
- Email: 5분/3; development에도 적용
- Payment: 1분/10; 항상 적용
- Admin: 5분/300; 항상 적용
- ETag와 Cache-Control 전략은 상품/카테고리/site image/공용 상수 등 GET에 적용
- user cache와 rate-limit store는 프로세스 메모리 기반

다중 인스턴스에서 제한 횟수와 cache invalidation은 task별로 분리됩니다.

## 8. Background Jobs

| Job | Schedule | Behavior |
| --- | --- | --- |
| Auto confirm | daily 03:00 KST | delivered item 7일 경과 후 `purchase_confirmed`; `FOR UPDATE SKIP LOCKED` |
| Ghost orders | every 1 minute | pending/paying 5분 초과: 재고 복구 + 주문 삭제 transaction |
| Stock reservations | every 1 minute | legacy reservation TTL 3분 정리 |
| KakaoPay tid | every 5 minutes | memory entry TTL 15분 정리 |

Scheduler가 프로세스 내부에 있으므로 task 수, clock, 배포 중 중복 실행을 운영 환경에서 확인합니다.

## 9. External Integrations

`server/utils/http-client.ts`는 기본 30초 timeout을 제공하고 header와 객체형 request body만 키 기반으로 마스킹합니다. 문자열/XML request와 provider response summary는 길이 제한만 적용된 원문일 수 있고, non-2xx는 production 기본 `WARN`에도 남습니다. Toss/NaverPay 서비스가 주로 이를 사용합니다. OAuth, 검색, GA4, Telegram, GitHub dispatch 등 일부 코드는 직접 `fetch`를 사용하므로 timeout과 sanitize 범위를 변경 시 재검토해야 합니다.

| Integration | Config source | Failure behavior |
| --- | --- | --- |
| Resend | `RESEND_API_KEY` | 일부 인증/메일 흐름은 실패 응답, 일부 알림은 fire-and-forget |
| Telegram | bot/chat IDs | no-op 또는 에러 로그; admin 2FA는 운영 fallback 정책 영향 |
| Cloudinary | 3개 credential 모두 | admin upload 기능 비활성/실패 |
| Meilisearch | `MEILISEARCH_HOST` | 초기화 실패 후 서버 계속; search fallback 확인 필요 |
| GA4 | property/service account | analytics service가 configuration 상태 응답 |
| GitHub dispatch | token/repo | token 없으면 no-op |

## 10. Adding or Changing a Feature

1. `shared/schema.ts`/`shared/constants`의 기존 타입과 상태를 확인합니다.
2. route 입력을 Zod로 검증합니다.
3. user-owned resource에는 소유권 조건을 포함한 storage 메서드를 작성합니다.
4. 비동기 handler를 `asyncHandler`로 감쌉니다.
5. cache가 있는 read model이면 mutation 후 invalidation을 추가합니다.
6. 외부 호출은 timeout, 민감정보 마스킹, 멱등성/재시도 정책을 명시합니다.
7. DB 변경이면 생성 migration, SQL 검토, 백업, 적용/검증/rollback을 준비합니다.
8. `npm run verify`와 위험 경로의 수동/integration test를 실행합니다.
9. README/관련 guide/MEMORY의 상태와 Known Issues를 갱신합니다.

## 11. Troubleshooting

### 앱 시작 즉시 필수 env 오류

`DATABASE_URL`, `SESSION_SECRET`을 확인합니다. `npm run dev`가 `.env`를 읽는다고 가정하지 말고 `./startShaki.sh`를 사용하세요.

### 세션이 유지되지 않음

- `sessions` table 존재
- frontend request의 credentials 포함
- `CORS_ORIGINS`가 path 없는 정확한 origin인지
- 운영 HTTPS에서 secure cookie와 `X-Forwarded-Proto`/`X-Original-Proto`
- API Gateway가 Cookie header를 보존하는지

### 결제 route가 503

해당 router의 enable key가 없는 정상 비활성 상태일 수 있습니다. 비밀값은 출력하지 말고 env 존재 여부와 서버 시작의 enable 상태 로그만 확인합니다.

### DB 연결은 되지만 migration 실패

앱의 개발 DB SSL 기본값과 Drizzle CLI 기본값이 다릅니다. 로컬 평문 PostgreSQL은 `DB_SSL=false`를 명시하세요. 운영은 CA와 인증 설정을 먼저 확인합니다. 현재 앱은 CA 파일이 없으면 경고 후 identity 검증 없는 TLS로 계속 연결하므로, 이 로그가 보이면 정상 기동으로 취급하지 않습니다.

### 배포 후 health는 200인데 API가 실패

`/api/health`는 DB readiness를 검사하지 않습니다. DB 연결 시작 로그, `SELECT 1`, 세션 table, CORS를 별도로 확인합니다.

## Related Documents

- [README](./README.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [DevOps](./docs/DEVOPS.md)
- [Schema Migration Guide](./SCHEMA_MIGRATION_GUIDE.md)
- [NaverPay Guide](./docs/NAVERPAY_GUIDE.md)
- [MEMORY](./MEMORY.md)
