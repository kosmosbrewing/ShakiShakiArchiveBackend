# ShoppingMallBuilder - API 백엔드 서버 설정

이 문서는 ShoppingMallBuilder를 분리된 Vue 프론트엔드와 함께 사용하기 위한 API 전용 백엔드 설정 가이드입니다.

## 개요

- **ShoppingMallBuilder**: API 전용 백엔드 서버 (포트 5000)
- **Vue 프론트엔드**: 분리된 별도 프로젝트 (포트 3000 또는 다른 포트)

이 두 서버는 CORS를 통해 통신합니다.

---

## 1. 환경 변수 설정

### Replit에서 설정

Replit 대시보드에서 다음 환경 변수를 설정합니다:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/shophub_dev
SESSION_SECRET=dev-secret-key-change-in-production
NODE_ENV=development
PORT=5000
```

**중요:**
- `DATABASE_URL`의 `password` 부분을 실제 PostgreSQL 비밀번호로 변경
- `SESSION_SECRET`을 안전한 랜덤 문자열로 변경 (최소 32자 권장)
- 프로덕션에서는 `NODE_ENV=production` 설정

### 로컬 개발 환경에서 설정

로컬에서 개발하는 경우, 프로젝트 루트에 `.env` 파일을 생성합니다:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/shophub_dev
SESSION_SECRET=your-super-secret-key-change-this
NODE_ENV=development
PORT=5000
```

---

## 2. 데이터베이스 설정

### 로컬 PostgreSQL 설정

```bash
# 1. PostgreSQL에 접속
psql -U postgres

# 2. 데이터베이스 생성
CREATE DATABASE shophub_dev;

# 3. 종료
\q
```

### 데이터베이스 스키마 적용

```bash
npm run db:push
```

또는:

```bash
npm run db:push --force
```

---

## 3. 백엔드 서버 시작

### 개발 모드

```bash
npm run dev
```

이 명령으로 포트 5000에서 API 서버가 시작됩니다:
```
5:22:00 AM [express] 🚀 API Server serving on port 5000
5:22:00 AM [express] Environment: development
```

### 프로덕션 빌드

```bash
# 1. 빌드
npm run build

# 2. 프로덕션 환경에서 실행
NODE_ENV=production node dist/index.js
```

---

## 4. API 엔드포인트

모든 API는 `/api/` 경로로 시작합니다.

### 인증
- `POST /api/auth/signup` - 회원가입
- `POST /api/auth/login` - 로그인
- `POST /api/auth/logout` - 로그아웃
- `GET /api/auth/user` - 현재 사용자 정보

### 상품
- `GET /api/products` - 상품 목록
- `GET /api/products/:id` - 상품 상세
- `POST /api/products` - 상품 생성 (관리자)
- `PATCH /api/products/:id` - 상품 수정 (관리자)
- `DELETE /api/products/:id` - 상품 삭제 (관리자)

### 카테고리
- `GET /api/categories` - 카테고리 목록
- `POST /api/categories` - 카테고리 생성 (관리자)
- `PATCH /api/categories/:id` - 카테고리 수정 (관리자)
- `DELETE /api/categories/:id` - 카테고리 삭제 (관리자)

### 장바구니
- `GET /api/cart` - 장바구니 조회
- `POST /api/cart` - 장바구니 추가
- `PATCH /api/cart/:id` - 장바구니 수정
- `DELETE /api/cart/:id` - 장바구니 삭제

### 주문
- `GET /api/orders` - 주문 목록
- `GET /api/orders/:id` - 주문 상세
- `POST /api/orders` - 주문 생성

---

## 5. CORS 설정

백엔드는 모든 출처에서의 요청을 받도록 설정되어 있습니다:

```typescript
// server/index.ts
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});
```

---

## 6. Vue 프론트엔드 연동

Vue 프론트엔드에서 백엔드에 요청하는 예:

```typescript
// client/src/lib/api.ts
const API_BASE = 'http://localhost:5000'; // 백엔드 서버 주소

// 또는 환경 변수로 설정
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// API 호출 예
const response = await fetch(`${API_BASE}/api/products`, {
  method: 'GET',
  credentials: 'include', // 쿠키 포함 필수!
  headers: {
    'Content-Type': 'application/json',
  }
});
```

**중요:** `credentials: 'include'` 옵션을 반드시 추가해야 세션 쿠키가 전송됩니다.

---

## 7. 초기 데이터 설정

### 관리자 계정 생성

```bash
npx tsx server/scripts/create-admin.ts
```

기본 관리자 계정:
- 이메일: `admin@shophub.com`
- 비밀번호: `admin123!`

### 샘플 데이터 생성

```bash
npx tsx server/scripts/seed-data.ts
```

---

## 8. 포트 변경

기본 포트 5000을 변경하려면:

```bash
PORT=3001 npm run dev
```

또는 `.env` 파일에서:

```env
PORT=3001
```

---

## 9. 문제 해결

### "database does not exist" 오류

```bash
psql -U postgres -c "CREATE DATABASE shophub_dev"
npm run db:push
```

### "Cannot connect to server" 오류

PostgreSQL 서비스가 실행 중인지 확인:

```bash
# macOS/Linux
sudo systemctl status postgresql

# Windows
sc query postgresql-x64-14
```

### CORS 오류 (분리된 프론트엔드에서)

프론트엔드의 API URL 설정을 확인하세요. 예:

```typescript
// Vue 프로젝트의 .env
VITE_API_URL=http://localhost:5000
```

---

## 10. 배포

### Replit에 배포

1. Replit 대시보드에서 환경 변수 설정
2. 다음 명령 실행:

```bash
npm run build
npm run start
```

### 외부 서버에 배포

1. 빌드:
   ```bash
   npm run build
   ```

2. `dist/` 폴더를 서버에 업로드

3. 환경 변수 설정

4. 실행:
   ```bash
   NODE_ENV=production node dist/index.js
   ```

---

## 11. 보안 체크리스트

- [ ] `DATABASE_URL`에 실제 비밀번호 설정
- [ ] `SESSION_SECRET`을 32자 이상의 랜덤 문자열로 변경
- [ ] 프로덕션에서 `NODE_ENV=production` 설정
- [ ] HTTPS 사용 (프로덕션)
- [ ] CORS 정책 검토 및 필요시 제한

---

## 참고

- [LOCAL_SETUP_GUIDE.md](./LOCAL_SETUP_GUIDE.md) - 로컬 개발 환경 설정
- [replit.md](./replit.md) - 프로젝트 전체 개요
