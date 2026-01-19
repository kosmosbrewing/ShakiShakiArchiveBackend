# DevOps & Operations

> CI/CD, Monitoring, Security, FinOps - 운영 자동화 및 관찰성

---

## 📋 목차

1. [CI/CD Pipeline](#cicd-pipeline)
2. [Monitoring & Observability](#monitoring--observability)
3. [Security & Compliance](#security--compliance)
4. [FinOps (비용 최적화)](#finops-비용-최적화)

---

## CI/CD Pipeline

### GitHub Actions Workflow

**파일 위치**: `.github/workflows/deploy-ecr.yml`

```yaml
name: Deploy to AWS ECS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      # 1. Code Checkout
      - uses: actions/checkout@v3

      # 2. Node.js Setup & Dependency Cache
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
          cache: "npm"

      # 3. TypeScript Type Check
      - run: npm ci
      - run: npm run check

      # 4. Build Production Bundle
      - run: npm run build

      # 5. Docker Build & Push to ECR
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: shakishaki-backend
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG

      # 6. ECS Task Definition Update
      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster shakishaki-cluster \
            --service shakishaki-backend-service \
            --force-new-deployment
```

---

### 배포 전략

**Rolling Update (Zero Downtime)**

1. 새 Task 시작 → Health Check 통과 대기
2. ALB Target Group에 새 Task 추가
3. 기존 Task Draining (30초)
4. 기존 Task 종료

**Health Check 설정**
```typescript
// server/routes/health.ts
router.get("/health", async (req, res) => {
  try {
    // DB 연결 확인
    await db.execute(sql`SELECT 1`);
    res.json({
      status: "ok",
      timestamp: new Date(),
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});
```

**Rollback 전략**
- Health Check 실패 시 자동 롤백
- 수동 롤백: 이전 Task Definition으로 복원

---

### SDLC Stages

```
1. Development
   ├─ Feature Branch 생성
   ├─ 로컬 개발 (npm run dev)
   └─ TypeScript 타입 체크 (npm run check)

2. Code Review
   ├─ Pull Request 생성
   ├─ GitHub Actions CI (타입 체크, 빌드)
   └─ 코드 리뷰 승인

3. CI (Continuous Integration)
   ├─ main 브랜치 병합
   ├─ TypeScript 컴파일
   ├─ Docker 이미지 빌드
   └─ ECR Push

4. Staging (Optional)
   └─ 스테이징 환경 배포 (수동)

5. Production
   ├─ ECS Fargate 배포
   ├─ Rolling Update
   └─ Health Check

6. Monitoring
   ├─ CloudWatch Logs
   ├─ CloudWatch Metrics
   └─ Slack 알림
```

---

### 개발 생산성 향상

| 항목 | 개선 전 | 개선 후 | 효과 |
|------|---------|---------|------|
| 수동 빌드 | 매번 로컬 빌드 | GitHub Actions 자동 | 시간 절약 |
| 수동 배포 | SSH → Docker 명령어 (20분) | GitHub Push → 자동 배포 (5분) | **75%** |
| 타입 체크 | 수동 실행 | PR 시 자동 체크 | 버그 조기 발견 |

---

## Monitoring & Observability

### Logging Architecture

**Winston Logger 구성**
```typescript
// server/utils/logger.ts
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json() // 구조화된 로그
  ),
  transports: [
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

export default logger;
```

---

### 로그 레벨 전략

| Level | 용도 | 예시 |
|-------|------|------|
| **ERROR** | 즉시 대응 필요 | PG사 API 에러, DB 연결 실패 |
| **WARN** | 모니터링 필요 | Rate Limit 근접, 재고 부족 |
| **INFO** | 정상 동작 기록 | 주문 생성, 결제 승인 |
| **DEBUG** | 개발 환경만 | 쿼리 로그, 미들웨어 체인 |

**로그 예시**
```json
{
  "level": "info",
  "message": "Order created",
  "timestamp": "2026-01-19T14:30:52.123Z",
  "userId": "uuid-1234",
  "orderId": "12345",
  "amount": 50000
}
```

---

### CloudWatch Metrics

**핵심 지표**

#### 1. Application Metrics
- API Response Time (p50, p95, p99)
- Error Rate (4xx, 5xx)
- Request Count (per endpoint)

#### 2. Infrastructure Metrics
- ECS CPU/Memory Utilization
- RDS CPU/Memory Utilization
- RDS Connection Count

#### 3. Business Metrics
- 주문 생성률 (시간당)
- 결제 성공률
- 재고 부족 발생 빈도

---

### 알람 설정

```yaml
Alarms:
  # 높은 에러율
  - MetricName: 5xxError
    Threshold: 10 (per 5min)
    Action: SNS → Slack

  # DB 연결 고갈
  - MetricName: RDS_DatabaseConnections
    Threshold: 18 (out of 20)
    Action: Auto-scaling trigger

  # 높은 CPU 사용률
  - MetricName: ECS_CPUUtilization
    Threshold: 80%
    Action: Auto-scaling trigger
```

---

### 장애 대응 프로세스

**On-Call 대응**
1. **Slack 알림 수신** (CloudWatch → SNS → Slack)
2. **CloudWatch Logs 확인** (에러 로그, 쿼리 로그)
3. **RDS Metrics 확인** (CPU, Connection, Slow Query)
4. **ECS Task 로그 확인** (컨테이너별 로그)
5. **원인 파악 및 조치**
   - 코드 버그 → 핫픽스 배포
   - 인프라 문제 → Auto-scaling 조정
   - 외부 서비스 장애 → Circuit Breaker 적용

**사전 장애 방지**
- ✅ Rate Limiting: API 남용 방지
- ✅ Connection Pool: DB 연결 고갈 방지
- ✅ Health Check: 비정상 Task 자동 교체
- ✅ Auto-scaling: 트래픽 급증 대응

---

### 실제 장애 대응 사례

**사례**: DB Connection 고갈 (20/20)

**원인**
- N+1 쿼리로 인한 Connection 점유 시간 증가
- 주문 목록 API: 10건 조회 시 21번 쿼리 → 300ms

**조치**
1. CloudWatch RDS Metrics 확인: `DatabaseConnections = 20`
2. Slow Query Log 분석: N+1 쿼리 발견
3. JOIN으로 쿼리 최적화: 21회 → 1회
4. 배포 후 Connection 사용 시간 70% 감소

**예방**
- CloudWatch 알람 설정: 18/20 연결 시 알림
- Connection Pool 증설: 20 → 30

---

## Security & Compliance

### Zero Trust Architecture

**현재 구현**

#### 1. Network Level
- **Security Group**: ALB → ECS (8080만 허용)
- **Private Subnet**: RDS는 외부 접근 차단

#### 2. Application Level
- **Session Validation**: 모든 요청 검증
- **Rate Limiting**: IP/userId 기반 제한
- **Input Validation**: Zod 스키마 검증

#### 3. Data Level
- **bcrypt**: 비밀번호 해싱 (saltRounds: 10)
- **Secure Cookie**: httpOnly, secure (HTTPS)

---

### OWASP Top 10 대응

| OWASP | 위협 | 대응 |
|-------|------|------|
| A01 | Broken Access Control | isAuthenticated, isAdmin |
| A02 | Cryptographic Failures | bcrypt, HTTPS |
| A03 | Injection | Drizzle Parameterized Query, Zod |
| A04 | Insecure Design | Session-based Auth |
| A05 | Security Misconfiguration | Helmet, CORS |
| A06 | Vulnerable Components | Dependabot |
| A07 | Authentication Failures | bcrypt, Rate Limiting |
| A08 | Data Integrity Failures | PostgreSQL ACID |
| A09 | Security Logging | Winston → CloudWatch |
| A10 | SSRF | HTTP Client Validation |

---

### PCI-DSS 관련

- ✅ **카드 정보 미저장**: PG사에 위임
- ✅ **HTTPS 통신**: CloudFront SSL
- ✅ **접근 로그**: CloudWatch Logs
- ✅ **암호화**: bcrypt 비밀번호 해싱

---

### 향후 개선 계획

- [ ] **mTLS**: 서비스 간 인증서 기반 통신
- [ ] **AWS WAF**: SQL Injection, XSS 탐지
- [ ] **Secrets Manager**: 환경 변수 암호화
- [ ] **Sentry**: 에러 추적 및 알림

---

## FinOps (비용 최적화)

### 비용 구조 분석 (월 기준)

**현재 비용**

```
AWS 서비스:
├─ ECS Fargate: $50 (평균 2 Tasks)
├─ RDS db.t3.medium: $60 (Multi-AZ)
├─ ALB: $20
├─ CloudWatch Logs: $10
└─ ECR: $5
───────────────────────
총: $145/월

External Services:
├─ Cloudinary: $0 (무료 플랜)
├─ Resend: $0 (무료 플랜)
└─ Neon PostgreSQL: $0 (개발 환경)
```

---

### 비용 최적화 전략

#### 1. RDS Instance 최적화
- **현재**: db.t3.medium (2 vCPU, 4GB RAM)
- **개선**: Reserved Instance (1년 예약) → 40% 할인
- **절감**: $60 → $36/월 (**$24 절감**)

#### 2. ECS Auto-scaling 조정
- **현재**: Min 1, Max 10
- **개선**: 트래픽 패턴 분석 후 조정
  - 야간 (00:00-06:00): Min 1
  - 주간 (06:00-24:00): Min 2
- **절감**: 평균 Task 수 2.5 → 1.8 (**$10 절감**)

#### 3. CloudWatch Logs Retention
- **현재**: 무제한 보관
- **개선**: 30일 보관 후 S3로 이동
- **절감**: $10 → $5/월 (**$5 절감**)

**총 절감 예상**: **$39/월 (27% 절감)**

---

### 비용 모니터링

**AWS Cost Explorer**
- 일별/월별 비용 추이
- 서비스별 비용 분석
- 예산 알림 설정 ($200/월)

**Tagging 전략**
```yaml
Tags:
  Environment: production
  Service: backend
  CostCenter: engineering
  Owner: devops-team
```

---

## Related Documents

- [Architecture](./ARCHITECTURE.md) - 시스템 아키텍처
- [Technical Challenges](./TECHNICAL-CHALLENGES.md) - 문제 해결 사례
- [Main README](../README.md) - 프로젝트 개요
