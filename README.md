# ShakiShaki Archive Backend

ShakiShaki Archive 커머스의 상품, 재고, 주문, 반품, 회원, 관리자, 선택형 결제·외부 연동을 제공하는 Express API 서버입니다.

이 문서는 2026-07-10 현재 `server/`, `shared/`, `package.json`, `Dockerfile`, `.github/workflows/`를 기준으로 작성되었습니다. 실제 운영 인프라와 활성화된 외부 서비스는 저장소만으로 확정하지 않습니다.

## Current Stack

- Node.js 20, TypeScript 5.6, ESM
- Express 4, Zod/Drizzle Zod
- PostgreSQL, `pg` connection pool, Drizzle ORM
- PostgreSQL-backed `express-session`
- esbuild production bundle, multi-stage Docker image
- Optional: Naver/Kakao OAuth, Kakao 주소 검색, Toss/KakaoPay/NaverPay, Resend, Telegram, Cloudinary, Meilisearch, GA4

## Quick Start

요구 사항은 Node.js 20, npm, PostgreSQL입니다.

```bash
npm ci
cp .env.example .env
```

`.env`에서 최소 `DATABASE_URL`, 임의 생성한 `SESSION_SECRET`, 로컬 프론트엔드 origin을 확인합니다. 예시는 로컬 개발값이며 실제 비밀값을 커밋하면 안 됩니다.

신규 로컬 DB만 빠르게 맞출 때:

```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/shakishaki_dev'
export DB_SSL=false
npm run db:push
```

`db:push`는 로컬 프로토타이핑 전용입니다. 운영에서는 사용하지 말고 [안전한 스키마 변경 가이드](./SCHEMA_MIGRATION_GUIDE.md)를 따르세요. 현재 `migrations/`가 Git ignore 대상이므로, fresh clone/운영 적용 전에 마이그레이션 추적 정책과 DB drift를 먼저 확인해야 합니다.

`.env`를 자동 로드해 시작하려면:

```bash
./startShaki.sh
```

종료는 같은 터미널에서 `Ctrl-C`를 누르거나 다른 터미널에서 다음을 실행합니다.

```bash
./stopShaki.sh
```

PID 파일 위치를 바꿀 때는 `.env`가 아니라 두 shell 명령에 같은 값을 직접 주입합니다.

```bash
SHAKISHAKI_PID_FILE=/tmp/shakishaki-backend.pid ./startShaki.sh
SHAKISHAKI_PID_FILE=/tmp/shakishaki-backend.pid ./stopShaki.sh
```

두 스크립트는 같은 operation lock과 PID 시작 시각을 검증합니다. 시작/종료가 동시에 진행 중이거나 PID identity가 일치하지 않으면 다른 프로세스를 건드리지 않고 실패합니다.

`npm run dev`와 DB/admin package scripts는 `.env`를 자동 로드한다고 가정하지 않습니다. 이미 환경 변수를 셸/IDE에서 주입한 경우에만 직접 사용하세요.

```bash
curl -i http://localhost:8080/api/health
```

정상 응답은 `200`과 `{"status":"ok", ...}`입니다. 이 endpoint는 프로세스 liveness만 확인하며 DB readiness는 검사하지 않습니다.

## Validation

```bash
npm run docs:lint  # 추적 문서/링크, server·shared env catalog, package 실행 대상
npm run check      # TypeScript noEmit
npm run build      # dist/index.js esbuild bundle
npm run verify     # 위 세 검증을 순서대로 실행
```

현재 자동 테스트와 source-code lint 스크립트는 없습니다. 인증·결제·주문 변경은 정적 검증만으로 완료로 간주하면 안 됩니다.

## Runtime Model

요청 처리 순서는 대략 다음과 같습니다.

```text
Helmet → global rate limit → proxy header normalization
→ JSON/urlencoded parser (1 MiB) → CORS → PostgreSQL session
→ user population → compression → request logger
→ /api routes → central error handler
```

- 운영 `CORS_ORIGINS`는 필수이고 `*`는 거부됩니다.
- 운영 cross-origin cookie는 `secure=true`, `sameSite=none`; 로컬은 `secure=false`, `sameSite=lax`입니다.
- 관리자 API는 일반 세션 인증, DB의 `isAdmin`, 관리자 2차 인증 완료 상태를 모두 요구합니다.
- 운영 로그는 자체 콘솔 JSON 로거를 사용하며 기본 레벨은 `WARN`입니다. Winston/File transport는 사용하지 않습니다.
- SIGTERM/SIGINT 시 HTTP drain 후 DB pool을 닫고, 10초 제한을 둡니다.

상세 구조는 [Architecture](./docs/ARCHITECTURE.md), 운영 동작은 [DevOps](./docs/DEVOPS.md)를 참고하세요.

## API Surface

모든 경로는 `/api` 아래에 있습니다.

| 영역 | Prefix | 기본 접근 |
| --- | --- | --- |
| 상태 | `/health` | public |
| 인증/회원 | `/auth`, `/oauth` | 혼합; OAuth는 Naver/Kakao |
| 카탈로그 | `/products`, `/categories`, `/variants` | public |
| 검색/SEO/feed | `/search`, `/search/products`, `/seo`, `/feeds`, `/constants` | 대체로 public |
| 사이트 이미지/문의 | `/site-images`, `/inquiries` | 혼합 |
| 사용자 데이터 | `/cart`, `/orders`, `/returns`, `/wishlist`, `/user/addresses` | session |
| 결제형 | `/payments`, `/payments/kakaopay`, `/payments/naverpay` | 기능별 환경 변수 + 혼합 callback/session |
| 네이버페이 주문형 | `/naverpay-order` | `NAVERPAY_CERTI_KEY`가 있을 때만 router 활성 |
| 관리자 | `/admin` | session + admin + admin 2FA |

실제 endpoint와 권한은 [Backend Guide](./BACKEND_GUIDE.md)와 각 `server/routes/*.routes.ts`가 기준입니다. 비활성 결제 router는 일반적으로 `503`을 반환합니다.

## Core Domains

- 상품, 카테고리, variant, 실측, 이미지, 검색, SEO/feed
- 세션 기반 회원가입/로그인, 이메일 인증, 비밀번호 변경/재설정, Naver/Kakao OAuth
- 장바구니, 위시리스트, 배송지, 주문, 아이템 단위 배송/구매확정, 부분 취소와 반품
- 관리자 상품·주문·결제·회원·문의·사이트 이미지·통계·이메일 미리보기
- 환경 변수로 선택 활성화되는 Toss, KakaoPay, NaverPay 결제형과 NaverPay 주문형
- Resend 이메일, Telegram 알림, Cloudinary 업로드, Meilisearch, GA4, 프론트엔드 repository dispatch

결제 제공자의 코드 존재는 운영 활성화를 뜻하지 않습니다. 활성 PG와 callback 등록 상태는 배포 환경에서 별도 확인해야 합니다.

## Background Work

서버 시작 후 다음 작업이 프로세스 내부에서 실행됩니다.

- 아이템 자동 구매확정: 매일 `03:00 Asia/Seoul`, 배송완료 7일 후
- 유령 주문 정리: 1분마다, `pending_payment`/`paying` 5분 초과 주문의 재고 복구와 삭제
- legacy 재고 선점 정리: 1분마다, TTL 3분
- KakaoPay `tid` 메모리 정리: 5분마다, TTL 15분

여러 인스턴스에서는 각 프로세스가 스케줄러를 등록합니다. DB lock을 사용하는 자동 구매확정 외 작업의 다중 실행 영향은 실제 task 수와 함께 검증해야 합니다.

## Database and Migrations

스키마 정의는 `shared/schema.ts`, Drizzle 설정은 `drizzle.config.ts`입니다.

```bash
npm run db:generate
npm run db:migrate
```

중요 사항:

- 세션 store는 `sessions` 테이블을 자동 생성하지 않습니다.
- 앱 DB SSL 기본값은 production=true/development=false이지만 Drizzle CLI는 `DB_SSL=false`가 아니면 SSL을 사용합니다.
- 앱은 SSL이 켜져도 CA 파일을 찾지 못하면 현재 경고 후 `rejectUnauthorized=false`로 계속 연결합니다. 운영에서는 CA 경로/파일을 배포 전 검증해야 하며 이 fallback을 안전한 상태로 간주하면 안 됩니다.
- 운영 변경 전 백업과 생성 SQL 검토가 필수입니다.
- 로컬 `migrations/`와 운영 DB의 실제 적용 버전은 현재 Needs Verification입니다.

## Environment

전체 키, 기본값, 활성화 조건은 [.env.example](./.env.example)을 참고하세요.

- 필수: `DATABASE_URL`, `SESSION_SECRET`
- 운영 필수: `CORS_ORIGINS`
- 운영 보안 필수: `ADMIN_2FA_RECOVERY_CODE`를 별도 secret으로 명시 주입
- 결제/외부 서비스: 관련 키가 없으면 비활성 또는 no-op

실제 `.env`/`.env.production` 값은 문서나 이슈에 복사하지 마세요.

## Docker and Delivery

```bash
docker build -t shakishaki-archive-backend .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL='postgresql://...' \
  -e SESSION_SECRET='...' \
  -e CORS_ORIGINS='https://frontend.example' \
  shakishaki-archive-backend
```

Docker image는 non-root user, Node 20 Alpine, RDS CA bundle, `/api/health` healthcheck를 사용합니다.

저장소에는 다음 delivery 경로가 함께 존재합니다.

- `.github/workflows/deploy-ecr.yml`: OIDC로 ECR push 후 ECS task definition 배포
- `.github/workflows/deploy-ecr-accesskey.yml`: 수동 Access Key 방식 ECR push만 수행
- ignored local `deploy-ecr.sh`: ECR push 후 App Runner 사용법을 출력

repository 이름과 동작이 서로 다르므로 실제 운영 경로를 확인하기 전 하나를 표준이라고 가정하지 않습니다. 자세한 내용은 [DevOps](./docs/DEVOPS.md)를 보세요.

## Project Layout

```text
server/
  config/       env, CORS, session, security
  middleware/   auth, error, cache, ETag, logging, proxy headers
  routes/       public/session/payment/admin routers
  services/     external providers
  jobs/         in-process schedulers
  utils/        HTTP client, logging, SEO/feed, cleanup
  index.ts      app composition and shutdown
shared/
  schema.ts     Drizzle tables and Zod schemas
  constants/    domain and operational constants
docs/           architecture, operations, integrations, history
scripts/        documentation check and fail-closed unsupported legacy shared sync
```

## Documentation Map

- [Backend Guide](./BACKEND_GUIDE.md): API 영역, 인증, 데이터 모델, 개발 패턴
- [Architecture](./docs/ARCHITECTURE.md): 코드 기준 컴포넌트·요청 흐름·정합성 경계
- [DevOps](./docs/DEVOPS.md): 빌드, Docker, workflow, 관측, runbook
- [NaverPay Guide](./docs/NAVERPAY_GUIDE.md): 이 저장소의 결제형/주문형 구현
- [Technical Challenges](./docs/TECHNICAL-CHALLENGES.md): 현재 설계 선택과 남은 위험
- [Schema Migration Guide](./SCHEMA_MIGRATION_GUIDE.md): 안전한 DB 변경 절차
- [MEMORY](./MEMORY.md): 현재 상태, 운영 파라미터, Known Issues, Next Tasks
- [AGENTS](./AGENTS.md), [Codex](./Codex.md): 작업 하네스와 완료 기준
- `docs/RELEASE_2026-07-08.md`, `docs/QUALITY_IMPROVEMENTS_2026-07-08.md`: 역사 스냅샷

## Known Gaps

- 자동 테스트와 source-code lint가 없습니다.
- migrations가 Git ignore 대상입니다.
- health endpoint가 DB readiness를 포함하지 않습니다.
- 관리자 2차 인증 복구 코드는 운영에서 환경 변수로 반드시 덮어써야 하는 코드 fallback이 있습니다.
- 인증 debug 로그에 cookie/session preview가 있어 운영에서 debug 레벨을 켜기 전에 제거해야 합니다.
- HTTP URL/query/response와 외부 문자열 payload는 마스킹되지 않을 수 있으며 provider non-2xx는 운영 WARN에 남습니다.
- 일반 direct order와 NaverPay 주문형 register에 variant-product/활성 상태 검증 공백이 있습니다.
- NaverPay 주문형 guest register는 가능하지만 결제 완료 후 내부 주문·재고·발주확인이 이어지지 않습니다.
- 결제 취소의 PG 성공 뒤 DB 실패에 대한 durable compensation/retry가 없습니다.
- rate limit과 사용자 캐시는 프로세스 메모리 기반입니다.
- 실제 배포 토폴로지, 활성 PG, 운영 마이그레이션 상태는 Needs Verification입니다.

우선순위와 probe는 [MEMORY.md](./MEMORY.md)에 유지합니다.
