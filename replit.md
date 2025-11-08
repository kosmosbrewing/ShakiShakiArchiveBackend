# 쇼핑몰 (ShopHub) - E-Commerce Platform

## Overview
완전한 기능을 갖춘 한국어 쇼핑몰 웹사이트입니다. 사용자는 상품을 검색하고, 카테고리별로 필터링하며, 장바구니에 담고, 주문할 수 있습니다. 관리자는 상품, 카테고리, 주문을 관리할 수 있습니다.

## Recent Changes
- **2024-11-08**: 초기 프로젝트 구축 완료
  - Replit Auth 통합으로 사용자 인증 구현
  - PostgreSQL 데이터베이스 설정 (사용자, 상품, 카테고리, 장바구니, 주문)
  - 모든 프론트엔드 페이지 구축 (Landing, Home, ProductDetail, Cart, Checkout, Orders, Admin)
  - 모든 백엔드 API 엔드포인트 구현
  - 한국어 폰트 (Noto Sans KR) 적용
  - 녹색 primary 컬러 테마 (142 76% 36%)
  - 샘플 데이터 추가 (카테고리 5개, 상품 8개)

## Project Architecture

### Frontend (React + Vite + TypeScript)
- **Pages**:
  - `/` - Landing page (로그아웃 시) / Home (로그인 시)
  - `/product/:id` - 상품 상세 페이지
  - `/cart` - 장바구니
  - `/checkout` - 주문/결제 페이지
  - `/orders` - 주문 내역
  - `/order/:id` - 주문 상세
  - `/admin` - 관리자 대시보드 (상품/주문/카테고리 관리)

- **Components**:
  - `Navbar` - 로그인 상태, 장바구니 개수, 검색 기능
  - `ProductCard` - 상품 카드 (이미지, 이름, 가격, 할인율, 장바구니 담기)

- **UI Library**: Shadcn UI + Radix UI primitives

### Backend (Express + TypeScript)
- **Auth**: Replit Auth (OpenID Connect) with session-based authentication
- **Database**: PostgreSQL (Drizzle ORM)
- **Storage Interface**: DatabaseStorage class with CRUD operations

### Database Schema
- `users` - 사용자 (Replit Auth 통합, isAdmin 플래그)
- `categories` - 카테고리
- `products` - 상품 (이름, 설명, 가격, 할인가, 재고, 카테고리)
- `cart_items` - 장바구니 아이템
- `orders` - 주문 (배송 정보, 상태, 총액)
- `order_items` - 주문 상품 내역
- `sessions` - 세션 저장 (Replit Auth 필수)

### API Endpoints

**Public**:
- `GET /api/products` - 상품 목록 (검색, 카테고리 필터)
- `GET /api/products/:id` - 상품 상세
- `GET /api/categories` - 카테고리 목록

**Protected (로그인 필요)**:
- `GET /api/auth/user` - 현재 사용자 정보
- `GET /api/cart` - 장바구니 조회
- `POST /api/cart` - 장바구니에 상품 추가
- `PATCH /api/cart/:id` - 장바구니 수량 수정
- `DELETE /api/cart/:id` - 장바구니 아이템 삭제
- `GET /api/orders` - 주문 내역
- `GET /api/orders/:id` - 주문 상세
- `POST /api/orders` - 주문 생성

**Admin Only**:
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
- Stripe 연동 제외 - 간단한 주문 생성 시스템
  - 주문 상태: pending_payment → payment_confirmed → preparing → shipped → delivered → cancelled
  - 관리자가 주문 상태와 운송장 번호를 수동으로 관리

### Coding Style
- TypeScript strict mode
- Tailwind CSS for styling (design_guidelines.md 참조)
- Zod for validation
- React Query for data fetching
- Wouter for routing

## Development Workflow
1. Schema 수정: `shared/schema.ts` 편집
2. Database 푸시: `npm run db:push`
3. 개발 서버: `npm run dev` (자동 실행됨)

## Testing
로그인 후 관리자 권한 부여:
```sql
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (자동 설정됨)
- `SESSION_SECRET` - Session encryption key (자동 설정됨)
- `REPL_ID` - Replit project ID (자동 설정됨)

## Notes
- Object Storage 통합 가능 (상품 이미지 업로드용)
- 현재는 이미지 URL을 직접 입력하는 방식
- Stripe 키가 설정되어 있지만 사용하지 않음 (향후 확장 가능)
