#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SHAKISHAKI_PID_FILE:-$ROOT_DIR/.shakishaki.pid}"
LOCK_DIR="${PID_FILE}.start.lock"

cd "$ROOT_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  lock_pid="$(sed -n '1p' "$LOCK_DIR/pid" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$lock_pid" =~ ^[0-9]+$ ]] && ! kill -0 "$lock_pid" 2>/dev/null; then
    rm -f "$LOCK_DIR/pid"
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "다른 시작 작업이 진행 중이거나 stale lock 확인이 필요합니다: $LOCK_DIR"
    exit 1
  fi
fi
printf '%s\n' "$$" > "$LOCK_DIR/pid"

cleanup_lock() {
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup_lock EXIT

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(sed -n '1p' "$PID_FILE" 2>/dev/null | tr -d '[:space:]' || true)"
  expected_start="$(sed -n '2p' "$PID_FILE" 2>/dev/null || true)"
  if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
    actual_start="$(ps -p "$existing_pid" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"
    if [[ -n "$expected_start" && "$actual_start" == "$expected_start" ]]; then
      echo "이미 실행 중입니다 (PID: $existing_pid)"
    else
      echo "PID 파일의 프로세스 identity를 검증할 수 없습니다: $PID_FILE"
      echo "다른 프로세스를 종료하지 않도록 시작을 중단합니다. PID/명령을 수동 확인하세요."
    fi
    exit 1
  fi
  rm -f "$PID_FILE"
fi

if [[ -f .env ]]; then
  command=(node --env-file=.env --import tsx server/index.ts)
else
  echo ".env가 없어 현재 셸의 환경 변수를 사용합니다."
  command=(node --import tsx server/index.ts)
fi

process_start="$(ps -p "$$" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"
if [[ -z "$process_start" ]]; then
  echo "현재 프로세스 시작 시각을 확인하지 못해 안전한 PID 파일을 만들 수 없습니다."
  exit 1
fi
pid_tmp="${PID_FILE}.$$"
printf '%s\n%s\n' "$$" "$process_start" > "$pid_tmp"
mv "$pid_tmp" "$PID_FILE"
echo "ShakiShaki Archive Backend 시작 (PID: $$)"

# shell을 Node 프로세스로 교체해 SIGINT/SIGTERM이 서버에 한 번만 전달되게 한다.
# 정상/비정상 종료 뒤 남은 PID 파일은 다음 start/stop 호출이 안전하게 정리한다.
cleanup_lock
trap - EXIT
exec "${command[@]}"
