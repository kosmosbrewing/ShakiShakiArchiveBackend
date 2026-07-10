# AGENTS.md

## Scope

- 이 파일은 `ShakiShakiArchiveBackend/` 전체에 적용된다.
- 사용자 요청과 더 깊은 경로의 규칙 파일이 이 문서보다 우선한다.

## Source of Truth

- 런타임 동작은 `server/`, `shared/`, `package.json`, `Dockerfile`을 기준으로 판단한다.
- 환경 변수는 `.env.example`과 `server/config/`의 참조만 문서화한다. 실제 `.env*` 값은 읽거나 출력하지 않는다.
- 인프라는 `.github/workflows/`와 Dockerfile로 확인 가능한 범위까지만 확정한다. 실제 AWS 리소스 상태는 `Needs Verification`이다.
- 날짜가 붙은 릴리스·품질 문서는 역사 기록이며 현재 운영 가이드로 사용하지 않는다.

## Start Protocol

1. `git status --short --branch`로 사용자 변경을 확인하고 보존한다.
2. `rg --files`와 `rg`로 대상 코드·규칙·문서를 먼저 찾는다.
3. `MEMORY.md`의 Known Issues와 Needs Verification을 확인한다.
4. 인증·결제·DB·배포 변경은 영향, 롤백, 검증 방법을 먼저 정리한다.

## Stack and Conventions

- Node.js 20, TypeScript ESM, Express 4, PostgreSQL, Drizzle ORM, Zod를 유지한다.
- 라우트는 `server/routes`, 외부 연동은 `server/services`, DB 접근은 `server/storage.ts`, 공용 스키마·상수는 `shared/`에 둔다.
- 세션 인증은 PostgreSQL `sessions` 테이블을 사용한다. 관리자 API는 인증과 관리자 2차 인증을 모두 요구해야 한다.
- 외부 입력은 Zod 또는 동등한 명시적 검증을 거치고, 비동기 라우트는 `asyncHandler`로 중앙 에러 처리에 연결한다.
- 로그에 비밀번호, 토큰, 쿠키, 결제 비밀값, 개인키를 남기지 않는다.
- `isAuthenticated`의 현재 debug cookie/session preview는 Known Issue다. 새 로그에서 이를 답습하지 말고 제거 전까지 운영 `LOG_LEVEL`을 debug로 낮추지 않는다.

## Commands

- 설치: `npm ci`
- 로컬 시작(`.env` 자동 로드): `./startShaki.sh`
- 현재 셸 환경으로 개발 실행: `npm run dev`
- 종료(`startShaki.sh`로 시작한 경우): `./stopShaki.sh`
- 문서 검사: `npm run docs:lint`
- 타입 검사: `npm run check`
- 빌드: `npm run build`
- 전체 정적 검증: `npm run verify`
- 마이그레이션 생성/적용: `npm run db:generate`, `npm run db:migrate`
- 관리자 생성: 환경 변수를 셸에 주입한 뒤 `npm run admin:create`

## Safety Rules

- 운영 DB에서 `npm run db:push`를 사용하지 않는다. 백업, 생성 SQL 검토, 적용, 검증, 롤백 순서를 지킨다.
- 마이그레이션 파일은 현재 `.gitignore` 대상이다. 추적 정책이 결정되기 전에는 로컬 파일을 배포 이력의 근거로 간주하지 않는다.
- ignored one-off `server/scripts/migrate-*.ts`는 fresh clone 검증과 일치하도록 `tsconfig.json`에서 제외한다. 운영 도구로 승격하려면 먼저 추적·검토·rollback 정책을 정한다.
- 결제 콜백·승인·취소는 중복 호출, PG 성공 후 DB 실패, 재시작·다중 인스턴스 상태를 반드시 검토한다.
- 인증 쿠키 변경 시 `secure`, `sameSite`, CORS credentials, proxy 헤더를 함께 검증한다.
- 배포 워크플로, 스키마, 데이터 삭제 가능 스크립트는 사용자 확인 또는 dry-run/백업/롤백 안전장치 없이 실행하지 않는다.
- `main` push는 `.github/workflows/deploy-ecr.yml`을 통해 ECS 배포를 촉발할 수 있다. 설정·하네스 변경도 배포 대상이므로 push 전 실제 workflow/secret/대상 service와 변경 범위를 확인한다.
- workflow의 `paths-ignore: "*.md"`가 중첩 `docs/**`까지 제외하는지는 검증되지 않았다. 문서-only push도 안전하다고 가정하지 않는다.
- 실제 AWS 배포, PG 호출, 이메일·Telegram 발송, 프론트엔드 동기화는 검증 명령에 포함하지 않는다.
- `scripts/sync-shared.sh`는 consumer가 확인되지 않은 legacy 스크립트이며 `rsync --delete`를 사용한다. 실행하거나 지원 명령으로 안내하지 않는다.

## Done Criteria

- 문서만 변경해도 `npm run docs:lint`를 실행한다.
- 코드·설정·스크립트 변경 시 `npm run verify`를 실행한다.
- 현재 자동 테스트와 source-code lint 스크립트는 없다(`docs:lint`는 문서 전용). 해당 검증을 실행한 것처럼 보고하지 않고 잔여 리스크로 명시한다.
- 최종 보고에는 변경 파일, 코드 근거, 실행한 검증, 미검증 운영 항목을 포함한다.

## Response

- 설명은 한국어로, 코드 식별자와 에러 메시지는 영어로 작성한다.
- 리뷰는 `Findings -> Open Questions -> Summary` 순서를 따른다.
