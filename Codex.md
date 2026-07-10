# Codex.md - ShakiShaki Archive Backend

## Goal

- 빈티지 커머스의 상품·재고·주문·반품·결제·회원 API를 데이터 정합성을 보존하며 운영한다.
- 문서와 하네스는 현재 코드에 없는 인프라, 성능, 활성 서비스 상태를 사실처럼 주장하지 않는다.

## Priority

1. 사용자 명시 요청
2. `AGENTS.md`와 이 문서
3. 기존 코드·테스트·설정의 로컬 컨벤션
4. 상위 Codex 기본 규칙

## Stack Profile

- Runtime: Node.js 20, TypeScript 5.6, ESM
- API: Express 4, Zod/Drizzle Zod, 중앙 `asyncHandler`/`errorHandler`
- DB: PostgreSQL + `pg` pool + Drizzle ORM
- Auth: `express-session` + PostgreSQL `sessions`, httpOnly cookie, 관리자 2차 인증
- Build: esbuild, Docker multi-stage image
- Delivery code: ECR/ECS GitHub Actions 두 종류와 로컬 ECR 스크립트가 존재한다. 실제 사용 경로는 미검증이다.
- Optional integrations: Naver/Kakao OAuth, Kakao 주소 검색, Toss/KakaoPay/NaverPay, Resend, Telegram, Cloudinary, Meilisearch, GA4

## Non-Goals

- 현재 저장소만 보고 실제 운영 PG, AWS 토폴로지, SLA, 비용, 성능 수치를 확정하지 않는다.
- 신규 프레임워크·ORM·인증 방식으로 교체하지 않는다.
- 운영 DB에 `db:push`를 실행하지 않는다.
- 날짜가 붙은 역사 문서를 현재 상태 문서로 덮어쓰지 않는다.

## Must Rules

- 입력 검증, 명시적 CORS, Helmet, 1 MiB body 제한, rate limit, 중앙 에러 처리를 유지한다.
- 관리자 권한은 세션 인증 + DB 관리자 여부 + `admin2faVerifiedAt`을 모두 확인한다.
- 결제 상태 전이는 원자적 상태 조건과 중복 요청 처리를 우선하며, PG 성공 뒤 DB 실패를 고위험으로 취급한다.
- 외부 HTTP 호출은 timeout을 사용한다. 직접 `fetch`를 추가할 때는 `AbortSignal`과 민감정보 마스킹을 포함한다.
- 스키마 변경은 버전 마이그레이션, 백업, 적용 후 SQL 검증, 명시적 롤백 절차를 동반한다.

## Environment

- 필수: `DATABASE_URL`, `SESSION_SECRET`
- 운영 필수: 비어 있지 않은 `CORS_ORIGINS`; `*` 금지
- 운영 보안 필수: `ADMIN_2FA_RECOVERY_CODE`를 별도 비밀값으로 명시 주입
- 선택 기능은 관련 키가 있을 때만 활성화된다. 기준은 `.env.example`과 `server/config/index.ts`다.
- 실제 `.env`, `.env.production`, 비밀 저장소 값은 출력하거나 문서에 복사하지 않는다.

## Commands

- dev: `./startShaki.sh` 또는 환경 주입 후 `npm run dev`
- docs: `npm run docs:lint`
- type check: `npm run check`
- build: `npm run build`
- verify: `npm run verify`
- migration: `npm run db:generate && npm run db:migrate`
- local schema prototype only: `npm run db:push`
- test/source lint: 현재 스크립트 없음 (`docs:lint`는 문서 전용)

## Done Criteria

- `npm run verify` 성공.
- 인증/결제/DB 변경이면 성공·실패·중복/권한·롤백 경로를 별도 검증.
- `/api/health`는 현재 프로세스 liveness만 확인하므로 DB readiness로 보고하지 않음.
- 실행하지 못한 외부 연동·운영 검증과 이유를 보고.

## Delivery Rules

- 사용자 변경을 보존하고 관련 파일만 수정한다.
- 배포 워크플로 변경 전 실제 사용 워크플로와 secret 구성을 확인한다.
- 운영 마이그레이션 전에 추적되지 않는 `migrations/` 정책부터 해결한다.
- 구조화 로그의 `requestId`로 요청을 추적하며 민감 데이터 마스킹을 검증한다.

## Response Format

1. 결과
2. 변경 파일과 근거
3. 검증 명령과 결과
4. Needs Verification / 남은 리스크
