#!/bin/bash

# shared 폴더를 프론트엔드로 동기화하는 스크립트
# 사용법: npm run sync:frontend

# 프론트엔드 프로젝트 경로 설정 (환경에 맞게 수정)
FRONTEND_PATH="${FRONTEND_PATH:-../ShakiShakiFrontend}"

# 백엔드 shared 폴더 경로
BACKEND_SHARED="./shared"

# 프론트엔드 타겟 경로
FRONTEND_SHARED="$FRONTEND_PATH/src/shared"

# 색상 코드
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📦 Syncing shared folder to frontend...${NC}"

# 프론트엔드 경로 존재 확인
if [ ! -d "$FRONTEND_PATH" ]; then
  echo -e "${RED}❌ Frontend path not found: $FRONTEND_PATH${NC}"
  echo -e "${YELLOW}💡 Tip: Set FRONTEND_PATH environment variable${NC}"
  echo -e "   Example: FRONTEND_PATH=../MyFrontend npm run sync:frontend"
  exit 1
fi

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
