# ShakiShaki Archive 백엔드 가이드

## 목차

1. [프로젝트 구조](#프로젝트-구조)
2. [기술 스택](#기술-스택)
3. [인증 시스템](#인증-시스템)
4. [데이터베이스 스키마](#데이터베이스-스키마)
5. [API 엔드포인트](#api-엔드포인트)
6. [결제 시스템](#결제-시스템)
7. [Storage 인터페이스](#storage-인터페이스)
8. [새로운 기능 추가하기](#새로운-기능-추가하기)
9. [환경 변수](#환경-변수)
10. [문제 해결](#문제-해결)

---

## 프로젝트 구조

```
server/
├── index.ts                    # 서버 진입점, Express 앱 초기화
├── db.ts                       # Drizzle ORM + pg Pool 설정
├── storage.ts                  # IStorage 인터페이스 및 DatabaseStorage 구현
├── config/
│   ├── index.ts                # 환경 변수 중앙 관리
│   ├── cors.ts                 # CORS 설정
│   └── session.ts              # 세션 설정
├── middleware/
│   ├── index.ts                # 미들웨어 통합 export
│   ├── auth.middleware.ts      # 인증 미들웨어 (isAuthenticated, isAdmin, populateUser)
│   ├── error.middleware.ts     # 전역 에러 처리
│   └── logger.middleware.ts    # 요청 로깅
├── routes/
│   ├── index.ts                # 라우트 통합 등록
│   ├── auth.routes.ts          # 인증 API (/api/auth/*)
│   ├── oauth.routes.ts         # 소셜 로그인 API (/api/oauth/*)
│   ├── product.routes.ts       # 상품 API (/api/products/*)
│   ├── category.routes.ts      # 카테고리 API (/api/categories/*)
│   ├── cart.routes.ts          # 장바구니 API (/api/cart/*)
│   ├── order.routes.ts         # 주문 API (/api/orders/*)
│   ├── payment.routes.ts       # 결제 API (/api/payments/*)
│   ├── wishlist.routes.ts      # 위시리스트 API (/api/wishlist/*)
│   ├── address.routes.ts       # 배송지 API (/api/user/addresses/*)
│   ├── variant.routes.ts       # 상품 옵션 API (/api/variants/*)
│   └── admin/
│       ├── index.ts            # 관리자 라우트 통합
│       ├── product.routes.ts   # 관리자 상품 관리
│       ├── category.routes.ts  # 관리자 카테고리 관리
│       ├── order.routes.ts     # 관리자 주문 관리
│       ├── variant.routes.ts   # 관리자 상품 옵션 관리
│       └── payment.routes.ts   # 관리자 결제 관리
├── services/
│   ├── toss.service.ts         # 토스페이먼츠 API 클라이언트
│   └── naver.service.ts        # 네이버 OAuth 서비스
├── types/
│   └── index.ts                # 커스텀 타입 정의
├── utils/
│   └── password.ts             # 비밀번호 해싱 유틸리티
└── scripts/
    ├── seed.ts                 # 데이터베이스 시드 스크립트
    ├── seed-data.ts            # 시드 데이터 정의
    └── create-admin.ts         # 관리자 계정 생성 스크립트

shared/
└── schema.ts                   # Drizzle 스키마 + Zod 검증 + TypeScript 타입
```

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| 런타임 | Node.js + TypeScript |
| 웹 프레임워크 | Express.js |
| 데이터베이스 | PostgreSQL (Neon Serverless) |
| ORM | Drizzle ORM |
| 인증 | 세션 기반 (express-session + connect-pg-simple) |
| 소셜 로그인 | 네이버 OAuth (openid-client) |
| 비밀번호 해싱 | bcryptjs |
| 검증 | Zod + drizzle-zod |
| 결제 | 토스페이먼츠 (네이버페이/카카오페이 확장 가능) |
| 빌드 도구 | esbuild + tsx |

---

## 인증 시스템

### 개요

이메일/비밀번호 기반 세션 인증 및 소셜 로그인(네이버)을 지원합니다.

### 인증 방식

#### 1. 이메일/비밀번호 회원가입 (POST /api/auth/signup)

```typescript
// 요청
{
  "email": "user@example.com",
  "password": "securepassword123",
  "userName": "홍길동",
  "phone": "010-1234-5678",        // 선택
  "zipCode": "12345",              // 선택
  "address": "서울시 강남구",       // 선택
  "detailAddress": "101동 1001호", // 선택
  "emailOptIn": true               // 선택
}

// 응답
{
  "id": 1,
  "email": "user@example.com",
  "userName": "홍길동",
  "isAdmin": false,
  "createdAt": "2025-12-15T..."
}
```

#### 2. 로그인 (POST /api/auth/login)

```typescript
// 요청
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

#### 3. 네이버 소셜 로그인

```
1. GET /api/oauth/naver/login     # 네이버 로그인 페이지로 리다이렉트
2. GET /api/oauth/naver/callback  # 네이버에서 콜백 (자동 처리)
3. 프론트엔드로 리다이렉트         # 로그인 완료
```

### 미들웨어

```typescript
// isAuthenticated - 로그인 확인
app.get("/api/cart", isAuthenticated, async (req, res) => {
  const userId = req.session.userId!;
  // ...
});

// isAdmin - 관리자 권한 확인 (isAuthenticated 이후 사용)
app.post("/api/admin/products", isAuthenticated, isAdmin, async (req, res) => {
  // ...
});

// populateUser - 세션에서 사용자 정보를 req.user에 주입
// (모든 요청에 자동 적용됨)
```

### Express 타입 확장

```typescript
// server/types/index.ts
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        isAdmin: boolean;
      };
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId: number;
    oauthState?: string; // OAuth CSRF 방지용
  }
}
```

---

## 데이터베이스 스키마

### ERD (주요 테이블)

```
users (사용자)
├── id (PK, serial)
├── email (unique, required)
├── passwordHash (nullable - 소셜 로그인 사용자는 비밀번호 없음)
├── userName (required)
├── phone, zipCode, address, detailAddress
├── emailOptIn (default: false)
├── profileImageUrl
├── isAdmin (default: false)
├── naverId (unique) - 네이버 소셜 로그인 ID
├── socialProvider - 'naver', 'kakao' 등
├── createdAt, updatedAt

categories (카테고리)
├── id (PK)
├── name, slug (unique)
├── description, imageUrl
└── createdAt

products (상품)
├── id (PK)
├── name, slug (unique)
├── description
├── price, originalPrice
├── categoryId (FK → categories.id)
├── imageUrl, images[], detailImages[]
├── stockQuantity, isAvailable
└── createdAt, updatedAt

productVariants (상품 옵션)
├── id (PK)
├── productId (FK → products.id, cascade)
├── size, color, sku (unique)
├── price, stockQuantity, isAvailable
└── createdAt, updatedAt

productSizeMeasurements (사이즈별 실측)
├── id (PK)
├── productVariantId (FK → productVariants.id, cascade)
├── totalLength, shoulderWidth, chestSection
├── sleeveLength, waistSection, hipSection, thighSection
├── displayOrder
└── createdAt

orders (주문)
├── id (PK)
├── userId (FK → users.id)
├── totalAmount, status
├── shippingName, shippingPhone
├── shippingPostalCode, shippingAddress
├── shippingDetailAddress - 상세 주소
├── shippingRequestNote - 배송 요청사항
├── trackingNumber
├── paymentProvider - 'toss', 'naverpay', 'kakaopay' 등
├── paymentKey - PG사 결제 고유 키
├── externalOrderId - PG사 주문 ID
├── paymentMethod - 'card', 'transfer' 등
├── paidAt, canceledAt, cancelReason, refundedAmount
└── createdAt, updatedAt

orderItems (주문 상품)
├── id (PK)
├── orderId (FK → orders.id, cascade)
├── productId (FK → products.id)
├── productName, productPrice, options, quantity
├── status, trackingNumber - 개별 상품 상태 관리
└── createdAt

deliveryAddresses (배송지 관리)
├── id (PK)
├── userId (FK → users.id, cascade)
├── recipient, phone, zipCode
├── address, detailAddress
├── requestNote - 배송 요청사항
├── isDefault
└── createdAt

wishlistItems (위시리스트)
├── id (PK)
├── userId (FK → users.id, cascade)
├── productId (FK → products.id, cascade)
└── createdAt

cartItems (장바구니)
├── id (PK)
├── userId (FK → users.id, cascade)
├── productId (FK → products.id, cascade)
├── variantId (FK → productVariants.id, nullable)
├── quantity
└── createdAt, updatedAt

sessions (세션 저장소)
├── sid (PK)
├── sess (jsonb)
└── expire

emailVerifications (이메일 인증코드)
├── id (PK)
├── email (required)
├── code (6자리 인증코드)
├── type ('signup', 'password_reset')
├── verified (default: false)
├── expiresAt (만료 시간)
└── createdAt
```

### 주문 상태 (OrderStatus)

```typescript
type OrderStatus =
  | "pending_payment"    // 결제 대기
  | "payment_confirmed"  // 결제 완료
  | "preparing"          // 상품 준비 중
  | "shipped"            // 배송 중
  | "delivered"          // 배송 완료
  | "cancelled";         // 취소됨
```

---

## API 엔드포인트

### 인증 API

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/auth/signup` | 없음 | 회원가입 (이메일 인증 필수) |
| POST | `/api/auth/login` | 없음 | 로그인 |
| POST | `/api/auth/logout` | 없음 | 로그아웃 |
| GET | `/api/auth/user` | 필요 | 현재 사용자 정보 |
| PUT | `/api/auth/user` | 필요 | 사용자 정보 수정 |
| PUT | `/api/auth/password` | 필요 | 비밀번호 변경 |
| POST | `/api/auth/send-verification` | 없음 | 이메일 인증코드 발송 |
| POST | `/api/auth/verify-email` | 없음 | 이메일 인증코드 확인 |
| GET | `/api/auth/check-verification` | 없음 | 이메일 인증 상태 확인 |

#### 이메일 인증 흐름

```
1. POST /api/auth/send-verification (인증코드 발송)
   └─ 6자리 인증코드 이메일 발송 (10분 유효)

2. POST /api/auth/verify-email (인증코드 확인)
   └─ 인증코드 검증 및 인증 완료 처리

3. POST /api/auth/signup (회원가입)
   └─ 이메일 인증 완료 후에만 회원가입 가능
```

#### 이메일 인증코드 발송 요청

```typescript
POST /api/auth/send-verification
{
  "email": "user@example.com",
  "type": "signup"  // 'signup' | 'password_reset'
}

// 응답
{
  "message": "인증코드가 발송되었습니다"
}
```

#### 이메일 인증코드 확인 요청

```typescript
POST /api/auth/verify-email
{
  "email": "user@example.com",
  "code": "123456",
  "type": "signup"
}

// 응답
{
  "message": "이메일이 인증되었습니다",
  "verified": true
}
```

### OAuth API (소셜 로그인)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/oauth/naver/login` | 네이버 로그인 시작 |
| GET | `/api/oauth/naver/callback` | 네이버 로그인 콜백 |

### 공개 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/products` | 상품 목록 (검색, 카테고리 필터) |
| GET | `/api/products/:id` | 상품 상세 |
| GET | `/api/products/:id/variants` | 상품 옵션 목록 |
| GET | `/api/categories` | 카테고리 목록 |
| GET | `/api/variants` | 상품 옵션 전체 목록 |

### 보호된 API (인증 필요)

#### 장바구니

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/cart` | 장바구니 조회 |
| POST | `/api/cart` | 장바구니에 상품 추가 |
| PATCH | `/api/cart/:id` | 장바구니 수량 변경 |
| DELETE | `/api/cart/:id` | 장바구니 아이템 삭제 |

#### 주문

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/orders` | 주문 생성 |
| GET | `/api/orders` | 내 주문 목록 |
| GET | `/api/orders/:id` | 주문 상세 |
| POST | `/api/orders/:id/cancel` | 주문 취소 |

#### 주문 생성 요청 예시

```typescript
POST /api/orders
{
  "shippingName": "홍길동",
  "shippingPhone": "010-1234-5678",
  "shippingPostalCode": "12345",
  "shippingAddress": "서울시 강남구 테헤란로 123",
  "shippingDetailAddress": "101동 1001호",
  "shippingRequestNote": "부재 시 경비실에 맡겨주세요"
}

// 응답
{
  "orderId": 1,
  "externalOrderId": "SHAKI_M1234_ABC123",  // PG사 주문번호
  "orderName": "상품명 외 2건",
  "amount": 50000
}
```

#### 주문 취소 요청 예시

```typescript
POST /api/orders/:id/cancel
{
  "cancelReason": "고객 변심",  // 선택, 기본값: "고객 요청에 의한 취소"
  "cancelAmount": 50000         // 선택, 부분 취소 시 사용
}

// 응답 (결제 완료 주문 취소 시)
{
  "message": "주문이 취소되었습니다",
  "order": { ... },
  "refund": {
    "cancelAmount": 50000,
    "refundableAmount": 0,
    "canceledAt": "2025-12-16T..."
  }
}

// 응답 (결제 대기 주문 취소 시)
{
  "message": "주문이 취소되었습니다",
  "order": { ... }
}
```

**주문 취소 가능 상태:**

| 주문 상태 | 취소 가능 | 처리 방식 |
|----------|----------|----------|
| `pending_payment` | O | 단순 상태 변경 |
| `payment_confirmed` | O | PG사 결제 취소 후 상태 변경 |
| `preparing` | O | PG사 결제 취소 후 상태 변경 |
| `shipped` | X | 취소 불가 (400 에러) |
| `delivered` | X | 취소 불가 (400 에러) |
| `cancelled` | X | 이미 취소됨 (400 에러) |

#### 결제

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/payments/client-key` | 토스페이먼츠 클라이언트 키 |
| POST | `/api/payments/confirm` | 결제 승인 |
| POST | `/api/payments/:orderId/cancel` | 결제 취소 |
| GET | `/api/payments/:orderId/status` | 결제 상태 조회 |

#### 위시리스트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/wishlist` | 위시리스트 조회 |
| POST | `/api/wishlist` | 위시리스트에 추가 |
| DELETE | `/api/wishlist/:productId` | 위시리스트에서 제거 |

#### 배송지 관리

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/user/addresses` | 배송지 목록 |
| POST | `/api/user/addresses` | 배송지 추가 |
| PUT | `/api/user/addresses/:id` | 배송지 수정 |
| DELETE | `/api/user/addresses/:id` | 배송지 삭제 |

### 관리자 API (인증 + 관리자 권한 필요)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/orders` | 전체 주문 목록 |
| PATCH | `/api/admin/orders/:id` | 주문 상태/운송장 수정 |
| PATCH | `/api/admin/order-items/:id` | 개별 상품 상태 수정 |
| POST | `/api/admin/products` | 상품 생성 |
| PATCH | `/api/admin/products/:id` | 상품 수정 |
| DELETE | `/api/admin/products/:id` | 상품 삭제 |
| POST | `/api/admin/categories` | 카테고리 생성 |
| PATCH | `/api/admin/categories/:id` | 카테고리 수정 |
| DELETE | `/api/admin/categories/:id` | 카테고리 삭제 |
| GET | `/api/admin/payments/:orderId` | 결제 상세 조회 |
| POST | `/api/admin/payments/:orderId/cancel` | 강제 결제 취소 |

---

## 결제 시스템

### 아키텍처 (PG사 통합 구조)

현재 토스페이먼츠를 지원하며, 네이버페이/카카오페이 등 다른 PG사 확장이 용이한 구조입니다.

```
┌─────────────────────────────────────────────────────────────┐
│                      orders 테이블                          │
├─────────────────────────────────────────────────────────────┤
│ paymentProvider: 'toss' | 'naverpay' | 'kakaopay' | ...    │
│ paymentKey: PG사 결제 고유 키                               │
│ externalOrderId: PG사 주문 ID                               │
│ paymentMethod: 'card' | 'transfer' | 'naverpay' | ...      │
└─────────────────────────────────────────────────────────────┘
```

### 결제 흐름 (토스페이먼츠)

```
1. 주문 생성 (POST /api/orders)
   └─ externalOrderId 생성 (SHAKI_XXXXX_XXXXX)

2. 클라이언트: 토스페이먼츠 결제창 호출
   └─ orderId = externalOrderId 사용

3. 결제 승인 (POST /api/payments/confirm)
   └─ paymentProvider: 'toss' 설정
   └─ paymentKey, externalOrderId 저장

4. 주문 상태 업데이트 → payment_confirmed
```

### 결제 승인 요청

```typescript
POST /api/payments/confirm
{
  "paymentKey": "toss_payment_key_xxx",
  "orderId": "SHAKI_M1234_ABC123",
  "amount": 50000
}
```

### 결제 취소/환불

```typescript
POST /api/payments/:orderId/cancel
{
  "cancelReason": "고객 변심",
  "cancelAmount": 50000  // 부분 취소 시
}
```

### 네이버페이/카카오페이 연동 시 (향후)

```typescript
// 새 PG사 서비스 파일 생성
// server/services/naverpay.service.ts

// 결제 승인 시 paymentProvider로 분기
if (paymentProvider === 'toss') {
  await confirmTossPayment(paymentKey, orderId, amount);
} else if (paymentProvider === 'naverpay') {
  await confirmNaverPayment(paymentKey, orderId, amount);
}
```

---

## Storage 인터페이스

### 개요

`IStorage` 인터페이스는 모든 데이터베이스 작업을 추상화합니다.

### 주요 메서드

```typescript
interface IStorage {
  // 사용자
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByNaverId(naverId: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: number, data: UserUpdateData): Promise<User | undefined>;

  // 상품
  getProducts(options?): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // 주문
  createOrder(userId: number, orderData, items: OrderItemCreateData[]): Promise<Order>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderByExternalOrderId(externalOrderId: string): Promise<Order | undefined>;
  getUserOrders(userId: number): Promise<Order[]>;
  updateOrderStatus(id: number, statusUpdate: OrderStatusUpdate): Promise<Order | undefined>;
  updateOrderPayment(id: number, paymentData): Promise<Order | undefined>;
  cancelOrderPayment(id: number, cancelData): Promise<Order | undefined>;

  // 장바구니, 위시리스트, 배송지 등...
}
```

---

## 새로운 기능 추가하기

### 1. 새로운 테이블 추가

```bash
# Step 1: shared/schema.ts에 테이블 정의
# Step 2: 데이터베이스 푸시
npm run db:push

# Step 3: server/storage.ts에 IStorage 인터페이스 메서드 추가
# Step 4: server/routes/에 API 라우트 파일 생성
# Step 5: server/routes/index.ts에 라우트 등록
```

### 2. 새로운 PG사 추가 (예: 네이버페이)

```typescript
// Step 1: server/services/naverpay.service.ts 생성
export async function confirmNaverPayment(...) { ... }
export async function cancelNaverPayment(...) { ... }

// Step 2: server/routes/payment.routes.ts에서 paymentProvider로 분기 처리

// Step 3: server/config/index.ts에 환경 변수 추가
naverpay: {
  clientId: process.env.NAVERPAY_CLIENT_ID,
  secretKey: process.env.NAVERPAY_SECRET_KEY,
}
```

### 3. 새로운 소셜 로그인 추가 (예: 카카오)

```typescript
// Step 1: server/services/kakao.service.ts 생성
// Step 2: server/routes/oauth.routes.ts에 카카오 라우트 추가
// Step 3: shared/schema.ts의 users 테이블에 kakaoId 필드 추가
// Step 4: server/config/index.ts에 카카오 OAuth 설정 추가
```

---

## 환경 변수

### 필수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | 세션 암호화 키 | 32자 이상 랜덤 문자열 |

### 선택

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `NODE_ENV` | 실행 환경 | `development` |
| `PORT` | 서버 포트 | `5000` |
| `SECURE_COOKIE` | HTTPS 쿠키 설정 | `true` (프로덕션) |
| `CORS_ORIGINS` | 허용된 CORS origin (쉼표 구분) | `*` |
| `FRONTEND_URL` | 프론트엔드 URL (OAuth 리다이렉트용) | `http://localhost:3000` |

### 토스페이먼츠

| 변수명 | 설명 |
|--------|------|
| `TOSS_CLIENT_KEY` | 토스페이먼츠 클라이언트 키 |
| `TOSS_SECRET_KEY` | 토스페이먼츠 시크릿 키 |

### 네이버 OAuth

| 변수명 | 설명 |
|--------|------|
| `NAVER_CLIENT_ID` | 네이버 개발자 앱 Client ID |
| `NAVER_CLIENT_SECRET` | 네이버 개발자 앱 Client Secret |
| `NAVER_CALLBACK_URL` | 네이버 OAuth 콜백 URL |

### Resend (이메일 발송)

| 변수명 | 설명 |
|--------|------|
| `RESEND_API_KEY` | Resend API 키 |
| `EMAIL_FROM` | 발신자 이메일 주소 (기본값: `noreply@example.com`) |
| `EMAIL_FROM_NAME` | 발신자 이름 (기본값: `ShakiShaki`) |

---

## 문제 해결

### 1. 데이터베이스 연결 실패

```bash
# DATABASE_URL 확인
echo $DATABASE_URL

# PostgreSQL 연결 테스트
psql $DATABASE_URL -c "SELECT 1"
```

### 2. 세션 유지 안됨

- `SESSION_SECRET` 환경 변수 확인
- `sessions` 테이블 존재 확인
- CORS `credentials: true` 설정 확인
- 프론트엔드에서 `credentials: 'include'` 옵션 사용 확인

### 3. 네이버 로그인 실패

- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 환경 변수 확인
- 네이버 개발자 센터에서 콜백 URL 등록 확인
- `NAVER_CALLBACK_URL`이 등록된 URL과 일치하는지 확인

### 4. 결제 승인 실패

- 토스페이먼츠 시크릿 키 확인
- 결제 금액 일치 여부 확인 (서버 vs 클라이언트)
- `externalOrderId` 형식 확인 (6-64자)

### 5. 관리자 권한 부여

```sql
UPDATE users SET is_admin = true WHERE email = 'admin@example.com';
```

또는 스크립트 사용:

```bash
npx tsx server/scripts/create-admin.ts
```

### 6. 스키마 변경 후 적용

```bash
# 타입 체크
npm run check

# DB 반영
npm run db:push
```

---

## 스크립트 명령어

```bash
# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start

# TypeScript 타입 체크
npm run check

# 데이터베이스 스키마 푸시
npm run db:push
```

---

## 변경 이력

### 2025-12-17 (최신)

**이메일 인증 기능 추가**

- 회원가입 시 이메일 인증코드 발송 필수
- Resend 이메일 서비스 연동
- `server/services/email.service.ts` 추가
- `emailVerifications` 테이블 추가
- 인증 API 추가: `send-verification`, `verify-email`, `check-verification`

**환경 변수 추가**

- `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`

### 2025-12-16

**소셜 로그인 지원**

- 네이버 OAuth 로그인 추가
- `server/services/naver.service.ts` 추가
- `server/routes/oauth.routes.ts` 추가
- users 테이블에 `naverId`, `socialProvider` 필드 추가
- `passwordHash` nullable로 변경 (소셜 로그인 사용자 지원)

**환경 변수 추가**

- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_CALLBACK_URL`
- `FRONTEND_URL`, `CORS_ORIGINS`

### 2025-12-15

**orders 테이블 스키마 변경**

- `shippingDetailAddress` 추가 (상세 주소)
- `shippingRequestNote` 추가 (배송 요청사항)
- 결제 필드 일반화 (PG사 통합 대응)
  - `tossPaymentKey` → `paymentKey`
  - `tossOrderId` → `externalOrderId`
  - `paymentProvider` 추가

---

## 추가 리소스

- [Express.js 문서](https://expressjs.com/)
- [Drizzle ORM 문서](https://orm.drizzle.team/)
- [Zod 문서](https://zod.dev/)
- [토스페이먼츠 API 문서](https://docs.tosspayments.com/)
- [네이버 로그인 API 문서](https://developers.naver.com/docs/login/api/)
- [Neon PostgreSQL 문서](https://neon.tech/docs/)

---

MIT License
