# ShakiShaki Archive Backend 🛒

빈티지 의류 쇼핑몰 백엔드 API 서버

## 개요

ShakiShaki Archive Backend는 Express.js 기반의 e-commerce 백엔드 서버입니다. 상품 관리, 주문/결제, 회원 관리, 검색 등 쇼핑몰 운영에 필요한 모든 API를 제공합니다.

## 주요 기능

### 🛍️ 상품 관리
- 상품 CRUD (카테고리, 옵션/variants 포함)
- 이미지 업로드 (Cloudinary)
- 재고 관리 및 실시간 선점 시스템
- Meilisearch 기반 전문 검색 // 미사용

### 💳 결제 시스템
- **토스페이먼츠**: 카드, 가상계좌 결제
- **네이버페이**: 결제형 API 연동
- 결제 승인/취소/부분취소

### 👤 회원 관리
- 이메일/비밀번호 로그인
- 소셜 로그인 (네이버, 카카오)
- 배송지 관리
- 위시리스트

### 📦 주문 관리
- 장바구니
- 주문 생성/조회/취소
- 주문 상태 관리
- 이메일 알림 (Resend)

### 🔧 관리자 기능
- 상품/카테고리 관리
- 주문/결제 관리
- 사이트 이미지 관리 (Hero, Marquee)

## 기술 스택

| 구분 | 기술 |
|------|------|
| Runtime | Node.js 20 |
| Framework | Express.js |
| Language | TypeScript |
| Database | PostgreSQL (Neon Serverless) |
| ORM | Drizzle ORM |
| Validation | Zod |
| Search | Meilisearch |
| Image Storage | Cloudinary |
| Email | Resend |
| Auth | Passport.js, express-session |
| Payment | 토스페이먼츠, 네이버페이 |
| Deploy | AWS ECR + ECS, Docker |

## 프로젝트 구조

```
ShakiShakiArchiveBackend/
├── server/
│   ├── index.ts              # Express 앱 진입점
│   ├── db.ts                 # 데이터베이스 연결
│   ├── storage.ts            # 데이터 액세스 레이어
│   ├── constants.ts          # 서버 상수
│   │
│   ├── config/               # 설정
│   │   ├── cors.ts           # CORS 설정
│   │   ├── session.ts        # 세션 설정
│   │   ├── security.ts       # Helmet, Rate Limiting
│   │   └── cloudinary.ts     # Cloudinary 설정
│   │
│   ├── middleware/           # 미들웨어
│   │   ├── auth.middleware.ts    # 인증 검증
│   │   ├── error.middleware.ts   # 에러 핸들링
│   │   └── logger.middleware.ts  # 요청 로깅
│   │
│   ├── routes/               # API 라우트
│   │   ├── auth.routes.ts        # 인증 API
│   │   ├── oauth.routes.ts       # 소셜 로그인
│   │   ├── product.routes.ts     # 상품 API
│   │   ├── cart.routes.ts        # 장바구니 API
│   │   ├── order.routes.ts       # 주문 API
│   │   ├── payment.routes.ts     # 토스페이먼츠 결제
│   │   ├── naverpay.routes.ts    # 네이버페이 결제
│   │   ├── stock.routes.ts       # 재고 선점
│   │   └── admin/                # 관리자 API
│   │
│   ├── services/             # 외부 서비스 연동
│   │   ├── toss.service.ts       # 토스페이먼츠 API
│   │   ├── naverpay.service.ts   # 네이버페이 API
│   │   ├── naver.service.ts      # 네이버 OAuth
│   │   ├── kakao.service.ts      # 카카오 OAuth
│   │   ├── email.service.ts      # Resend 이메일
│   │   └── meilisearch.service.ts # 검색 엔진
│   │
│   └── utils/                # 유틸리티
│       ├── logger.ts             # 로깅
│       ├── password.ts           # 비밀번호 해싱
│       └── http-client.ts        # HTTP 클라이언트
│
├── shared/
│   ├── schema.ts             # Drizzle 스키마 정의
│   └── constants/            # 공유 상수
│
├── .github/workflows/        # CI/CD
│   └── deploy-ecr.yml        # ECR + ECS 배포
│
├── Dockerfile                # 멀티스테이지 빌드
├── drizzle.config.ts         # Drizzle 설정
└── package.json
```

## API 엔드포인트

### 공개 API
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/health` | 헬스체크 |
| POST | `/api/auth/signup` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| GET | `/api/products` | 상품 목록 |
| GET | `/api/products/:slug` | 상품 상세 |
| GET | `/api/categories` | 카테고리 목록 |
| GET | `/api/search/products` | 상품 검색 |

### 인증 필요 API
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/cart` | 장바구니 조회 |
| POST | `/api/cart` | 장바구니 추가 |
| POST | `/api/orders` | 주문 생성 |
| GET | `/api/orders` | 주문 내역 |
| POST | `/api/payments/confirm` | 결제 승인 |
| GET | `/api/wishlist` | 위시리스트 |

### 관리자 API (`/api/admin/*`)
상품, 카테고리, 주문, 결제, 이미지 관리

## 환경 설정

### 1. 패키지 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example`을 참고하여 `.env` 파일을 생성합니다:

```env
# 필수
DATABASE_URL=postgresql://...
SESSION_SECRET=your-secret-key

# 서버
NODE_ENV=development
PORT=8080
CORS_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000

# 토스페이먼츠 (선택)
TOSS_CLIENT_KEY=test_ck_...
TOSS_SECRET_KEY=test_sk_...

# 네이버 OAuth (선택)
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...

# 네이버페이 (선택)
NAVERPAY_CLIENT_ID=...
NAVERPAY_CLIENT_SECRET=...

# Cloudinary (선택)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Resend 이메일 (선택)
RESEND_API_KEY=re_...
```

### 3. 데이터베이스 마이그레이션

```bash
npm run db:push
```

### 4. 관리자 계정 생성

```bash
npx tsx server/scripts/create-admin.ts
```

## 실행

### 개발 모드

```bash
npm run dev
```

### 프로덕션 빌드

```bash
npm run build
npm start
```

### Docker 실행

```bash
docker build -t shakishaki-backend .
docker run -p 8080:8080 --env-file .env shakishaki-backend
```

## 배포

GitHub Actions를 통해 자동 배포됩니다:

1. `main` 브랜치 push → ECR 이미지 빌드 → ECS 배포
2. `v*` 태그 push → 버전 태깅 후 배포
3. 수동 실행 (workflow_dispatch)

### AWS 인프라
- **ECR**: Docker 이미지 저장소
- **ECS**: 컨테이너 오케스트레이션
- **RDS**: PostgreSQL 데이터베이스

## 보안

- **Helmet**: 보안 헤더 설정
- **Rate Limiting**: API 요청 제한
- **CORS**: 허용된 Origin만 접근
- **bcrypt**: 비밀번호 해싱
- **세션 기반 인증**: secure cookie, httpOnly

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm start` | 프로덕션 실행 |
| `npm run check` | TypeScript 타입 체크 |
| `npm run db:push` | DB 스키마 동기화 |
