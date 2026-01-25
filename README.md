# ShakiShaki Archive Backend

> 빈티지 의류 커머스의 복잡한 재고 관리와 멀티 PG 결제를 안전하게 처리하는 고가용성 API 서버

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-4.18-lightgrey.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![AWS ECS](https://img.shields.io/badge/AWS-ECS-orange.svg)](https://aws.amazon.com/ecs/)

---

## 📌 Key Highlights

✅ **99.9% Uptime** - AWS ECS Fargate Auto-scaling + Rolling Update
✅ **Zero Downtime Deployment** - Health Check 기반 무중단 배포
✅ **70% API 성능 개선** - N+1 쿼리 해결 (300ms → 90ms)
✅ **100% 주문번호 고유성** - 시분초 + 난수 방식으로 충돌 제거
✅ **멀티 PG 결제** - 토스페이먼츠, 네이버페이 통합
✅ **OWASP Top 10 준수** - SQL Injection, XSS, CSRF 방지
✅ **Production-Ready** - TypeScript 100% 타입 안정성

---

## 🎯 프로젝트 소개

ShakiShaki Archive Backend는 **빈티지 의류 전문 커머스**를 위한 고가용성 API 서버입니다.

### 비즈니스 과제

- **단일 재고 관리**: 빈티지 의류 특성상 1개 재고 → 동시 주문 시 경합 조건 발생
- **멀티 PG 결제**: 토스페이먼츠, 네이버페이 통합 → PG사별 API 스펙 차이 처리
- **재고 선점 복잡도**: 사용자가 "주문 → 결제 중단 → 재주문" 시 Self-Lock 문제
- **데이터 정합성**: 결제/주문 시스템 특성상 ACID 트랜잭션 보장 필수

### 핵심 가치

- ✅ **Transaction Safety**: PostgreSQL ACID 속성 활용, Rollback 전략
- ✅ **Self-Lock Bypass**: 사용자가 본인 예약 재고에 막히지 않는 UX
- ✅ **Security First**: OWASP Top 10 대응, Zod 검증, bcrypt 해싱
- ✅ **Auto-scaling**: CPU/Memory 기반 자동 확장 (Min 1, Max 10)

---

## 🚀 Quick Start

### 1. 패키지 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성합니다:

```env
# 필수
DATABASE_URL=postgresql://user:password@host:5432/database
SESSION_SECRET=your-long-random-secret-key

# 서버
NODE_ENV=development
PORT=8080
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
FRONTEND_URL=http://localhost:3000

# 토스페이먼츠 (선택)
TOSS_CLIENT_KEY=test_ck_...
TOSS_SECRET_KEY=test_sk_...

# 네이버 OAuth (선택)
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...

# 카카오 OAuth (선택)
KAKAO_CLIENT_ID=...
KAKAO_CLIENT_SECRET=...

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
# UNIQUE 제약조건 추가
psql $DATABASE_URL -f migrations/add-unique-external-order-id.sql
```

### 4. 관리자 계정 생성

```bash
# 대화형 입력 방식 (권장)
npm run admin:create
```

### 5. 개발 서버 실행

```bash
npm run dev
```

서버가 `http://localhost:8080`에서 실행됩니다.

---

### 프로덕션 빌드 & 실행

```bash
npm run build
npm start
```

### Docker 실행

```bash
docker build -t shakishaki-backend .
docker run -p 8080:8080 --env-file .env shakishaki-backend
```

---

## 🛍️ 주요 기능

### 상품 관리

- 상품 CRUD (카테고리, 옵션/variants 포함)
- 이미지 업로드 (Cloudinary CDN)
- 재고 관리 및 실시간 선점 시스템 (Self-Lock Bypass)
- 상품 검색 및 필터링

### 결제 시스템

- **토스페이먼츠**: 카드, 가상계좌, 계좌이체
- **네이버페이**: 결제형 API 연동
- PG사별 결제 승인/취소/부분취소 분기 처리
- 주문번호 고유성 보장 (시분초 + 4자리 난수)

### 회원 관리

- 이메일/비밀번호 로그인 (bcrypt 해싱)
- 소셜 로그인 (네이버, 카카오 OAuth)
- 배송지 관리, 위시리스트
- 비밀번호 확인 API (재인증)

### 주문 관리

- 장바구니, 주문 생성/조회/취소
- 주문 상태 관리 (pending → paid → preparing → shipped → delivered)
- 택배사 정보 및 운송장 번호 관리
- 재고 복구 (주문 취소 시)

### 관리자 기능

- 상품/카테고리 관리
- 주문/결제 관리
- 사이트 이미지 관리 (Hero, Marquee)
- 관리자 전용 Rate Limiting (5분/300 요청)

### 보안

- Helmet (보안 헤더)
- Rate Limiting (전역: 15분/100 요청, 관리자: 5분/300 요청)
- CORS (허용된 Origin만 접근)
- bcrypt 비밀번호 해싱
- 세션 기반 인증 (secure cookie, httpOnly)

---

## 🧰 Tech Stack

| 구분          | 기술                         | 선택 이유                       |
| ------------- | ---------------------------- | ------------------------------- |
| Runtime       | Node.js 20                   | LTS 안정성                      |
| Framework     | Express.js                   | 빠른 MVP 출시, 방대한 생태계    |
| Language      | TypeScript                   | 100% 타입 안정성                |
| Database      | PostgreSQL                   | ACID 보장, 복잡한 쿼리 지원     |
| ORM           | Drizzle ORM                  | Type-safe, 가벼운 런타임        |
| Validation    | Zod                          | 입력 검증 및 타입 추론          |
| Image Storage | Cloudinary                   | CDN 자동 최적화                 |
| Email         | Resend                       | Transactional Email             |
| Auth          | Passport.js, express-session | 서버 제어 가능, CSRF 방지       |
| Payment       | 토스페이먼츠, 네이버페이     | 수수료 최저, 간편결제 선호도    |
| Deploy        | AWS ECR + ECS Fargate        | 서버리스 컨테이너, Auto-scaling |
| Logging       | Winston                      | 구조화된 로그, CloudWatch 연동  |

---

## 📚 상세 문서

프로젝트의 상세 기술 문서는 다음과 같이 분리되어 있습니다:

### [📖 Architecture](./docs/ARCHITECTURE.md)

- Infrastructure Overview (CloudFront → ALB → ECS → RDS)
- Request Flow 상세 설명
- Tech Stack 선택 근거 (비교 테이블)
- Performance Metrics (p95, Auto-scaling, RDS Metrics)

### [🔧 Technical Challenges](./docs/TECHNICAL-CHALLENGES.md)

실제 문제 해결 사례 5개:

1. **주문번호 중복 방지** (2026-01-19) - 충돌 100% → 0%
2. **PG사별 결제 취소** (2026-01-18) - 네이버페이 취소 성공률 0% → 100%
3. **N+1 쿼리 최적화** (2026-01-17) - API 응답 시간 70% 개선
4. **Self-Lock Bypass** (2024-12) - 재주문 성공률 43% 향상
5. **관리자 Rate Limiting** (2026-01-17) - 업무 효율 300% 향상

### [🚀 DevOps](./docs/DEVOPS.md)

- CI/CD Pipeline (GitHub Actions)
- Monitoring & Observability (Winston, CloudWatch)
- Security & Compliance (OWASP Top 10, PCI-DSS)
- FinOps (비용 최적화, $145/월 → $106/월)

---

## 📚 API Reference

### 공개 API

| Method | Endpoint              | 설명                    |
| ------ | --------------------- | ----------------------- |
| GET    | `/api/health`         | 헬스체크                |
| POST   | `/api/auth/signup`    | 회원가입                |
| POST   | `/api/auth/login`     | 로그인                  |
| POST   | `/api/auth/logout`    | 로그아웃                |
| GET    | `/api/products`       | 상품 목록 (필터링 지원) |
| GET    | `/api/products/:slug` | 상품 상세               |
| GET    | `/api/categories`     | 카테고리 목록           |

### 인증 필요 API

| Method | Endpoint                    | 설명                   |
| ------ | --------------------------- | ---------------------- |
| GET    | `/api/auth/user`            | 현재 사용자 정보       |
| POST   | `/api/auth/verify-password` | 비밀번호 확인 (재인증) |
| GET    | `/api/cart`                 | 장바구니 조회          |
| POST   | `/api/cart`                 | 장바구니 추가          |
| DELETE | `/api/cart/:id`             | 장바구니 삭제          |
| POST   | `/api/orders`               | 주문 생성              |
| GET    | `/api/orders`               | 주문 내역              |
| GET    | `/api/orders/:id`           | 주문 상세              |
| POST   | `/api/orders/:id/cancel`    | 주문 취소              |
| POST   | `/api/payments/confirm`     | 토스페이먼츠 결제 승인 |
| GET    | `/api/wishlist`             | 위시리스트             |

### 관리자 API

**인증**: `isAuthenticated` + `isAdmin` 미들웨어

| 카테고리          | API                                           |
| ----------------- | --------------------------------------------- |
| **상품 관리**     | 상품 CRUD, 옵션/variants, 이미지 업로드       |
| **주문 관리**     | 전체 주문 조회, 상태 변경, 택배사/운송장 정보 |
| **카테고리 관리** | 카테고리 CRUD                                 |
| **사이트 관리**   | Hero/Marquee 이미지                           |

자세한 API 스펙은 프로젝트 루트의 `CLAUDE.md` 파일을 참고하세요.

---

## 📖 Scripts

| 명령어                 | 설명                       |
| ---------------------- | -------------------------- |
| `npm run dev`          | 개발 서버 실행 (tsx watch) |
| `npm run build`        | 프로덕션 빌드 (esbuild)    |
| `npm start`            | 프로덕션 실행              |
| `npm run check`        | TypeScript 타입 체크       |
| `npm run admin:create` | 관리자 계정 생성 (대화형)  |

---

## 📂 Project Structure

```
ShakiShakiArchiveBackend/
├── server/
│   ├── index.ts              # Express 앱 진입점
│   ├── db.ts                 # 데이터베이스 연결
│   ├── storage.ts            # 데이터 액세스 레이어
│   ├── config/               # 설정 (CORS, Session, Security)
│   ├── middleware/           # 미들웨어 (Auth, Error, Logger)
│   ├── routes/               # API 라우트
│   │   ├── auth.routes.ts
│   │   ├── product.routes.ts
│   │   ├── order.routes.ts
│   │   ├── payment.routes.ts
│   │   └── admin/            # 관리자 API
│   ├── services/             # 외부 서비스 연동
│   │   ├── toss.service.ts
│   │   ├── naverpay.service.ts
│   │   └── email.service.ts
│   ├── utils/                # 유틸리티
│   └── scripts/              # 운영 스크립트
├── shared/
│   ├── schema.ts             # Drizzle 스키마 + Zod
│   └── constants/            # 공유 상수
├── docs/                     # 기술 문서
│   ├── ARCHITECTURE.md
│   ├── TECHNICAL-CHALLENGES.md
│   └── DEVOPS.md
├── migrations/               # DB 마이그레이션
├── .github/workflows/        # CI/CD
└── Dockerfile                # 멀티스테이지 빌드
```

---

## 📝 에러 메시지 중앙 관리

모든 API 응답 메시지는 `shared/constants/messages.ts`에서 중앙 관리됩니다.

### 파일 구조

```
shared/constants/
├── messages.ts      # 메시지 상수 정의
├── index.ts         # export 관리
server/
├── constants.ts     # 백엔드 re-export
```

### 메시지 카테고리

| 카테고리 | 용도 |
|---------|------|
| `AUTH_MESSAGES` | 인증/로그인/OAuth |
| `ORDER_MESSAGES` | 주문 |
| `PAYMENT_MESSAGES` | 결제 (토스/네이버페이) |
| `PRODUCT_MESSAGES` | 상품/옵션 |
| `CART_MESSAGES` | 장바구니 |
| `INQUIRY_MESSAGES` | 문의 |
| `IMAGE_MESSAGES` | 이미지 업로드 |
| `VALIDATION_MESSAGES` | 입력값 검증 |
| `SEARCH_MESSAGES` | 검색 (카카오/Meilisearch) |
| `SUCCESS_MESSAGES` | 성공 응답 |
| `COMMON_MESSAGES` | 공통 에러 |

### 사용 방법

**1. 메시지 추가** (`shared/constants/messages.ts`)

```typescript
export const ORDER_MESSAGES = {
  NOT_FOUND: "주문을 찾을 수 없습니다",
  NEW_MESSAGE: "새로운 메시지",  // 추가
} as const;
```

**2. 라우트에서 사용**

```typescript
import { ORDER_MESSAGES } from "@shared/constants/messages";
// 또는
import { ORDER_MESSAGES } from "../constants";

res.status(404).json({ message: ORDER_MESSAGES.NOT_FOUND });
```

### 네이밍 규칙

```typescript
// 에러: 명사형 또는 상태
NOT_FOUND: "찾을 수 없습니다"
FORBIDDEN: "권한이 없습니다"

// 성공: 과거형
DELETED: "삭제되었습니다"
PASSWORD_CHANGED: "비밀번호가 변경되었습니다"

// 동적 메시지: 함수 사용
CANNOT_CANCEL: (status: string) => `현재 상태(${status})에서는 취소할 수 없습니다`
```

### PG사 에러 메시지

토스페이먼츠, 네이버페이의 **공식 에러 코드 매핑**은 별도 관리합니다:

- `server/routes/payment.routes.ts` → `tossErrorMessages`
- `server/routes/naverpay.routes.ts` → `naverPayErrorMessages`

이는 PG사 API 에러 코드를 사용자 친화적 메시지로 변환하는 용도로, 중앙 메시지와 목적이 다릅니다.

```typescript
// PG 에러: 코드 기반 조회
const userMessage = tossErrorMessages[error.code] || error.message;
```

### 주의사항

- ❌ 하드코딩 금지: `message: "에러입니다"`
- ✅ 상수 사용: `message: ORDER_MESSAGES.NOT_FOUND`
- 새 카테고리 추가 시 `shared/constants/index.ts`에 export 추가 필요

---

## 🛠️ Troubleshooting

자세한 문제 해결 사례는 [Technical Challenges](./docs/TECHNICAL-CHALLENGES.md) 문서를 참고하세요.

---

## 📧 Contact

이슈는 GitHub Issues에 등록해주세요.

---

**Built with for ShakiShaki Archive**
