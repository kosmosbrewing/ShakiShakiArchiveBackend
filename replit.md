# ShopHub - 한국 전자상거래 플랫폼

## Overview
완전한 기능을 갖춘 한국어 쇼핑몰 웹사이트입니다. Vue 3 Composition API로 구축되었으며, 사용자는 상품을 검색하고, 카테고리별로 필터링하며, 장바구니에 담고, 주문할 수 있습니다. 관리자는 상품, 카테고리, 주문을 수동으로 관리합니다.

## Recent Changes
- **2025-11-09**: React에서 Vue 3로 완전 전환
  - Vue 3 Composition API + TypeScript
  - Vue Router로 라우팅
  - Pinia로 상태 관리
  - Headless UI + Radix Vue로 UI 컴포넌트
  - 이메일/비밀번호 인증으로 전환 (Replit Auth 제거)
  - 백엔드 세션 기반 인증 구현
  - 수동 결제 시스템 (Stripe 미사용)

- **2024-11-08**: 초기 프로젝트 구축 (React)
  - PostgreSQL 데이터베이스 설정
  - 한국어 폰트 (Noto Sans KR) 적용
  - 녹색 primary 컬러 테마 (142 76% 36%)
  - 샘플 데이터 추가

## Project Architecture

### Frontend (Vue 3 + Vite + TypeScript)

**기술 스택**:
- Vue 3 (Composition API)
- TypeScript
- Vite
- Vue Router
- Pinia (상태 관리)
- Headless UI + Radix Vue
- TailwindCSS
- vee-validate + Zod (폼 검증)

**페이지**:
- `/` - 홈 페이지
- `/login` - 로그인
- `/signup` - 회원가입
- `/products/:id` - 상품 상세
- `/cart` - 장바구니 (로그인 필요)
- `/checkout` - 주문/결제 (로그인 필요)
- `/orders` - 주문 내역 (로그인 필요)
- `/orders/:id` - 주문 상세 (로그인 필요)
- `/admin` - 관리자 페이지 (관리자만)

**디렉토리 구조**:
```
client/src/
├── pages/          # Vue 페이지 컴포넌트
│   ├── Home.vue
│   ├── Login.vue
│   ├── Signup.vue
│   ├── ProductDetail.vue
│   ├── Cart.vue
│   ├── Checkout.vue
│   ├── Orders.vue
│   ├── OrderDetail.vue
│   ├── Admin.vue
│   └── NotFound.vue
├── stores/         # Pinia 스토어
│   └── auth.ts
├── router/         # Vue Router 설정
│   └── index.ts
├── components/     # 재사용 컴포넌트 (구현 예정)
├── lib/           # 유틸리티
│   └── utils.ts
├── App.vue        # 루트 컴포넌트
├── main.ts        # Vue 앱 진입점
└── index.css      # Tailwind CSS
```

### Backend (Express + TypeScript)

**인증**: 이메일/비밀번호 기반 세션 인증
- bcrypt로 비밀번호 해싱
- express-session으로 세션 관리
- PostgreSQL에 세션 저장 (connect-pg-simple)
- 쿠키 기반 인증 (httpOnly, secure)

**데이터베이스**: PostgreSQL (Drizzle ORM)

**Storage Interface**: DatabaseStorage 클래스로 CRUD 작업 추상화

### Database Schema

- `users` - 사용자 (이메일, passwordHash, firstName, lastName, isAdmin)
- `categories` - 카테고리
- `products` - 상품 (이름, 설명, 가격, 할인가, 재고, 카테고리)
- `cart_items` - 장바구니 아이템
- `orders` - 주문 (배송 정보, 상태, 총액)
- `order_items` - 주문 상품 내역
- `sessions` - 세션 저장

### API Endpoints

**인증 (Public)**:
- `POST /api/auth/signup` - 회원가입
- `POST /api/auth/login` - 로그인
- `POST /api/auth/logout` - 로그아웃
- `GET /api/auth/user` - 현재 사용자 정보 (로그인 필요)

**공개 API**:
- `GET /api/products` - 상품 목록 (검색, 카테고리 필터)
- `GET /api/products/:id` - 상품 상세
- `GET /api/categories` - 카테고리 목록

**보호된 API (로그인 필요)**:
- `GET /api/cart` - 장바구니 조회
- `POST /api/cart` - 장바구니에 상품 추가
- `PATCH /api/cart/:id` - 장바구니 수량 수정
- `DELETE /api/cart/:id` - 장바구니 아이템 삭제
- `GET /api/orders` - 주문 내역
- `GET /api/orders/:id` - 주문 상세
- `POST /api/orders` - 주문 생성

**관리자 API (관리자만)**:
- `GET /api/admin/products` - 모든 상품 조회
- `POST /api/admin/products` - 상품 생성
- `PATCH /api/admin/products/:id` - 상품 수정
- `DELETE /api/admin/products/:id` - 상품 삭제
- `GET /api/admin/orders` - 모든 주문 조회
- `PATCH /api/admin/orders/:id` - 주문 상태 및 운송장 번호 업데이트
- `POST /api/admin/categories` - 카테고리 생성
- `PATCH /api/admin/categories/:id` - 카테고리 수정
- `DELETE /api/admin/categories/:id` - 카테고리 삭제

## User Preferences

### Design Preferences
- 한국 시장 타겟 (한국어 UI, Noto Sans KR 폰트)
- 신뢰감을 주는 녹색 계열 primary 컬러 (142 76% 36%)
- 전문적이고 깔끔한 디자인
- 넉넉한 여백과 명확한 CTA
- **수동 결제 시스템** (Stripe 미사용)
  - 주문 상태: pending_payment → payment_confirmed → preparing → shipped → delivered
  - 관리자가 주문 상태와 운송장 번호를 수동으로 관리

### Coding Style
- TypeScript strict mode
- Vue 3 Composition API
- Tailwind CSS for styling
- Zod for validation
- Pinia for state management
- Vue Router for routing

## Development Workflow

1. **스키마 수정**: `shared/schema.ts` 편집
2. **데이터베이스 푸시**: `npm run db:push`
3. **개발 서버**: `npm run dev` (자동 실행됨)

## Authentication Flow

### 회원가입
1. 사용자가 이메일, 비밀번호, 이름 입력
2. 백엔드에서 Zod로 검증
3. bcrypt로 비밀번호 해싱
4. 데이터베이스에 사용자 생성
5. 세션 생성 후 로그인 상태로 전환

### 로그인
1. 사용자가 이메일, 비밀번호 입력
2. 백엔드에서 이메일로 사용자 조회
3. bcrypt로 비밀번호 검증
4. 세션 생성

### 라우트 가드
- `requiresAuth`: 로그인 필요한 페이지 (장바구니, 주문 등)
- `requiresGuest`: 비로그인 상태에서만 접근 (로그인, 회원가입)
- `requiresAdmin`: 관리자 권한 필요

## Payment System

현재 **수동 결제 시스템**을 사용합니다:

1. 사용자가 주문 생성 (`POST /api/orders`)
2. 주문 상태는 자동으로 `pending_payment`로 설정
3. 관리자가 결제 확인 후 수동으로 `payment_confirmed`로 변경
4. 이후 관리자가 상태를 순차적으로 업데이트:
   - `preparing` (상품 준비 중)
   - `shipped` (배송 중, 운송장 번호 입력)
   - `delivered` (배송 완료)
5. 필요 시 `cancelled` 상태로 변경 가능

향후 Stripe 등 자동 결제 시스템 통합 가능 (`stripePaymentIntentId` 필드 예약됨)

## Testing

### 관리자 권한 부여
```sql
-- 회원가입 후 사용자 이메일로 관리자 권한 부여
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

### 개발 환경 테스트
1. `/signup`에서 계정 생성
2. SQL로 관리자 권한 부여
3. `/admin`에서 상품/주문 관리 테스트

## Environment Variables

**필수**:
- `DATABASE_URL` - PostgreSQL 연결 문자열 (자동 설정됨)
- `SESSION_SECRET` - 세션 암호화 키 (자동 설정됨)

**선택**:
- `NODE_ENV` - 실행 환경 (development/production)
- `PORT` - 서버 포트 (기본값: 5000)

## Database Setup

### 초기 설정
```bash
# 스키마 푸시
npm run db:push

# 또는 강제 푸시 (데이터 손실 주의)
npm run db:push -- --force
```

### 샘플 데이터 추가
백엔드 코드에서 수동으로 추가하거나 SQL로 직접 삽입

## Project Structure

```
shophub/
├── client/                   # Vue 3 프론트엔드
│   ├── src/
│   │   ├── pages/           # 페이지 컴포넌트
│   │   ├── stores/          # Pinia 스토어
│   │   ├── router/          # Vue Router
│   │   ├── components/      # 재사용 컴포넌트
│   │   ├── lib/            # 유틸리티
│   │   ├── App.vue         # 루트 컴포넌트
│   │   ├── main.ts         # 진입점
│   │   └── index.css       # Tailwind CSS
│   └── index.html
│
├── server/                   # Express 백엔드
│   ├── index.ts             # 서버 진입점
│   ├── routes.ts            # API 라우트
│   ├── auth.ts              # 인증 미들웨어
│   ├── storage.ts           # DB 인터페이스
│   ├── db.ts                # Drizzle 설정
│   └── vite.ts              # Vite 개발 서버
│
├── shared/                   # 공유 타입/스키마
│   └── schema.ts            # Drizzle ORM 스키마
│
├── BACKEND_GUIDE.md         # 백엔드 수정 가이드 📚
├── PROJECT_EXPORT_GUIDE.md  # 프로젝트 다운로드/설치 가이드
├── design_guidelines.md     # 디자인 가이드라인
├── replit.md                # 프로젝트 메모리 (이 파일)
├── package.json
├── vite.config.ts           # Vite 설정 (Vue plugin)
├── tailwind.config.ts
└── drizzle.config.ts
```

## Notes

- Object Storage 통합 가능 (상품 이미지 업로드용)
- 현재는 이미지 URL을 직접 입력하는 방식
- Vue UI 컴포넌트 라이브러리는 Headless UI + Radix Vue 사용 예정
- 상품 목록, 장바구니, 관리자 페이지 등은 구현 예정

## Documentation

- **백엔드 가이드**: `BACKEND_GUIDE.md` 참조
  - API 엔드포인트 상세 문서
  - 인증 시스템 가이드
  - Storage 인터페이스 설명
  - 새로운 기능 추가 방법
  - 문제 해결 가이드

- **프로젝트 내보내기**: `PROJECT_EXPORT_GUIDE.md` 참조
  - 로컬 환경 설치 방법
  - 데이터베이스 설정
  - 배포 옵션

- **디자인 가이드**: `design_guidelines.md` 참조
  - 색상 시스템
  - 타이포그래피
  - 레이아웃 시스템
  - 컴포넌트 가이드

## Tech Stack Summary

**Frontend**:
- Vue 3 (Composition API)
- TypeScript
- Vite
- Vue Router
- Pinia
- TailwindCSS
- Headless UI + Radix Vue
- vee-validate + Zod

**Backend**:
- Node.js + Express
- TypeScript
- Drizzle ORM
- PostgreSQL
- bcrypt (비밀번호 해싱)
- express-session (세션 관리)

**Design**:
- Noto Sans KR 폰트
- 녹색 테마 (142 76% 36%)
- 반응형 디자인
- 한국 시장 최적화
