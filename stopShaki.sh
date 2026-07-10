#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SHAKISHAKI_PID_FILE:-$ROOT_DIR/.shakishaki.pid}"
LOCK_DIR="${PID_FILE}.start.lock"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  lock_pid="$(sed -n '1p' "$LOCK_DIR/pid" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$lock_pid" =~ ^[0-9]+$ ]] && kill -0 "$lock_pid" 2>/dev/null; then
    echo "시작 또는 종료 작업이 진행 중입니다 (launcher PID: $lock_pid). 완료 후 다시 시도하세요."
    exit 1
  fi
  if [[ ! "$lock_pid" =~ ^[0-9]+$ ]]; then
    echo "lock owner를 검증할 수 없습니다: $LOCK_DIR"
    echo "진행 중인 start/stop이 없는지 확인한 뒤 수동으로 정리하세요."
    exit 1
  fi
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || true
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "operation lock을 획득하지 못했습니다: $LOCK_DIR"
    exit 1
  fi
fi
printf '%s\n' "$$" > "$LOCK_DIR/pid"

cleanup_lock() {
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup_lock EXIT

if [[ ! -f "$PID_FILE" ]]; then
  echo "PID 파일이 없습니다. startShaki.sh로 시작한 프로세스가 아닐 수 있습니다."
  exit 0
fi

pid="$(sed -n '1p' "$PID_FILE" 2>/dev/null | tr -d '[:space:]' || true)"
expected_start="$(sed -n '2p' "$PID_FILE" 2>/dev/null || true)"
if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
  echo "잘못된 PID 파일입니다: $PID_FILE"
  rm -f "$PID_FILE"
  exit 1
fi

if ! kill -0 "$pid" 2>/dev/null; then
  echo "프로세스가 이미 종료되었습니다 (PID: $pid)"
  rm -f "$PID_FILE"
  exit 0
fi

actual_start="$(ps -p "$pid" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"
if [[ -z "$expected_start" || "$actual_start" != "$expected_start" ]]; then
  echo "PID 파일과 실행 중인 프로세스 identity가 일치하지 않습니다: $PID_FILE"
  echo "다른 프로세스를 종료하지 않도록 중단합니다. PID/명령을 수동 확인하세요."
  exit 1
fi

kill -TERM "$pid"
echo "SIGTERM 전송 완료 (PID: $pid). 서버의 graceful shutdown을 기다립니다."

for _ in {1..12}; do
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "종료 완료"
    exit 0
  fi
  sleep 1
done

echo "12초 내 종료되지 않았습니다. 로그를 확인한 뒤 수동 조치하세요 (PID: $pid)."
exit 1
