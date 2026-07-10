# DevOps and Operations

> 코드 기준일: 2026-07-10. 저장소의 Dockerfile, GitHub Actions, application startup/shutdown을 설명합니다. 실제 AWS 설정, 최근 배포 결과, 비용·SLA·성능은 Needs Verification입니다.

## 1. Pre-deploy Gate

로컬/PR에서 먼저 실행할 정적 gate:

```bash
npm ci
npm run verify
```

`verify`가 실행하는 항목:

1. 필수 문서, Markdown 상대 링크, 코드 env key와 `.env.example` drift 검사
2. TypeScript `tsc --noEmit`
3. esbuild production bundle

현재 자동 테스트와 source-code lint가 없습니다. `verify` 성공은 인증·주문·결제의 runtime correctness를 보장하지 않습니다.

### CI gap

두 GitHub Actions workflow는 Docker build를 실행하지만 별도 `npm run check`, `npm run docs:lint`, test 단계를 실행하지 않습니다. Docker builder의 `npm run build`는 esbuild bundle이며 TypeScript type-check가 아닙니다. workflow 개선 전까지 push 전에 로컬 `npm run verify`가 필수입니다.

## 2. Docker Image

`Dockerfile`은 세 stage입니다.

| Stage | Base | Purpose |
| --- | --- | --- |
| `deps` | `node:20-alpine` | `npm ci --only=production` |
| `builder` | `node:20-alpine` | 전체 의존성 + esbuild bundle |
| `runner` | `node:20-alpine` | production dependencies + `dist` only |

Runner characteristics:

- UID/GID 1001 non-root user `expressjs`
- `NODE_ENV=production`, `PORT=8080`
- `NODE_OPTIONS=--dns-result-order=ipv4first`
- AWS global RDS CA bundle을 image build 중 다운로드
- `RDS_CA_BUNDLE=/app/certs/rds-ca-bundle.pem`
- `/api/health`를 30초 간격으로 검사하는 Docker HEALTHCHECK
- `node dist/index.js` 실행

### Local build smoke test

```bash
docker build -t shakishaki-archive-backend:local .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL='postgresql://...' \
  -e SESSION_SECRET='...' \
  -e CORS_ORIGINS='http://localhost:5173' \
  -e DB_SSL=false \
  shakishaki-archive-backend:local
curl -i http://localhost:8080/api/health
```

실제 비밀값을 shell history, CI log, 문서에 남기지 않습니다. 로컬 shell에서는 별도 env file/secret injection을 권장합니다.

### Docker Needs Verification

- 현재 `server/db.ts`는 CA 경로가 없거나 파일을 찾지 못해도 경고 후 `rejectUnauthorized=false`로 연결을 계속하는 fail-open 동작입니다. 운영 image/task에서 `RDS_CA_BUNDLE` 파일 존재와 검증 연결을 확인하기 전 TLS가 안전하다고 간주하지 않습니다.
- runner에서 CA 설치 후 `apk del wget` 뒤에도 BusyBox `wget`으로 HEALTHCHECK가 정상 실행되는지
- image build 중 외부 CA URL 장애/변경에 대한 재현성
- production DB가 global bundle과 `rejectUnauthorized=true`로 연결되는지
- image architecture가 runtime과 일치하는지 (`linux/amd64` workflow 고정)

## 3. Delivery Workflows

### A. OIDC ECR + ECS deploy

파일: `.github/workflows/deploy-ecr.yml`

Triggers:

- `main` branch push
- `v*` tag push
- manual `workflow_dispatch`

Push path ignore:

- `*.md`
- `.gitignore`
- `.claudeignore`

`*.md`가 `docs/**` 같은 중첩 Markdown까지 제외하는지는 이 저장소에서 검증되지 않았습니다. tag trigger의 path filter 동작도 branch push와 동일하다고 가정하지 않습니다.

Main workflow sequence:

```text
checkout
-> version tag (manual input / git tag / short SHA)
-> AWS OIDC role
-> ECR login
-> linux/amd64 Docker build + push
-> current ECS task definition download
-> container image replacement
-> new task definition registration / ECS service deploy
-> wait for service stability
```

Repository: `backend-shakishaki-archive`, region: `ap-northeast-2`.

Required GitHub secrets (names only):

- `AWS_ROLE_ARN`
- `ECS_CLUSTER_NAME`
- `ECS_SERVICE_NAME`
- `ECS_TASK_DEFINITION_NAME`
- `ECS_CONTAINER_NAME`

Workflow는 기존 task definition을 가져와 image만 교체합니다. application env/secrets, CPU/memory, log driver, health grace period는 기존 task definition의 외부 상태에 의존합니다.

### B. Access Key ECR push only

파일: `.github/workflows/deploy-ecr-accesskey.yml`

- manual trigger only
- Access Key/Secret Key로 인증
- repository: `shakishaki-backend`
- image push만 수행하고 ECS/App Runner service update는 하지 않음
- 입력 `environment`는 현재 workflow logic에서 배포 대상/secret scope를 바꾸지 않음

### C. Ignored local ECR script

로컬에 `.gitignore` 대상 `deploy-ecr.sh`가 존재하며 ECR build/push 뒤 App Runner 수동 설정을 안내합니다. Git 추적 배포 하네스가 아니며 account/repository 설정의 현재 유효성을 보장하지 않습니다. 표준 경로로 사용하기 전에 별도 감사가 필요합니다.

### Delivery ambiguity

OIDC workflow와 Access Key workflow의 ECR repository 이름이 다르고, local script는 App Runner를 언급합니다. 최근 Actions 실행과 AWS 리소스를 확인하기 전 어느 경로가 production인지 확정하지 않습니다.

## 4. Push Safety Boundary

`main` push는 잠재적 production ECS 배포입니다. 이번 문서/하네스 갱신처럼 `.env.example`, `package.json`, scripts가 포함된 commit은 Markdown path ignore 여부와 무관하게 workflow를 촉발할 수 있습니다.

Push 전 확인:

1. `git diff --check`와 `npm run verify`
2. 변경 파일에 실제 secret/개인정보가 없는지
3. main workflow가 가리키는 cluster/service/task definition
4. OIDC role과 GitHub secret 설정
5. 진행 중 결제 callback과 10초 shutdown/drain 영향
6. DB schema가 새 image가 기대하는 schema와 일치하는지
7. 롤백할 이전 task definition revision/image digest

이 저장소 작업 자체는 push나 workflow dispatch 권한을 의미하지 않습니다.

## 5. Database Change Delivery

Workflow에는 DB migration 단계가 없습니다. application image 배포와 schema 적용 순서를 운영자가 별도로 관리해야 합니다.

안전 순서:

```text
schema change
-> npm run db:generate
-> generated SQL review
-> backup/snapshot
-> staging apply and app verification
-> production expand migration
-> compatible app deploy
-> data backfill/contract migration if needed
-> SQL verification
```

현재 `migrations/`가 `.gitignore` 대상이므로 fresh checkout이 migration history를 재현하지 못할 수 있습니다. 이 문제를 해결하기 전 자동 production migration을 추가하면 안 됩니다.

`npm run db:push`는 production에서 금지합니다. 세부 절차는 [Schema Migration Guide](../SCHEMA_MIGRATION_GUIDE.md)를 따릅니다.

## 6. Runtime Configuration

Source of truth:

- key catalog: `.env.example`
- validation/defaults: `server/config/index.ts`, `server/db.ts`, `server/utils/logger.ts`
- secret values: external runtime secret injection; 저장소에 없음

Startup hard failures:

- `DATABASE_URL` 누락
- `SESSION_SECRET` 누락
- production에서 `CORS_ORIGINS` 누락/빈 값/`*`

Startup soft failures:

- DB test failure: error log 후 process 지속
- Meilisearch init failure: error log 후 process 지속
- optional integration keys 없음: 기능별 503/no-op/error

운영에서는 `ADMIN_2FA_RECOVERY_CODE`도 필수 보안 설정으로 취급합니다. 코드 fallback이 있으므로 단순 startup 성공만으로 안전한 구성이 아닙니다.

## 7. Health, Readiness and Shutdown

### Liveness

```http
GET /api/health
```

항상 process timestamp와 `status=ok`를 반환하는 liveness입니다. DB, session table, PG, email, search를 확인하지 않습니다.

### Readiness gap

별도 readiness endpoint가 없습니다. 배포 안정성 판단에 DB가 필요하면 다음 probe를 분리 설계해야 합니다.

- PostgreSQL `SELECT 1`
- `sessions` table/index
- optional provider는 readiness hard dependency로 둘지 결정

### Shutdown

- first SIGTERM/SIGINT: HTTP server close/drain → DB pool close → exit
- timeout: 10 seconds
- second signal 또는 timeout: forced exit
- uncaught exception: log/Telegram alert 후 같은 shutdown 경로
- unhandled rejection: log/alert하되 process는 유지

ECS stop timeout/load balancer deregistration delay가 application의 10초와 정렬되어 있는지는 Needs Verification입니다.

## 8. Logging and Observability

### Application logger

외부 logging library가 아닌 `server/utils/logger.ts`의 console logger를 사용합니다.

- production default: JSON, color/pretty off, WARN 이상
- development default: pretty/color, INFO 이상
- override: `LOG_LEVEL`, `LOG_COLOR`, `LOG_PRETTY`
- errors: stderr, others: stdout
- request middleware: requestId, method/URL, status, duration, request/response summary

CloudWatch SDK/transport는 코드에 없습니다. ECS log driver나 runtime stdout 수집 설정이 있어야 중앙 로그에 들어갑니다.

### Sensitive data boundary

키워드 기반 masker는 객체형 request body와 외부 request header/body 일부에만 적용됩니다. HTTP full URL/query/userEmail/response summary, 외부 문자열/XML request와 provider response는 raw 또는 단순 길이 제한 상태로 남을 수 있습니다. non-2xx 외부 response는 `WARN`이라 production 기본 레벨에도 기록됩니다. auth debug 로그의 cookie/session preview도 별도 Known Issue입니다.

운영 지침:

- 해당 코드 제거 전 `LOG_LEVEL=debug` 금지
- URL/query/response/string payload를 구조화·allowlist 방식으로 sanitize하고 회귀 테스트 추가
- PG 원문 response와 OAuth token을 alert/chat에 복사하지 않음
- requestId로 최소 로그만 상관 분석

### Alerts

Telegram 설정이 있으면 HTTP 5xx, process errors, 일부 business event가 알림을 보낼 수 있습니다. Telegram 실패는 대부분 서비스 요청을 막지 않습니다. CloudWatch alarms, SNS/Slack, Sentry는 이 저장소에서 확인되지 않습니다.

## 9. Operational Runbooks

### Deployment failed before ECS update

1. GitHub Actions에서 실패 step 확인
2. OIDC role/ECR login/build 실패 구분
3. source commit에서 `npm run verify` 재현
4. 실패 image/tag를 production으로 수동 promote하지 않음

### ECS service did not stabilize

1. 새 task stopped reason와 container stdout/stderr 확인
2. 필수 env와 production CORS 확인(값은 출력 금지)
3. port 8080/listen address와 health check path 확인
4. DB TLS/CA와 `sessions` table 확인
5. 이전 task definition revision으로 되돌릴 준비
6. migration이 이미 적용됐다면 schema backward compatibility 확인 후 rollback

Workflow는 `wait-for-service-stability`를 사용하지만 실패 시 자동으로 이전 revision을 재배포하는 명시 step은 없습니다. ECS deployment circuit breaker 설정도 저장소 밖이라 확인이 필요합니다.

### Health 200, API 5xx

1. requestId로 error log 검색
2. startup DB test 결과 확인
3. DB pool saturation/timeout 확인
4. session table와 CORS/cookie 확인
5. optional provider enable state 및 timeout 확인

### Session/login failure after deployment

1. frontend origin과 `CORS_ORIGINS` 정확히 일치
2. credentialed request 확인
3. HTTPS + secure cookie + SameSite=None
4. proxy의 `X-Forwarded-Proto` 또는 `X-Original-Proto`
5. PostgreSQL session row 생성/만료 index

### Payment incident

1. 신규 배포/수동 PG 재시도를 멈추고 order/provider/payment key를 안전하게 식별
2. PG dashboard/API 상태와 DB order 상태를 별도로 확인
3. 중복 callback인지 conditional update 결과 확인
4. PG 성공/DB 실패이면 고객에게 재결제를 유도하지 않고 수동 reconciliation
5. requestId/orderId 기반 로그와 Telegram alert 보존
6. 환불/취소 재실행은 provider idempotency와 refundable ceiling 확인 후 승인

### Scheduler anomaly

1. 실제 running task 수 확인
2. auto-confirm은 DB lock/skip locked 결과 확인
3. ghost order/stock cleanup의 중복 재고 복구 여부 확인
4. KST timezone과 container clock 확인

## 10. Security Checklist

- production CORS allowlist에 정확한 origin만 존재
- secure cookie를 임의 비활성화하지 않음
- `ADMIN_2FA_RECOVERY_CODE` 별도 secret 주입
- auth debug cookie/session logging 제거 전 debug 금지
- DB SSL CA 검증 활성
- GitHub OIDC 최소 권한; Access Key workflow 필요성 재평가
- ECR image scan/retention 설정 확인
- secrets가 task definition plaintext/output에 노출되지 않는지 확인
- provider callback URL과 authenticity/idempotency 확인
- migration backup/rollback 확인

PCI-DSS, OWASP 완전 준수, Zero Trust를 구현 완료라고 주장하지 않습니다. 카드 정보는 PG에 위임하는 설계지만 실제 규정 범위는 별도 평가가 필요합니다.

## 11. Metrics to Establish

현재 저장소에는 검증된 수치가 없습니다. 운영 baseline을 만들 때 최소 다음을 수집합니다.

- request count/error rate/latency p50·p95·p99 by route
- payment ready/approve/cancel success and reconciliation count
- DB pool utilization, connection timeout, slow queries
- scheduler processed/error/skipped counts
- ECS desired/running task, deployment rollback count
- health/readiness failure and uptime
- log volume/retention and cost

측정 전 목표나 현재값을 문서에 사실로 쓰지 않습니다.

## 12. Needs Verification

- production이 실제 사용하는 workflow/ECR repository/compute service
- OIDC role, ECS cluster/service/task/container secret 이름 연결
- nested Markdown path-ignore behavior and tag trigger behavior
- task definition env/secrets/log driver/health grace/stop timeout
- ECS circuit breaker/rollback policy and autoscaling
- RDS topology, backup/restore test, schema migration version
- centralized logs, alerts, retention, on-call ownership
- built image HEALTHCHECK command

## Related Documents

- [README](../README.md)
- [Architecture](./ARCHITECTURE.md)
- [Backend Guide](../BACKEND_GUIDE.md)
- [Schema Migration Guide](../SCHEMA_MIGRATION_GUIDE.md)
- [MEMORY](../MEMORY.md)
