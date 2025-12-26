# Dockerfile
# AWS ECR + App Runner 배포용 멀티스테이지 빌드

# ============================================
# Stage 1: Dependencies (의존성 설치)
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# 패키지 파일 복사
COPY package.json package-lock.json* ./

# 프로덕션 의존성만 설치 (devDependencies 제외)
RUN npm ci --only=production && npm cache clean --force

# ============================================
# Stage 2: Builder (빌드)
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# 패키지 파일 복사
COPY package.json package-lock.json* ./

# 모든 의존성 설치 (빌드에 devDependencies 필요)
RUN npm ci

# 소스 코드 복사
COPY . .

# TypeScript 빌드
RUN npm run build

# ============================================
# Stage 3: Runner (프로덕션 실행)
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# 보안: non-root 사용자로 실행
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressjs

# Amazon RDS SSL 연결을 위한 CA 번들 다운로드
# https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html
RUN apk add --no-cache wget ca-certificates && \
    mkdir -p /app/certs && \
    wget -q https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -O /app/certs/rds-ca-bundle.pem && \
    chmod 644 /app/certs/rds-ca-bundle.pem && \
    apk del wget

# 프로덕션 의존성 복사
COPY --from=deps /app/node_modules ./node_modules

# 빌드된 파일 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# 소유권 변경
RUN chown -R expressjs:nodejs /app

# non-root 사용자로 전환
USER expressjs

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=8080
# RDS SSL CA 인증서 경로 (애플리케이션에서 사용)
ENV RDS_CA_BUNDLE=/app/certs/rds-ca-bundle.pem

# App Runner 기본 포트
EXPOSE 8080

# 헬스체크 (App Runner 호환)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

# 서버 실행
CMD ["node", "dist/index.js"]
