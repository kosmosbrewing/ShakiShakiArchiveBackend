# System Architecture

> ShakiShaki Archive Backend의 인프라 아키텍처와 기술 스택 선택 근거

---

## 📋 목차

1. [Infrastructure Overview](#infrastructure-overview)
2. [Request Flow](#request-flow)
3. [Tech Stack & Rationale](#tech-stack--rationale)
4. [Performance Metrics](#performance-metrics)

---

## Infrastructure Overview

### 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
│  Web Browser / Mobile App → HTTPS Request                   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   CloudFront CDN (AWS)                       │
│  - Static Asset Cache (Images, CSS, JS)                     │
│  - SSL/TLS Termination                                       │
│  - DDoS Protection                                           │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Application Load Balancer (ALB)                 │
│  - Health Check (15s interval, /api/health)                 │
│  - Target Group Routing                                      │
│  - Sticky Session (Session Affinity)                        │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    ECS Fargate Cluster                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Task Definition (Node.js 20 Container)             │    │
│  │  ├─ Express.js Server (Port 8080)                   │    │
│  │  ├─ Winston Logging → CloudWatch Logs               │    │
│  │  ├─ Health Check Endpoint                           │    │
│  │  └─ Environment Variables (.env)                    │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  Auto-scaling                                        │    │
│  │  ├─ Min: 1, Max: 10                                 │    │
│  │  ├─ CPU Target: 70%                                 │    │
│  │  └─ Memory Target: 80%                              │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              RDS PostgreSQL (Multi-AZ)                       │
│  - Instance: db.t3.medium                                    │
│  - Storage: 100GB SSD (Auto-scaling)                        │
│  - Backup: Daily 7-day retention                            │
│  - Connection Pool: 20 per container                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│  ├─ Cloudinary (Image CDN & Transformation)                 │
│  ├─ Toss Payments (결제 승인/취소)                           │
│  ├─ NaverPay (네이버페이 결제)                               │
│  ├─ Resend (Transactional Email)                            │
│  └─ Naver/Kakao OAuth (소셜 로그인)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Request Flow

### 1. Client Request
```
Client → CloudFront
├─ Static Cache Hit → Return
└─ Cache Miss → Forward to ALB
```

### 2. Load Balancer
```
ALB
├─ Health Check: ECS Task 상태 확인
├─ Target Group: 정상 Task로 라우팅
└─ Sticky Session: 세션 유지 (Cookie 기반)
```

### 3. Application Layer
```
ECS Fargate Container
├─ Express Middleware Chain
│  ├─ CORS Validation (허용된 Origin)
│  ├─ Rate Limiting (IP/userId 기반)
│  ├─ Helmet (보안 헤더)
│  ├─ Session Validation (PostgreSQL 세션 스토어)
│  └─ Auth Middleware (isAuthenticated, isAdmin)
│
├─ Route Handler
│  ├─ Zod Validation (입력 검증)
│  ├─ Service Layer (비즈니스 로직)
│  └─ Storage Layer (DB 접근)
│
└─ PostgreSQL Transaction
   ├─ BEGIN
   ├─ SELECT FOR UPDATE (Lock)
   ├─ UPDATE/INSERT/DELETE
   └─ COMMIT / ROLLBACK
```

### 4. Response
```
Response Path
├─ JSON Response → Client
├─ Winston Logging → CloudWatch
└─ Error Handling → JSON Error Response
```

---

## Tech Stack & Rationale

### Backend Framework

#### Express.js

**비교 분석**

| 항목 | Express.js | NestJS | Fastify |
|------|------------|--------|---------|
| 학습 곡선 | ✅ 낮음 | △ 높음 | ✅ 낮음 |
| 생태계 | ✅ 방대 | △ 제한적 | △ 제한적 |
| 성능 | ✅ 충분 | ✅ 충분 | ✅ 빠름 |
| 복잡도 | ✅ 단순 | ❌ 복잡 (DI) | ✅ 단순 |

**선택 이유**
- MVP 출시 속도 우선
- 방대한 생태계 (passport, helmet, rate-limit)
- 단순한 아키텍처로 유지보수 용이

---

### Database & ORM

#### PostgreSQL + Drizzle ORM

**PostgreSQL 선택 이유**

| 항목 | PostgreSQL | MongoDB | DynamoDB |
|------|------------|---------|----------|
| ACID 보장 | ✅ 완벽 | △ 제한적 | ❌ 없음 |
| 트랜잭션 | ✅ 간단 | △ 복잡 | ❌ 제한적 |
| JSON 지원 | ✅ jsonb 타입 | ✅ 네이티브 | ✅ Map 타입 |
| 복잡한 쿼리 | ✅ JOIN, Aggregation | △ Lookup | ❌ 불가 |
| 비용 예측 | ✅ 쉬움 | ✅ 쉬움 | ❌ 어려움 |

**의사결정 근거**
- 결제/주문 데이터 정합성 필수 → ACID 보장
- 복잡한 쿼리 필요 (주문 내역, 재고 집계)
- JSON 지원으로 유연한 스키마 (상품 옵션, 결제 메타데이터)

**Drizzle ORM 선택 이유**
- ✅ Type-safe (TypeScript 100% 활용)
- ✅ 가벼운 런타임 (Prisma 대비 빠름)
- ✅ SQL-like 문법 (학습 용이)

**대안 검토**
- ❌ **Prisma**: 마이그레이션 느림, 런타임 오버헤드
- ❌ **TypeORM**: 복잡한 설정, 메타데이터 과다

---

### Deployment

#### AWS ECS Fargate + ECR

**비교 분석**

| 항목 | ECS Fargate | Lambda | EC2 | Kubernetes |
|------|-------------|--------|-----|------------|
| 서버 관리 | ✅ 불필요 | ✅ 불필요 | ❌ 필요 | ❌ 복잡 |
| Auto-scaling | ✅ CPU/Memory | ✅ 자동 | △ 수동 설정 | ✅ HPA |
| Cold Start | ✅ 없음 | ❌ 있음 | ✅ 없음 | ✅ 없음 |
| 비용 | ✅ 사용량 기반 | ✅ 사용량 기반 | △ 고정 비용 | ❌ 운영 비용 높음 |
| 복잡도 | ✅ 낮음 | ✅ 낮음 | △ 중간 | ❌ 높음 |

**최종 선택: ECS Fargate**

**선택 이유**
- 서버리스 컨테이너로 EC2 관리 부담 제거
- Lambda Cold Start 없음 (결제 API에 적합)
- Kubernetes 오버엔지니어링 방지
- Auto-scaling으로 트래픽 변동 대응

**거부 이유**
- ❌ **Lambda**: Cold Start, 실행 시간 제한 (결제 API 부적합)
- ❌ **EC2**: 인스턴스 관리 부담, 패치/보안 책임
- ❌ **Kubernetes**: 스타트업에 과도한 복잡도, 운영 비용 높음

---

### Authentication

#### Session-based (express-session + connect-pg-simple)

**선택 이유**
- ✅ 서버 제어 가능 (즉시 로그아웃, 세션 무효화)
- ✅ CSRF 방지 용이 (SameSite Cookie)
- ✅ 세션 저장소 = PostgreSQL (별도 Redis 불필요)

**대안 검토**
- ❌ **JWT**: Refresh Token 관리 복잡, Stateless 불필요
- ❌ **OAuth Only**: 이메일 로그인 필요

---

### Payment Gateway

#### 멀티 PG (Toss Payments + NaverPay)

**Toss Payments**
- ✅ 카드/계좌이체 수수료 최저
- ✅ 개발자 친화적 API (REST, Webhook)

**NaverPay**
- ✅ 네이버 회원 유입 효과
- ✅ 간편결제 선호도 높음

**확장성**
- Service Layer 분리 (`toss.service.ts`, `naverpay.service.ts`)
- 추상화로 PG사 추가 용이 (KakaoPay, PayPal 등)

**구현 방식**
- PG SDK 직접 사용 ❌
- Axios HTTP Client 사용 ✅
- 이유: 유연성, 모든 PG사 통일 가능

---

### Logging

#### Winston + CloudWatch

**Winston 선택 이유**
- ✅ 다중 Transport (File, Console, CloudWatch)
- ✅ 로그 레벨 제어 (DEBUG, INFO, WARN, ERROR)
- ✅ JSON 구조화 로그 (파싱 용이)

**CloudWatch 연동**
- ✅ 중앙 집중식 로그 관리
- ✅ 실시간 검색 및 필터링
- ✅ 알람 설정 가능

---

### Image Storage

#### Cloudinary

**선택 이유**
- ✅ CDN 자동 최적화 (WebP, AVIF 변환)
- ✅ 변환 API (리사이징, 크롭, 워터마크)
- ✅ 무료 플랜 관대 (25GB 저장, 25GB 대역폭)

**대안 검토**
- ❌ **S3 + CloudFront**: 초기 설정 복잡, 변환 로직 직접 구현

---

## Performance Metrics

### API Response Time (p95, 7일 평균)

| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| `GET /api/products` | 80ms | 120ms | 180ms |
| `POST /api/orders` | 200ms | 250ms | 350ms |
| `POST /api/payments/confirm` | 350ms | 450ms | 600ms |
| `GET /api/orders` | **60ms** | **90ms** | **150ms** |

**개선 전후 비교 (N+1 쿼리 해결)**
- `GET /api/orders`: 300ms → 90ms (**70% 개선**)

---

### Scalability

**Auto-scaling 설정**
```yaml
ECS Service:
  MinCapacity: 1
  MaxCapacity: 10
  TargetCPU: 70%
  TargetMemory: 80%
  ScaleOutCooldown: 60s
  ScaleInCooldown: 300s
```

**부하 테스트 결과 (Artillery)**
```yaml
Scenario: 동시 주문 생성
  Duration: 10분
  RPS: 100
  Results:
    - Success Rate: 99.8%
    - p95 Response Time: 280ms
    - Max Tasks: 5 (Auto-scaled)
```

---

### Database Performance

**Connection Pool 설정**
```typescript
// server/db.ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // per container
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

**RDS Metrics (평균)**
- CPU Utilization: 15% (N+1 해결 후)
- Connection Count: 8/20 (여유)
- Read IOPS: 50
- Write IOPS: 20

---

### Availability & Reliability

**Uptime (CloudWatch 기준)**
- 99.9% (최근 30일)
- Downtime: 43분/월 (대부분 배포 시간)

**Deployment Strategy**
- Rolling Update (Zero Downtime)
- Health Check: 15s interval, 3회 연속 성공
- Rollback: Health Check 실패 시 자동

---

## Core Principles

### 1. Security First (보안 무결점)

> "결제 시스템 보안 사고 = 매출 손실 + 신뢰도 하락"

**OWASP Top 10 대응**
- ✅ SQL Injection: Drizzle ORM Parameterized Query
- ✅ XSS: Helmet.js 보안 헤더, httpOnly Cookie
- ✅ CSRF: SameSite Cookie, OAuth State Token
- ✅ 인증 우회: 다층 방어 (Rate Limiting → Session → Auth)

**입력 검증**
```typescript
// 모든 사용자 입력은 Zod 스키마로 검증
const createOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive().max(10),
  })),
  addressId: z.string().uuid(),
});
```

---

### 2. Stability & Performance

> "주문/결제는 데이터 정합성이 생명"

**트랜잭션 보장**
- PostgreSQL ACID 속성 활용
- `BEGIN` → `SELECT FOR UPDATE` → `COMMIT/ROLLBACK` 패턴

**N+1 쿼리 제거**
- 문제: 주문 목록 10건 조회 시 11번 쿼리 발생
- 해결: LEFT JOIN으로 단일 쿼리 처리
- 성과: API 응답 시간 300ms → 90ms (70% 개선)

---

### 3. MVP Efficiency

> "이론적 설명보다 복사해서 바로 쓸 수 있는 코드"

**모듈화 아키텍처 (3계층)**
```
Routes (API 엔드포인트)
   ↓
Services (비즈니스 로직, 외부 API 연동)
   ↓
Storage (데이터 액세스 레이어, DB 추상화)
```

**Production-Ready**
- ✅ TypeScript 100% 타입 안정성
- ✅ 즉시 배포 가능한 Docker 이미지
- ✅ 명확한 에러 핸들링
- ✅ 구조화된 로깅 (Winston + JSON)

---

## Related Documents

- [Technical Challenges](./TECHNICAL-CHALLENGES.md) - 실제 문제 해결 사례
- [DevOps](./DEVOPS.md) - CI/CD, Monitoring, Security
- [Main README](../README.md) - 프로젝트 개요
