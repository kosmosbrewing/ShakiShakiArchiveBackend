# 백엔드 수정 가이드

## 목차
1. [프로젝트 구조](#프로젝트-구조)
2. [기술 스택](#기술-스택)
3. [인증 시스템](#인증-시스템)
4. [데이터베이스 스키마](#데이터베이스-스키마)
5. [API 엔드포인트](#api-엔드포인트)
6. [Storage 인터페이스](#storage-인터페이스)
7. [새로운 기능 추가하기](#새로운-기능-추가하기)
8. [환경 변수](#환경-변수)
9. [데이터베이스 마이그레이션](#데이터베이스-마이그레이션)
10. [문제 해결](#문제-해결)

---

## 프로젝트 구조

```
server/
├── index.ts          # 서버 진입점, Express 앱 초기화
├── routes.ts         # 모든 API 라우트 정의
├── auth.ts           # 인증 미들웨어 및 유틸리티
├── storage.ts        # 데이터베이스 추상화 레이어
├── db.ts             # Drizzle ORM 설정
└── vite.ts           # Vite 개발 서버 통합

shared/
└── schema.ts         # Drizzle 스키마 및 Zod 검증 스키마
```

### 주요 파일 역할

**server/index.ts**
- Express 앱 초기화
- JSON 파싱, 로깅 미들웨어 설정
- routes 등록
- 개발/프로덕션 모드에 따라 Vite 또는 정적 파일 제공

**server/routes.ts**
- 세션 설정
- 모든 API 엔드포인트 정의
- 인증 및 권한 검증
- 요청 검증 및 에러 처리

**server/auth.ts**
- 비밀번호 해싱 및 검증
- `isAuthenticated` 미들웨어: 로그인 확인
- `isAdmin` 미들웨어: 관리자 권한 확인
- `populateUser` 미들웨어: 모든 요청에 사용자 정보 추가

**server/storage.ts**
- `IStorage` 인터페이스: 모든 데이터베이스 작업 정의
- `DatabaseStorage` 클래스: Drizzle ORM을 사용한 구현
- 비즈니스 로직과 데이터베이스 로직 분리

**shared/schema.ts**
- Drizzle 테이블 스키마 정의
- Zod 검증 스키마 생성
- TypeScript 타입 추론

---

## 기술 스택

- **런타임**: Node.js + TypeScript
- **웹 프레임워크**: Express.js
- **데이터베이스**: PostgreSQL
- **ORM**: Drizzle ORM
- **인증**: 세션 기반 (express-session + connect-pg-simple)
- **비밀번호 해싱**: bcryptjs
- **검증**: Zod
- **빌드 도구**: Vite (개발), esbuild (프로덕션)

---

## 인증 시스템

### 개요
이 프로젝트는 **이메일/비밀번호 기반 세션 인증**을 사용합니다.

### 인증 흐름

#### 회원가입 (POST /api/auth/signup)
1. 클라이언트가 이메일, 비밀번호, 이름을 전송
2. `signupSchema`로 검증
3. 이메일 중복 확인
4. bcrypt로 비밀번호 해싱
5. 사용자 생성
6. 세션 생성 (`req.session.userId` 설정)
7. 사용자 정보 반환 (비밀번호 제외)

```typescript
// 요청 예시
POST /api/auth/signup
{
  "email": "user@example.com",
  "password": "securepassword123",
  "firstName": "홍",
  "lastName": "길동"
}

// 응답 예시
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "홍",
  "lastName": "길동",
  "isAdmin": false,
  "createdAt": "2025-11-09T...",
  "updatedAt": "2025-11-09T..."
}
```

#### 로그인 (POST /api/auth/login)
1. 클라이언트가 이메일, 비밀번호 전송
2. `loginSchema`로 검증
3. 이메일로 사용자 조회
4. bcrypt로 비밀번호 검증
5. 세션 생성
6. 사용자 정보 반환

```typescript
// 요청 예시
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

#### 로그아웃 (POST /api/auth/logout)
1. 세션 파기
2. 쿠키 삭제

#### 사용자 정보 조회 (GET /api/auth/user)
- 로그인한 사용자의 정보 반환
- `isAuthenticated` 미들웨어 필요

### 미들웨어

#### isAuthenticated
```typescript
// 사용 예시
app.get("/api/cart", isAuthenticated, async (req, res) => {
  const userId = req.session.userId!;
  // ...
});
```
- 세션에 `userId`가 있는지 확인
- 없으면 401 Unauthorized 반환

#### isAdmin
```typescript
// 사용 예시
app.post("/api/admin/products", isAuthenticated, isAdmin, async (req, res) => {
  // ...
});
```
- `isAuthenticated` 후에 사용해야 함
- 데이터베이스에서 사용자 조회
- `isAdmin` 플래그 확인
- 아니면 403 Forbidden 반환

#### populateUser
```typescript
// routes.ts에서 자동으로 적용됨
app.use(populateUser);
```
- 모든 요청에 대해 세션 확인
- 세션이 있으면 `req.user` 객체 추가
- 에러가 발생해도 다음 미들웨어로 진행

### 세션 설정

```typescript
// routes.ts
const sessionStore = new pgStore({
  conString: process.env.DATABASE_URL,
  createTableIfMissing: false,
  ttl: 7 * 24 * 60 * 60 * 1000, // 1주일
  tableName: "sessions",
});

app.use(session({
  secret: process.env.SESSION_SECRET!,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));
```

- **세션 저장소**: PostgreSQL `sessions` 테이블
- **만료 시간**: 1주일
- **쿠키 설정**:
  - `httpOnly`: JavaScript로 접근 불가 (XSS 방지)
  - `secure`: HTTPS에서만 전송 (프로덕션)
  - `maxAge`: 1주일

---

## 데이터베이스 스키마

### ERD (Entity Relationship Diagram)

```
users (사용자)
├── id (PK)
├── email (unique, required)
├── passwordHash (required)
├── firstName
├── lastName
├── profileImageUrl
├── isAdmin (default: false)
├── createdAt
└── updatedAt

categories (카테고리)
├── id (PK)
├── name
├── slug (unique)
├── description
├── imageUrl
└── createdAt

products (상품)
├── id (PK)
├── name
├── slug (unique)
├── description
├── price
├── originalPrice
├── categoryId (FK → categories.id)
├── imageUrl
├── images (array)
├── stockQuantity
├── isAvailable
├── createdAt
└── updatedAt

cart_items (장바구니)
├── id (PK)
├── userId (FK → users.id, cascade)
├── productId (FK → products.id, cascade)
├── quantity
├── createdAt
└── updatedAt

orders (주문)
├── id (PK)
├── userId (FK → users.id)
├── totalAmount
├── status
├── shippingName
├── shippingPhone
├── shippingAddress
├── shippingPostalCode
├── trackingNumber
├── stripePaymentIntentId
├── createdAt
└── updatedAt

order_items (주문 상품)
├── id (PK)
├── orderId (FK → orders.id, cascade)
├── productId (FK → products.id)
├── productName
├── productPrice
├── quantity
└── createdAt

sessions (세션)
├── sid (PK)
├── sess (jsonb)
└── expire
```

### 주요 관계

- **User → Cart Items**: 1:N (cascade delete)
- **User → Orders**: 1:N
- **Category → Products**: 1:N
- **Product → Cart Items**: 1:N (cascade delete)
- **Product → Order Items**: 1:N
- **Order → Order Items**: 1:N (cascade delete)

### 주문 상태

```typescript
type OrderStatus = 
  | "pending_payment"    // 결제 대기
  | "payment_confirmed"  // 결제 완료
  | "preparing"          // 상품 준비 중
  | "shipped"            // 배송 중
  | "delivered"          // 배송 완료
  | "cancelled";         // 취소됨
```

**결제 시스템**: 이 프로젝트는 현재 자동 결제 시스템을 사용하지 않습니다. 주문 흐름은 다음과 같습니다:

1. 사용자가 주문 생성 (`POST /api/orders`)
2. 주문 상태는 자동으로 `pending_payment`로 설정됨
3. 관리자가 수동으로 결제 확인 후 상태를 `payment_confirmed`로 변경
4. 이후 `preparing` → `shipped` → `delivered` 순서로 진행
5. 필요 시 관리자가 운송장 번호 입력

향후 Stripe 등의 자동 결제 시스템을 통합하려면:
- `stripePaymentIntentId` 필드 활용
- 새로운 결제 엔드포인트 추가 (`POST /api/payments/create-intent`)
- 주문 생성 시 자동으로 `payment_confirmed` 설정

---

## API 엔드포인트

### 인증 API

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/auth/signup` | 없음 | 회원가입 |
| POST | `/api/auth/login` | 없음 | 로그인 |
| POST | `/api/auth/logout` | 없음 | 로그아웃 |
| GET | `/api/auth/user` | 필요 | 현재 사용자 정보 |

### 공개 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/products` | 상품 목록 (검색, 카테고리 필터) |
| GET | `/api/products/:id` | 상품 상세 |
| GET | `/api/categories` | 카테고리 목록 |

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

### 관리자 API (인증 + 관리자 권한 필요)

#### 상품 관리
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/products` | 모든 상품 조회 |
| POST | `/api/admin/products` | 상품 생성 |
| PATCH | `/api/admin/products/:id` | 상품 수정 |
| DELETE | `/api/admin/products/:id` | 상품 삭제 |

#### 주문 관리
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/orders` | 모든 주문 조회 |
| PATCH | `/api/admin/orders/:id` | 주문 상태/운송장 업데이트 |

#### 카테고리 관리
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/admin/categories` | 카테고리 생성 |
| PATCH | `/api/admin/categories/:id` | 카테고리 수정 |
| DELETE | `/api/admin/categories/:id` | 카테고리 삭제 |

---

## Storage 인터페이스

### 개요
`IStorage` 인터페이스는 모든 데이터베이스 작업을 추상화합니다. 이를 통해:
- 비즈니스 로직과 데이터베이스 로직 분리
- 테스트 용이성 향상
- 향후 다른 데이터베이스로 전환 가능

### 사용자 작업

```typescript
interface IStorage {
  // 사용자 조회 (ID)
  getUser(id: string): Promise<User | undefined>;
  
  // 사용자 조회 (이메일)
  getUserByEmail(email: string): Promise<User | undefined>;
  
  // 사용자 생성
  createUser(user: Omit<UpsertUser, 'id'>): Promise<User>;
  
  // 사용자 생성 또는 업데이트
  upsertUser(user: UpsertUser): Promise<User>;
}
```

### 상품 작업

```typescript
interface IStorage {
  // 상품 목록 (검색, 필터)
  getProducts(filters?: {
    search?: string;
    categoryId?: string;
  }): Promise<Product[]>;
  
  // 상품 조회
  getProduct(id: string): Promise<Product | undefined>;
  
  // 상품 생성
  createProduct(product: InsertProduct): Promise<Product>;
  
  // 상품 수정
  updateProduct(
    id: string, 
    product: Partial<InsertProduct>
  ): Promise<Product | undefined>;
  
  // 상품 삭제
  deleteProduct(id: string): Promise<void>;
}
```

### 카테고리 작업

```typescript
interface IStorage {
  getCategories(): Promise<Category[]>;
  getCategory(id: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(
    id: string, 
    category: Partial<InsertCategory>
  ): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<void>;
}
```

### 장바구니 작업

```typescript
interface IStorage {
  // 장바구니 조회 (상품 정보 포함)
  getCartItems(userId: string): Promise<(CartItem & { product: Product })[]>;
  
  // 장바구니 추가 (기존 아이템이 있으면 수량 증가)
  addCartItem(item: InsertCartItem): Promise<CartItem>;
  
  // 장바구니 수량 변경
  updateCartItem(id: string, quantity: number): Promise<CartItem | undefined>;
  
  // 장바구니 아이템 삭제
  deleteCartItem(id: string): Promise<void>;
  
  // 장바구니 전체 삭제
  clearCart(userId: string): Promise<void>;
}
```

### 주문 작업

```typescript
interface IStorage {
  // 주문 생성 (주문 아이템 포함)
  // 반환: 생성된 주문 ID (string)
  // 주의: 주문 상세 정보가 필요하면 getOrder()를 별도로 호출
  createOrder(
    order: InsertOrder, 
    items: Omit<InsertOrderItem, 'orderId'>[]
  ): Promise<string>; // 주문 ID만 반환
  
  // 내 주문 목록 (주문 기본 정보만, orderItems 미포함)
  getOrders(userId: string): Promise<Order[]>;
  
  // 주문 상세 (주문 아이템 + 상품 정보 포함)
  getOrder(
    orderId: string
  ): Promise<(Order & { orderItems: (OrderItem & { product: Product })[] }) | undefined>;
  
  // 모든 주문 조회 (관리자용, 주문 기본 정보만)
  getAllOrders(): Promise<Order[]>;
  
  // 주문 상태 업데이트
  // trackingNumber는 선택사항 (배송 시작 시에만 설정)
  updateOrderStatus(
    orderId: string,
    status: string,
    trackingNumber?: string
  ): Promise<Order | undefined>;
}
```

---

## 새로운 기능 추가하기

### 1. 새로운 테이블 추가

#### Step 1: schema.ts에 테이블 정의

```typescript
// shared/schema.ts
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations 정의
export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
}));

// 타입 및 검증 스키마
export type Review = typeof reviews.$inferSelect;
export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
});
export type InsertReview = z.infer<typeof insertReviewSchema>;
```

#### Step 2: 데이터베이스 푸시

```bash
npm run db:push
```

#### Step 3: Storage 인터페이스 업데이트

```typescript
// server/storage.ts
export interface IStorage {
  // ... 기존 메서드들
  
  // Review operations
  createReview(review: InsertReview): Promise<Review>;
  getProductReviews(productId: string): Promise<(Review & { user: User })[]>;
  deleteReview(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ... 기존 메서드들
  
  async createReview(reviewData: InsertReview): Promise<Review> {
    const [review] = await db.insert(reviews).values(reviewData).returning();
    return review;
  }
  
  async getProductReviews(productId: string): Promise<(Review & { user: User })[]> {
    const reviewList = await db
      .select()
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt));
    
    return reviewList.map((item) => ({
      ...item.reviews,
      user: item.users,
    }));
  }
  
  async deleteReview(id: string): Promise<void> {
    await db.delete(reviews).where(eq(reviews.id, id));
  }
}
```

#### Step 4: API 엔드포인트 추가

```typescript
// server/routes.ts
import { insertReviewSchema } from "@shared/schema";

// 리뷰 생성 (로그인 필요)
app.post("/api/reviews", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const validatedData = insertReviewSchema.parse({
      ...req.body,
      userId,
    });
    
    const review = await storage.createReview(validatedData);
    res.json(review);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// 상품 리뷰 조회 (공개)
app.get("/api/products/:id/reviews", async (req, res) => {
  try {
    const reviews = await storage.getProductReviews(req.params.id);
    res.json(reviews);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// 리뷰 삭제 (본인 또는 관리자만)
app.delete("/api/reviews/:id", isAuthenticated, async (req, res) => {
  try {
    // TODO: 본인 또는 관리자 확인 로직 추가
    await storage.deleteReview(req.params.id);
    res.json({ message: "Review deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

### 2. 새로운 인증 방식 추가 (예: OAuth)

현재 시스템은 이메일/비밀번호 인증만 지원합니다. 소셜 로그인을 추가하려면:

1. **Passport.js 전략 추가**
   ```bash
   npm install passport-google-oauth20
   ```

2. **auth.ts에 OAuth 설정 추가**
3. **routes.ts에 OAuth 라우트 추가**
4. **users 테이블에 `oauthProvider`, `oauthId` 컬럼 추가**

---

## 환경 변수

### 필수 환경 변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | 세션 암호화 키 | 랜덤 문자열 (32자 이상 권장) |
| `NODE_ENV` | 실행 환경 | `development` 또는 `production` |
| `PORT` | 서버 포트 | `5000` (기본값) |

### 선택 환경 변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `VITE_*` | 프론트엔드에 노출되는 환경 변수 | - |

**참고**: 이 프로젝트는 현재 **Stripe을 사용하지 않습니다**. `stripePaymentIntentId` 필드는 향후 확장을 위해 예약된 필드입니다. 현재는 수동 결제 시스템을 사용하며, 관리자가 주문 상태를 수동으로 관리합니다.

### 환경 변수 설정

#### 개발 환경
Replit은 자동으로 `DATABASE_URL`, `SESSION_SECRET`, `PORT`를 설정합니다.

#### 프로덕션 환경
1. Replit Secrets 탭에서 환경 변수 설정
2. 또는 `.env` 파일 사용 (비공개 리포지토리만)

```bash
# .env (Git에 커밋하지 마세요!)
DATABASE_URL=postgresql://...
SESSION_SECRET=very-secret-key-here
NODE_ENV=production
```

---

## 데이터베이스 마이그레이션

### Drizzle Kit 사용

이 프로젝트는 **Drizzle Push**를 사용합니다. 마이그레이션 파일을 생성하지 않고 스키마를 직접 푸시합니다.

#### 스키마 변경 후 데이터베이스 업데이트

```bash
npm run db:push
```

#### 강제 푸시 (데이터 손실 경고 무시)

```bash
npm run db:push -- --force
```

⚠️ **주의**: 프로덕션 데이터베이스에서는 신중하게 사용하세요!

### 스키마 변경 시 주의사항

1. **컬럼 추가 (nullable)**
   ```typescript
   // 안전: nullable 컬럼 추가
   newColumn: varchar("new_column")
   ```

2. **컬럼 추가 (not null with default)**
   ```typescript
   // 안전: 기본값이 있는 not null 컬럼
   newColumn: varchar("new_column").default("default").notNull()
   ```

3. **컬럼 추가 (not null without default)**
   ```typescript
   // 위험: 기존 데이터가 있으면 실패
   newColumn: varchar("new_column").notNull()
   ```
   해결책: 기존 데이터 삭제 또는 기본값 설정

4. **컬럼 이름 변경**
   ```typescript
   // Drizzle은 이름 변경을 "삭제 + 추가"로 인식
   // 데이터 손실 발생!
   ```
   해결책: 
   - 새 컬럼 추가
   - 데이터 복사
   - 기존 컬럼 삭제

5. **컬럼 타입 변경**
   ```typescript
   // 위험: 데이터 손실 가능
   // varchar → integer 등
   ```
   해결책: 
   - 백업 생성
   - 변환 스크립트 작성
   - 점진적 마이그레이션

---

## 문제 해결

### 1. 데이터베이스 연결 실패

**증상**: `Error: connection refused` 또는 `ECONNREFUSED`

**원인**:
- `DATABASE_URL` 환경 변수가 설정되지 않음
- 데이터베이스가 실행되지 않음

**해결**:
1. Replit Database 탭에서 PostgreSQL 데이터베이스 생성
2. `DATABASE_URL` 환경 변수 확인
3. 서버 재시작

### 2. 세션이 유지되지 않음

**증상**: 로그인 후 즉시 로그아웃됨

**원인**:
- 쿠키 설정 문제
- `SESSION_SECRET` 없음
- `sessions` 테이블 없음

**해결**:
```sql
-- sessions 테이블 확인
SELECT * FROM sessions LIMIT 1;

-- 없으면 생성 (보통 connect-pg-simple이 자동 생성)
```

### 3. 401 Unauthorized 오류

**증상**: 로그인했는데도 401 오류 발생

**원인**:
- 세션 쿠키가 전송되지 않음
- CORS 설정 문제

**해결**:
- 프론트엔드에서 `credentials: 'include'` 설정 확인
- 백엔드 CORS 설정 확인

### 4. Zod 검증 오류

**증상**: `ZodError: validation failed`

**원인**:
- 클라이언트가 잘못된 데이터 전송
- 스키마가 요구사항과 불일치

**해결**:
1. 에러 메시지에서 어떤 필드가 문제인지 확인
2. `signupSchema`, `loginSchema` 등 스키마 확인
3. 프론트엔드 폼 검증 추가

### 5. bcrypt 해싱 에러

**증상**: `Error: data and hash arguments required`

**원인**:
- `passwordHash`가 없는 사용자 레코드

**해결**:
```sql
-- passwordHash가 null인 사용자 확인
SELECT * FROM users WHERE password_hash IS NULL;

-- 해당 사용자 삭제 또는 비밀번호 재설정
```

### 6. 관리자 권한 부여

**증상**: 관리자 페이지 접근 불가

**해결**:
```sql
-- 특정 사용자를 관리자로 설정
UPDATE users 
SET is_admin = true 
WHERE email = 'your-email@example.com';
```

### 7. TypeScript 타입 오류

**증상**: `Property does not exist on type 'Request'`

**원인**:
- Express 타입 확장이 적용되지 않음

**해결**:
- `server/auth.ts`에서 타입 확장이 있는지 확인
- VSCode를 재시작

---

## 추가 리소스

- [Express.js 문서](https://expressjs.com/)
- [Drizzle ORM 문서](https://orm.drizzle.team/)
- [Zod 문서](https://zod.dev/)
- [bcryptjs 문서](https://github.com/dcodeIO/bcrypt.js)
- [PostgreSQL 문서](https://www.postgresql.org/docs/)

---

## 라이선스

MIT License
