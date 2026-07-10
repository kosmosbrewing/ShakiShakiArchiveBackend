# CLAUDE.md

ShakiShaki Archive Backend 작업자는 먼저 다음을 읽습니다.

1. `AGENTS.md` — 저장소 작업 규칙과 안전 경계
2. `Codex.md` — stack profile과 완료 기준
3. `MEMORY.md` — 현재 상태, Known Issues, Needs Verification
4. `README.md` — 실행과 문서 지도

## Commands

```bash
npm ci
cp .env.example .env
./startShaki.sh       # .env 자동 로드
./stopShaki.sh
npm run docs:lint
npm run check
npm run build
npm run verify
```

`npm run dev`는 `.env`를 자동 로드하지 않습니다. 자동 테스트와 source-code lint script는 현재 없습니다.

DB 변경:

```bash
npm run db:generate
npm run db:migrate
```

운영에서 `npm run db:push`를 사용하지 않습니다. `migrations/`는 현재 Git ignore 대상이므로 DB 변경 전 추적 정책과 운영 schema drift를 먼저 해결합니다.

## Architecture

- Node.js 20 + TypeScript ESM + Express 4
- PostgreSQL + Drizzle ORM
- PostgreSQL-backed session cookie authentication
- routes: `server/routes/`
- external integrations: `server/services/`
- data access/transactions: `server/storage.ts`
- schema and shared policy: `shared/`
- app composition/startup/shutdown: `server/index.ts`

모든 endpoint는 `/api` 아래입니다. OAuth backend는 Naver/Kakao만 구현되어 있습니다. 결제 provider는 관련 env key가 있어야 활성화되며, 코드 존재는 운영 사용을 뜻하지 않습니다.

## High-risk Boundaries

- 실제 `.env`/`.env.production` 또는 secret 값을 읽어 문서·로그에 복사하지 않습니다.
- 인증 로그에 cookie/session/token preview를 추가하지 않습니다. 현재 auth debug preview는 Known Issue입니다.
- 결제 승인/취소는 중복 callback, PG 성공/DB 실패, idempotency와 reconciliation을 검토합니다.
- migration은 backup, SQL review, staging, verification, rollback/forward-fix를 포함합니다.
- `main` push는 ECS production 배포를 촉발할 수 있습니다. 설정·script 변경도 push 전에 workflow target을 확인합니다.
- AWS 배포, PG 호출, email/Telegram 발송, legacy `scripts/sync-shared.sh`는 명시 승인 없이 실행하지 않습니다.

## Documentation Rule

현재 설명은 코드/config를 근거로 하고 확인할 수 없는 infra, active provider, SLA, performance, cost는 `Needs Verification`로 기록합니다. 날짜가 붙은 release/quality 문서는 역사 snapshot입니다.
