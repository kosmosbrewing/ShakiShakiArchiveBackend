echo "환경변수 확인 완료"
source ~/.zshrc
#export NODE_TLS_REJECT_UNAUTHORIZED=0
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shakishaki_dev

export NODE_ENV=dev
# 데이터베이스 연결 정보
#export DB_SSL_CA=certs/rds-ca-bundle.pem
export DB_SSL=false

npx tsx server/index.ts
