# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShakiShaki Archive Backend - 한국어 전자상거래 플랫폼의 API 전용 백엔드 서버. Express.js + TypeScript + Drizzle ORM + PostgreSQL 기반.

## Commands

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

## Architecture

### Directory Structure

```
server/           # Express 백엔드
├── index.ts      # 서버 진입점 (Express 앱 초기화, CORS, 로깅)
├── routes.ts     # 모든 API 라우트 정의
├── auth.ts       # 인증 미들웨어 (isAuthenticated, isAdmin, populateUser)
├── storage.ts    # IStorage 인터페이스 및 DatabaseStorage 구현
├── db.ts         # Drizzle ORM + pg Pool 설정
└── scripts/      # seed-data, create-admin 등 유틸리티 스크립트

shared/
└── schema.ts     # Drizzle 스키마 + Zod 검증 스키마 + TypeScript 타입
```

### Key Patterns

**Storage Pattern**: 모든 DB 작업은 `IStorage` 인터페이스를 통해 추상화됨. `storage.ts`의 `DatabaseStorage` 클래스가 실제 구현.

**Authentication**: 세션 기반 인증 (express-session + connect-pg-simple). 세션은 PostgreSQL `sessions` 테이블에 저장.

**Validation**: Zod 스키마로 요청 데이터 검증. `drizzle-zod`의 `createInsertSchema`로 DB 스키마에서 자동 생성.

### Database Schema (주요 테이블)

- `users` - 사용자 (email, passwordHash, userName, 주소 정보, isAdmin)
- `products` - 상품 (name, price, categoryId, images, detailImages)
- `productVariants` - 상품 옵션/사이즈 (size, color, sku, stockQuantity)
- `productSizeMeasurements` - 사이즈별 실측 정보
- `categories` - 카테고리
- `cartItems` - 장바구니 (userId, productId, variantId)
- `orders` - 주문
- `orderItems` - 주문 상품 (개별 상품별 status, trackingNumber)
- `deliveryAddresses` - 배송지 관리
- `wishlistItems` - 위시리스트

### API Route Categories

- `/api/auth/*` - 인증 (signup, login, logout, user, password)
- `/api/products`, `/api/categories` - 공개 API
- `/api/cart`, `/api/orders`, `/api/wishlist`, `/api/user/addresses` - 인증 필요
- `/api/admin/*` - 관리자 전용 (상품/주문/카테고리 관리)

## Environment Variables

필수:

- `DATABASE_URL` - PostgreSQL 연결 문자열
- `SESSION_SECRET` - 세션 암호화 키

선택:

- `NODE_ENV` - development/production
- `PORT` - 서버 포트 (기본값: 5000)
- `SECURE_COOKIE` - 프로덕션에서 secure 쿠키 비활성화 시 "false"

## TypeScript Path Aliases

```typescript
"@/*"       -> "./client/src/*"
"@shared/*" -> "./shared/*"
```

## Adding New Features

1. `shared/schema.ts`에 테이블 스키마 + Zod 스키마 + 타입 정의
2. `npm run db:push`로 DB 반영
3. `server/storage.ts`에 IStorage 인터페이스 메서드 추가 + DatabaseStorage 구현
4. `server/routes.ts`에 API 엔드포인트 추가

### Core Principles

#### 1. Security First (보안 무결점)

- **OWASP Compliance:** SQL Injection, XSS, CSRF 취약점 원천 차단.
- **Validation:** 모든 사용자 입력값(Input)은 검증 및 살균(Sanitization) 필수.
- **Sensitive Data:** API Key, DB 접속 정보 등은 절대 하드코딩 금지 (`.env` 사용).
- **AI Context Isolation**: Claude는 프로젝트를 분석할 때 반드시 `.claudeignore` 파일을 최우선으로 참고해야 합니다. 해당 파일에 명시된 모든 경로는 읽기, 분석, 전송 대상에서 즉각 제외합니다.
- **Ignore List Update**: 새로운 민감한 설정 파일이나 보안 자산이 추가될 경우, 즉시 `.claudeignore`에 반영할 것을 개발자에게 제안해야 합니다.

#### 2. Stability & Performance (안정성 및 성능)

- **Error Handling:** 서버 셧다운 방지를 위한 `try-catch`, Global Error Middleware 필수 적용.
- **DB Optimization:** N+1 문제 방지, 인덱싱(Indexing) 고려, 불필요한 쿼리 최소화.
- **Resource:** 메모리 누수 방지 및 비동기(Async/Await) 로직의 안전한 처리.

#### 3. MVP Efficiency (실전형 개발)

- **Architecture:** 유지보수가 쉬운 모듈화 구조(Modular Structure) 채택.
- **Speed:** 이론적 설명보다는 **"복사해서 바로 쓸 수 있는 코드(Production-Ready)"** 우선 제공.
- **Refactoring:** 중복 코드를 피하고 재사용 가능한 유틸리티 함수 적극 활용.

### Coding Convention & Output

- **File Structure:** 코드를 줄 때는 반드시 파일명과 경로를 상단에 명시할 것.
  (예: `src/controllers/auth.controller.js`)
- **Comments:** 코드 내 주석은 **한국어**로 달아서 로직을 설명할 것.
- **Full Context:** 기존 코드를 수정할 때, 사용자가 헷갈리지 않도록 변경된 부분의 전후 맥락을 포함할 것.
