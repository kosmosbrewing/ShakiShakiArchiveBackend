# CLAUDE.md

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

## Project Guidelines

- 보안·안정성·코딩 컨벤션 원칙: 전역 규칙(`~/.claude/rules/security.md`, `reliability.md`)을 따른다. 이 파일에 재기술하지 않는다.
- 이 프로젝트의 예외: 인증은 **express-session + connect-pg-simple 세션 기반** — JWT 아님. 세션은 PostgreSQL `sessions` 테이블에 저장.
- `.claudeignore`에 명시된 경로(.env, certs/ 등)는 읽기·분석·전송 대상에서 제외한다.
- main push = 프로덕션 배포(deploy-ecr.yml). 문서·설정만 변경한 커밋은 메시지에 `[skip ci]`를 붙인다.
