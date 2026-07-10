# Safe Schema Migration Guide

> 코드 기준일: 2026-07-10. 운영 DB 변경은 high-risk입니다. 이 문서는 절차를 설명할 뿐, 현재 local migration 파일이 운영에 적용되었다는 뜻이 아닙니다.

## Current State

- schema source: `shared/schema.ts`
- Drizzle config: `drizzle.config.ts`
- generated output: `migrations/`
- commands: `npm run db:generate`, `npm run db:migrate`
- custom runner: `server/scripts/run-migration.ts` (package script로 노출되지 않음)
- `migrations/*`는 현재 `.gitignore` 대상이고, 이 guide는 명시적으로 예외 처리되어 추적 가능
- ignored one-off `server/scripts/migrate-*.ts`는 `tsconfig.json`의 검증 대상에서도 제외되며 fresh clone에서 사용할 수 있는 운영 도구가 아님

가장 큰 운영 위험은 fresh clone이 migration history를 재현하지 못하고, local SQL·Drizzle journal·운영 DB의 일치가 보장되지 않는다는 점입니다. 새 운영 변경 전에 추적/보관 정책과 schema drift를 먼저 해결하세요.

## Prohibited in Production

```bash
# 운영에서 사용 금지
npm run db:push
npx drizzle-kit push --force
```

`push`는 현재 DB와 schema를 직접 동기화하여 검토/승인된 migration history와 명시적 rollback을 우회할 수 있습니다.

운영 DB에 다음도 사전 승인 없이 실행하지 않습니다.

- `DROP TABLE`, `DROP COLUMN`, type narrowing, NOT NULL 즉시 적용
- 대량 table rewrite/backfill
- backup/restore test 없는 destructive rollback
- application compatibility를 확인하지 않은 migration

## Before the Next Migration

1. `git status --short --branch`로 사용자 변경 확인
2. `git check-ignore -v migrations/<file>`로 ignore 정책 확인
3. 운영 DB의 `drizzle.__drizzle_migrations`와 schema introspection 확보
4. local `migrations/meta/_journal.json`과 비교
5. 어떤 history를 canonical로 추적할지 결정
6. backup과 restore 절차를 staging에서 검증

이 단계가 끝나기 전 local migration 파일을 production history의 근거로 사용하지 않습니다.

## Standard Expand/Contract Flow

### 1. Design

- additive/nullable change를 우선합니다.
- 기존 application과 새 application이 동시에 실행되는 rolling deploy를 고려합니다.
- index 생성의 lock/time, table size, backfill batch를 추정합니다.
- 결제/주문/세션 table은 downtime과 정합성 영향, rollback 조건을 명시합니다.

### 2. Edit schema

`shared/schema.ts`와 관련 `shared/constants`/Zod schema를 함께 검토합니다. 상태 문자열은 DB varchar이므로 constants와 legacy 배열이 drift하지 않게 확인합니다.

### 3. Generate

로컬 DB가 SSL을 사용하지 않으면 Drizzle CLI에도 명시합니다.

```bash
export DATABASE_URL='postgresql://...'
export DB_SSL=false
npm run db:generate
```

`drizzle.config.ts`는 `DB_SSL=false`가 아니면 SSL을 켭니다. 현재 CLI 설정은 `rejectUnauthorized=false`와 custom identity bypass를 사용하므로 CA가 정상 로드된 application connection보다 약합니다. CA가 없으면 application도 identity 검증을 우회하므로 양쪽 모두 fail-closed 전환과 운영 연결 검증이 필요합니다.

### 4. Review generated SQL

검토 항목:

- 예상하지 않은 drop/rename/recreate 없음
- nullable/default/backfill 순서
- foreign key의 delete/update behavior
- index 이름, uniqueness, partial predicate
- decimal precision/UUID/integer type 일치
- transaction 안에서 실행 가능한 DDL인지
- long lock와 table rewrite 가능성
- rollback 또는 forward-fix SQL

생성 결과가 원하는 변경과 다르면 SQL을 그대로 적용하지 말고 schema/modeling부터 수정합니다.

### 5. Backup

환경 정책에 맞는 RDS snapshot 또는 `pg_dump`를 사용하고 restore 가능성을 확인합니다.

```bash
umask 077
BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/shakishaki-backup.XXXXXX")"
BACKUP_FILE="$BACKUP_DIR/backup-before-migration.dump"

# 사전 승인된 libpq service/password file을 사용하고 두 파일은 chmod 600으로 제한합니다.
export PGSERVICEFILE=/secure/path/pg_service.conf
export PGPASSFILE=/secure/path/pgpass
export PGSERVICE=shakishaki-production

pg_dump --format=custom --no-owner --no-acl --file="$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE" >/dev/null
```

`pg_restore --list` 성공은 archive 목차를 읽을 수 있다는 최소 무결성 확인일 뿐 restore drill이 아닙니다. 권한, extension, schema, data, constraint까지 검증하려면 production과 격리된 staging DB에 실제 restore하고 핵심 query를 실행해야 합니다.

password가 포함된 connection URI를 `pg_dump "$DATABASE_URL"`처럼 argv로 전달하면 같은 host의 process inspection에 노출될 수 있습니다. 조직에서 승인한 `PGSERVICEFILE`/`PGPASSFILE`, IAM auth 또는 secret injection을 사용하고 값을 출력하지 않습니다.

backup 파일은 저장소 밖의 권한 제한 디렉터리에 두고 커밋하지 않습니다. `.gitignore`의 `/backup*.dump`는 실수 방지를 위한 최후 안전장치일 뿐 보관 정책이 아닙니다. 민감 데이터가 포함된 dump의 암호화, 접근 권한, retention, 안전한 삭제를 확인합니다.

### 6. Staging apply

```bash
npm run db:migrate
npm run check
npm run build
```

그 다음 실제 staging DB에서 다음을 검증합니다.

- migration journal row
- 변경된 column/index/constraint
- 기존 row count 및 핵심 aggregate
- session/login
- 주문 생성/재고/취소
- 관련 application의 backward/forward compatibility

### 7. Production apply

- 승인된 정확한 migration artifact와 checksum 사용
- traffic/lock monitoring 준비
- 동시 schema deploy 방지
- application rollout과 순서를 runbook에 기록
- migration 시작/완료/검증 시간을 기록

Workflow에는 migration 자동 단계가 없으므로 누가 어떤 artifact를 어떤 DB에 적용하는지 명시해야 합니다.

### 8. Verify

예시 SQL:

```sql
SELECT *
FROM drizzle.__drizzle_migrations
ORDER BY created_at DESC
LIMIT 10;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '<table>'
ORDER BY ordinal_position;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = '<table>';
```

기능 검증과 로그/metric을 함께 확인합니다. DDL 성공만으로 완료하지 않습니다.

## Common Patterns

### Add a required column safely

1. nullable 또는 safe default로 column 추가
2. old/new app 모두 column 부재/존재 전환에 호환되게 배포
3. batch backfill + 진행률/실패 row 기록
4. `NULL` 검증
5. 별도 migration에서 `NOT NULL`

### Rename a column

바로 rename하지 않고 새 column을 추가한 뒤 dual-read/write, backfill, read 전환, old column 제거의 contract 단계를 사용합니다.

### Add an index

큰 운영 table이면 `CREATE INDEX CONCURRENTLY` 필요성을 검토합니다. 해당 문은 일반 transaction block 제약이 있으므로 Drizzle migration runner의 transaction behavior와 함께 검증합니다.

### Enum-like status

현재 status column은 varchar입니다. 새 상태를 추가할 때 최소 다음을 함께 갱신합니다.

- `shared/constants/order.ts`
- validation/schema arrays
- storage status aggregation
- admin/frontend rendering
- scheduler/cancel/return transition rules

`shared/schema.ts`의 legacy `orderStatusEnum`이 현재 constants보다 뒤처져 있으므로 특히 주의합니다.

## Rollback Policy

Drizzle `migrate`는 이 프로젝트에 자동 down migration command를 제공하지 않습니다. 각 변경은 다음 중 하나를 선택합니다.

- forward fix: additive correction; 기본 권장
- application rollback: schema가 이전 app과 호환될 때 이전 image
- explicit rollback SQL: 데이터 손실/lock 영향 검토 후 수동 승인
- backup restore: 최후 수단; migration 이후 쓰기 데이터 손실 범위 계산 필수

Column/table drop rollback은 원본 데이터를 복구하지 못합니다. `IF EXISTS`가 데이터 안전성을 보장하지 않습니다.

## Special Checks

### Sessions

`connect-pg-simple`은 table을 자동 생성하지 않습니다. `sessions` table과 expire index를 migration과 함께 유지합니다.

### Payments and orders

- migration 중 callback이 들어오는 상황
- old/new task가 동시에 상태를 쓰는 상황
- payment key/external order ID uniqueness
- nullable/default가 결제 상태 전이를 깨지 않는지
- rollback 시 PG side effect와 DB state 불일치

### Background jobs

자동 구매확정은 `order_items.delivered_at`과 status index를 기대합니다. 유령 주문 cleanup은 `orders.created_at/status/is_stock_reserved` 의미에 의존합니다.

## Needs Verification

- production `drizzle.__drizzle_migrations` contents
- local journal/SQL과 production schema의 common ancestor
- migration artifacts의 canonical repository/backup location
- production migration runner와 TLS identity verification
- RDS backup retention and successful restore drill
- large-table sizes and acceptable lock window

## Related Documents

- [README](./README.md)
- [Backend Guide](./BACKEND_GUIDE.md)
- [DevOps](./docs/DEVOPS.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [MEMORY](./MEMORY.md)
