#!/usr/bin/env bash

# shared 폴더를 프론트엔드로 동기화하는 스크립트
# 현재 consumer가 확인되지 않은 legacy 도구이므로 명시적 opt-in이 필요하다.
# 사용법: ALLOW_UNSUPPORTED_SHARED_SYNC=1 FRONTEND_PATH=../대상프로젝트 ./scripts/sync-shared.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

if [[ "${ALLOW_UNSUPPORTED_SHARED_SYNC:-}" != "1" ]]; then
  echo "이 legacy sync는 consumer 확인 전 기본 비활성 상태입니다."
  echo "검토 후 ALLOW_UNSUPPORTED_SHARED_SYNC=1과 FRONTEND_PATH를 함께 지정하세요."
  exit 1
fi

if [[ -z "${FRONTEND_PATH:-}" ]]; then
  echo "FRONTEND_PATH가 필요합니다. 기본 대상은 제공하지 않습니다."
  exit 1
fi

if [[ ! -d "$FRONTEND_PATH" ]]; then
  echo "Frontend path not found: $FRONTEND_PATH"
  exit 1
fi

FRONTEND_ROOT="$(cd "$FRONTEND_PATH" && pwd -P)"
if [[ "$FRONTEND_ROOT" == "/" || "$FRONTEND_ROOT" == "$ROOT_DIR" ]]; then
  echo "안전하지 않은 FRONTEND_PATH입니다: $FRONTEND_ROOT"
  exit 1
fi
if [[ ! -f "$FRONTEND_ROOT/package.json" || ! -d "$FRONTEND_ROOT/src" ]]; then
  echo "대상에 package.json과 src/가 모두 필요합니다: $FRONTEND_ROOT"
  exit 1
fi

# 백엔드 shared 폴더 경로
BACKEND_SHARED="$ROOT_DIR/shared"

# 프론트엔드 타겟 경로
FRONTEND_SHARED="$FRONTEND_ROOT/src/shared"

# 색상 코드
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📦 Syncing shared folder to frontend...${NC}"

# 타겟 디렉토리가 없으면 생성
mkdir -p "$FRONTEND_SHARED"

# rsync로 동기화 (rsync가 없으면 cp 사용)
if command -v rsync &> /dev/null; then
  rsync -av --delete \
    --exclude 'node_modules' \
    --exclude '*.test.ts' \
    --exclude '*.spec.ts' \
    "$BACKEND_SHARED/" "$FRONTEND_SHARED/"
else
  echo -e "${YELLOW}⚠️  rsync not found, using cp instead${NC}"
  rm -rf "$FRONTEND_SHARED"
  cp -r "$BACKEND_SHARED" "$FRONTEND_SHARED"
fi

echo -e "${GREEN}✅ Sync complete!${NC}"
echo -e "   Backend: $BACKEND_SHARED"
echo -e "   Frontend: $FRONTEND_SHARED"
