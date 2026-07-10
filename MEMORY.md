# MEMORY.md - ShakiShaki Archive Backend

> 현재 코드 기준 가변 현황이다. 불변 작업 규칙은 `AGENTS.md`와 `Codex.md`를 따른다.
> Last audited: 2026-07-10 12:06 (KST)

## Current Status

### Done

- [x] Express API는 `/api` 아래에 마운트되고 `/api/health` liveness 응답을 제공한다.
- [x] PostgreSQL 세션 인증, 관리자 권한, 관리자 2차 인증 경로가 구현되어 있다.
- [x] 상품·카테고리·variant·장바구니·주문·반품·문의·위시리스트·배송지·SEO/feed API가 등록되어 있다.
- [x] Toss, KakaoPay, NaverPay 결제형/주문형 코드는 환경 변수 기반으로 선택 활성화된다.
- [x] graceful shutdown, 프로세스 에러 로깅, 자동 구매확정, 유령 주문/재고 선점 정리가 등록되어 있다.
- [x] README, 운영 가이드, 아키텍처, DevOps, 환경 변수, 개발·검증 하네스를 코드 기준으로 재감사했다.

### In Progress

- [ ] 실제 운영 환경의 활성 PG·배포 경로·DB 마이그레이션 상태를 운영자 증거와 대조한다.

### Blocked

- 없음.

### Needs Verification

- [ ] 운영 배포가 OIDC ECS workflow, Access Key ECR workflow, App Runner 중 무엇을 사용하는지 확인 | how: GitHub Actions 최근 실행과 AWS 서비스/태스크 ARN 확인
- [ ] `deploy-ecr.yml`의 `paths-ignore: "*.md"`가 중첩 문서 경로에서 어떻게 매칭되는지 확인 | how: 임시 브랜치/Actions path-filter 테스트 또는 GitHub pattern 문서 대조
- [ ] 운영에서 활성화된 OAuth/PG/이메일/검색 연동 확인 | how: 비밀값을 출력하지 않고 환경 변수 존재 여부와 각 `/client-info`/헬스 로그 확인
- [ ] 운영 DB가 `shared/schema.ts`와 어떤 마이그레이션 버전까지 일치하는지 확인 | how: 스키마 diff와 `migrations/meta/_journal.json` 대조
- [ ] `sessions` 테이블과 `IDX_session_expire` 존재 확인 | how: `\d+ sessions` 또는 `pg_indexes` 조회
- [ ] 운영 CORS allowlist, secure cookie, proxy 헤더가 실제 프론트엔드 origin에서 동작하는지 확인 | how: credential 포함 브라우저 preflight/login smoke test
- [ ] Docker `HEALTHCHECK`가 runner 이미지에서 실행되는지 확인 | how: 이미지 빌드 후 health status와 `wget` 명령 확인

## Decisions Log

- 2026-07-10 11:25 (KST) | 결정: 코드·추적 설정을 현재 문서의 단일 진실 소스로 사용 | 이유: 기존 문서에 미검증 인프라·성능 수치가 포함됨 | 영향: README/ARCHITECTURE/DEVOPS/가이드 | ref: `server/`, `package.json`, `Dockerfile`, `.github/workflows/` | 되돌림 조건: 운영 IaC와 관측 자료가 저장소에 추가됨
- 2026-07-10 11:25 (KST) | 결정: 날짜가 붙은 RELEASE/QUALITY 문서는 역사 스냅샷으로 보존 | 이유: 당시 의사결정 추적성 유지 | 영향: 현재 가이드와 분리 | ref: `docs/RELEASE_2026-07-08.md`, `docs/QUALITY_IMPROVEMENTS_2026-07-08.md` | 되돌림 조건: 없음
- 2026-07-10 11:25 (KST) | 결정: 운영 DB에는 `db:push`를 금지하고 생성 마이그레이션만 사용 | 이유: 데이터 손실/드리프트 방지 | 영향: 스키마 배포 | ref: `SCHEMA_MIGRATION_GUIDE.md` | 되돌림 조건: 없음
- 2026-07-10 11:25 (KST) | 결정: `main` push를 잠재적 production ECS 배포로 취급 | 이유: `deploy-ecr.yml`의 push trigger | 영향: 설정·하네스·문서 전달 | ref: `.github/workflows/deploy-ecr.yml` | 되돌림 조건: workflow trigger 또는 배포 브랜치 정책 변경

## Operational Params

- HTTP port: `8080` | default: 8080 | source: `server/config/index.ts` | changedAt: 2026-07-10 11:25 (KST)
- Request body: `1mb` JSON/urlencoded | source: `server/index.ts` | changedAt: 2026-07-10 11:25 (KST)
- Session TTL: 7 days | source: `shared/constants/security.ts` | changedAt: 2026-07-10 11:25 (KST)
- Graceful shutdown timeout: 10 seconds | source: `server/index.ts` | changedAt: 2026-07-10 11:25 (KST)
- DB pool: dev max 10, prod max 20, min 2, idle 30s, connect 10s | source: `shared/constants/database.ts`, `server/db.ts` | changedAt: 2026-07-10 11:25 (KST)
- Rate limits: global 1000/15m, auth 15/15m, email 3/5m, payment 10/1m, admin 300/5m | source: `shared/constants/security.ts` | changedAt: 2026-07-10 11:25 (KST)
- Auto-confirm: daily 03:00 Asia/Seoul, 7 days after item delivery | source: `shared/constants/scheduler.ts` | changedAt: 2026-07-10 11:25 (KST)
- Ghost order cleanup: every 1m, pending/paying older than 5m | source: `shared/constants/scheduler.ts` | changedAt: 2026-07-10 11:25 (KST)
- Stock reservation cleanup: every 1m, TTL 3m | source: `shared/constants/scheduler.ts` | changedAt: 2026-07-10 11:25 (KST)

## Known Issues

- 이슈: 관리자 2차 인증 복구 코드에 코드 fallback이 존재한다.
  - severity: high
  - owner: operator
  - 재현: `ADMIN_2FA_RECOVERY_CODE`가 없는 환경에서 config 초기화
  - 로그 포인트: `server/config/index.ts`, `server/routes/auth.routes.ts`
  - next probe: 운영 환경에 별도 비밀값이 주입되었는지 값 노출 없이 확인
- 이슈: `migrations/`가 `.gitignore` 대상이라 현재 로컬 SQL과 배포 이력의 일치가 보장되지 않는다.
  - severity: high
  - owner: maintainer
  - 재현: `git check-ignore -v migrations/0000_cuddly_wolf_cub.sql`
  - 로그 포인트: `.gitignore`, `drizzle.config.ts`
  - next probe: 마이그레이션 추적/보관 정책 결정 후 운영 DB 스키마 diff
- 이슈: ignored one-off `server/scripts/migrate-*.ts`는 fresh clone에 없으며 현재 `tsconfig.json`에서도 명시적으로 제외한다.
  - severity: med
  - owner: maintainer
  - 재현: `git status --ignored --short server/scripts`와 `npx tsc --listFilesOnly` 대조
  - 로그 포인트: `.gitignore`, `tsconfig.json`
  - next probe: 폐기하거나, 운영 도구로 필요하면 추적 전환·idempotency·rollback 검토 후 별도 command로 승격
- 이슈: Drizzle CLI/custom migration runner는 SSL 사용 시 server certificate identity 검증을 비활성화한다.
  - severity: high
  - owner: maintainer
  - 재현: `drizzle.config.ts`와 `server/scripts/run-migration.ts`의 SSL option 확인
  - 로그 포인트: `rejectUnauthorized: false`, `checkServerIdentity`
  - next probe: 운영 migration 전 CA 기반 identity 검증 설정과 연결 smoke test
- 이슈: application DB client도 SSL 활성 상태에서 CA 경로가 없거나 파일이 누락되면 경고만 남기고 identity 검증 없는 TLS로 fail-open한다.
  - severity: high
  - owner: maintainer/operator
  - 재현: `NODE_ENV=production`, `DB_SSL=true`, 존재하지 않는 `DB_SSL_CA`로 `server/db.ts`의 `getSslConfig()` 분기 확인
  - 로그 포인트: `인증서 경로를 찾을 수 없음`, `rejectUnauthorized: false`
  - next probe: production에서 CA 누락을 startup failure로 바꾸고 정상/누락 CA integration test 추가
- 이슈: 인증 debug 로그가 cookie 앞부분과 session ID 일부를 기록한다.
  - severity: high
  - owner: maintainer
  - 재현: `LOG_LEVEL=debug`에서 인증 필요 endpoint 호출 후 로그 확인
  - 로그 포인트: `server/middleware/auth.middleware.ts`의 `cookiePreview`, `sessionId`
  - next probe: 해당 필드를 제거하고 로그 회귀 테스트 추가; 제거 전 운영 debug 로그 금지
- 이슈: HTTP logger는 full URL/query/userEmail/response summary를 raw로 남길 수 있고, 외부 HTTP logger는 문자열/XML request와 provider response를 마스킹하지 않는다. non-2xx는 production 기본 WARN에도 남는다.
  - severity: high
  - owner: maintainer
  - 재현: query/response/XML에 canary PII를 넣은 요청과 provider 4xx fixture의 captured log 검사
  - 로그 포인트: `server/middleware/logger.middleware.ts`, `server/utils/http-client.ts`
  - next probe: field allowlist/redaction을 request·response·URL·문자열 payload 전체에 적용하고 log leakage test 추가
- 이슈: 결제 취소 성공 후 DB 반영 실패를 자동 보상하는 durable workflow가 없다.
  - severity: high
  - owner: maintainer
  - 재현: PG 취소 성공 직후 DB update 실패를 fault injection
  - 로그 포인트: `server/routes/order.routes.ts`, `server/routes/kakaopay.routes.ts`
  - next probe: 멱등 재처리 상태/운영 runbook 설계
- 이슈: 일반 direct order는 전달된 variant가 product에 속하는지 확인하지 않고, transaction에서 variant ID 대신 `productId + size`로 재조회하며 활성 상태도 필터하지 않는다.
  - severity: high
  - owner: maintainer
  - 재현: 다른 상품의 active variant ID 또는 대상 상품의 비활성 동일-size variant로 direct order 시도
  - 로그 포인트: `server/routes/order.routes.ts`, `server/storage.ts`
  - next probe: productId+variantId+isAvailable을 같은 transaction의 lock query에서 검증하고 negative integration test 추가
- 이슈: NaverPay 주문형 register는 상품 활성 상태만 확인하고 variant 활성 상태·상품 소속을 검증하지 않는다.
  - severity: high
  - owner: maintainer
  - 재현: product A와 product B의 public variant UUID를 섞어 register 요청
  - 로그 포인트: `server/routes/naverpay-order.routes.ts`
  - next probe: provider enable 전 variant `productId`/`isAvailable` 거부 검증과 가격 회귀 테스트 추가
- 이슈: NaverPay 주문형은 guest register를 허용하지만 payment-complete에서 `guest`/비UUID user를 즉시 반환해 내부 주문·재고·발주확인이 완료되지 않는다.
  - severity: high
  - owner: maintainer/product
  - 재현: 비로그인 CART register 후 `merchantCustomCode1=guest`인 PAYMENT_COMPLETE notification 처리
  - 로그 포인트: `server/routes/naverpay-order.routes.ts`의 `handlePaymentComplete`
  - next probe: guest 진입을 차단하거나 guest identity/order schema와 completion integration test를 완성
- 이슈: NaverPay 주문형 상품/도서산간 API가 bracket query의 extended parsing을 가정하지만 Express parser 설정이 명시되지 않았다.
  - severity: high
  - owner: maintainer
  - 재현: `product[0][id]`, `productId[0]` 요청의 실제 `req.query` integration test
  - 로그 포인트: `server/index.ts`, `server/routes/naverpay-order.routes.ts`
  - next probe: NaverPay 주문형 enable 전에 parser/validation 회귀 테스트와 안전한 설정 결정
- 이슈: NaverPay 결제형 debug/info 로그가 full query, payment ID/error object, client ID 일부를 남긴다.
  - severity: med
  - owner: maintainer
  - 재현: sandbox callback/apply 실패 후 로그 필드 확인
  - 로그 포인트: `server/routes/naverpay.routes.ts`, `server/services/naverpay.service.ts`
  - next probe: NaverPay enable 전 provider 로그 최소화/마스킹 테스트
- 이슈: 자동화된 테스트와 source-code lint 명령이 없다(`docs:lint`는 문서 전용).
  - severity: med
  - owner: maintainer
  - 재현: `npm run` 확인
  - 로그 포인트: `package.json`
  - next probe: 인증/결제/핵심 API 통합 테스트부터 추가
- 이슈: `shared/schema.ts`의 legacy `orderStatusEnum`과 `shared/constants/order.ts`의 현재 상태 집합이 다르다.
  - severity: med
  - owner: maintainer
  - 재현: 두 배열에서 `purchase_confirmed`, `refunding`, `partial_refunded` 비교
  - 로그 포인트: `shared/schema.ts`, `shared/constants/order.ts`
  - next probe: 단일 상태 source로 통합하고 transition 테스트 추가
- 이슈: `/api/health`는 DB·외부 서비스 readiness를 검사하지 않는다.
  - severity: med
  - owner: maintainer
  - 재현: DB 연결을 끊어도 프로세스가 떠 있으면 200 반환
  - 로그 포인트: `server/routes/index.ts`
  - next probe: liveness와 readiness endpoint 분리 여부 결정
- 이슈: rate limit과 일부 캐시는 프로세스 메모리 기반이라 다중 인스턴스에서 전역 제한/일관성을 보장하지 않는다.
  - severity: med
  - owner: maintainer
  - 재현: 둘 이상의 task에 동일 요청 분산
  - 로그 포인트: `server/config/security.ts`, `server/middleware/auth.middleware.ts`
  - next probe: 실제 task 수 확인 후 shared store 필요성 평가
- 이슈: `scripts/sync-shared.sh`의 실제 consumer가 확인되지 않고 대상에 `rsync --delete`, fallback에서는 `rm -rf`를 사용한다. 현재는 명시적 opt-in과 대상 구조 검증 없이는 실패하도록 잠갔다.
  - severity: med
  - owner: maintainer
  - 재현: opt-in 없이 실행하면 비활성 안내와 exit 1 확인
  - 로그 포인트: `ALLOW_UNSUPPORTED_SHARED_SYNC`, `FRONTEND_PATH`, `rsync --delete`, `rm -rf "$FRONTEND_SHARED"`
  - next probe: consumer와 schema compatibility 확인 전 opt-in 금지; 확인되지 않으면 제거 결정

## Next Tasks

- [ ] (P0) 운영 `ADMIN_2FA_RECOVERY_CODE` 명시 주입 여부 확인
- [ ] (P0) 인증 debug 로그의 cookie/session preview 제거 및 로그 마스킹 테스트
- [ ] (P0) URL/query/response/provider 문자열 payload 로그 sanitize와 leakage test
- [ ] (P0) 일반/NaverPay 주문의 variant-product·활성 상태를 transaction에서 검증
- [ ] (P0) NaverPay guest 주문을 명시적으로 차단하거나 end-to-end completion 구현
- [ ] (P0) 마이그레이션 버전 관리 정책 결정 및 운영 DB schema drift 점검
- [ ] (P0) PG 성공/DB 실패 결제 취소 재처리 runbook 또는 outbox 설계
- [ ] (P1) 인증 성공/실패, 관리자 2FA, 결제 중복, 주문 권한 통합 테스트 추가
- [ ] (P1) 실제 배포 workflow/ECR repository/runtime topology 확정
- [ ] (P1) DB readiness endpoint와 배포 health check 정책 결정
- [ ] (P2) 문의 목록 pagination 및 다중 인스턴스 rate-limit store 검토
