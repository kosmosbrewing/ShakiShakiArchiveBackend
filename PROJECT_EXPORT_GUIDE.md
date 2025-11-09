# ShopHub 프로젝트 다운로드 및 설치 가이드

## 📦 프로젝트 다운로드 방법

### Replit에서 다운로드
1. Replit 에디터에서 왼쪽 파일 탭 열기
2. 파일 목록 상단의 **3점 메뉴 (⋮)** 클릭
3. **"Download as zip"** 선택
4. 프로젝트 전체가 zip 파일로 다운로드됩니다

### Git을 통한 다운로드 (선택사항)
```bash
# Replit 프로젝트를 Git 저장소로 연결했다면
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

---

## 🗂️ 프로젝트 구조

```
shophub/
├── client/                    # 프론트엔드 (Vue 3 + Vite)
│   ├── src/
│   │   ├── pages/            # 페이지 컴포넌트
│   │   │   ├── Home.vue
│   │   │   ├── Login.vue
│   │   │   ├── Signup.vue
│   │   │   ├── ProductDetail.vue
│   │   │   ├── Cart.vue
│   │   │   ├── Checkout.vue
│   │   │   ├── Orders.vue
│   │   │   ├── OrderDetail.vue
│   │   │   ├── Admin.vue
│   │   │   └── NotFound.vue
│   │   ├── stores/           # Pinia 상태 관리
│   │   │   └── auth.ts
│   │   ├── router/           # Vue Router
│   │   │   └── index.ts
│   │   ├── components/       # 재사용 컴포넌트
│   │   ├── lib/             # 유틸리티
│   │   │   └── utils.ts
│   │   ├── App.vue          # 루트 컴포넌트
│   │   ├── main.ts          # Vue 앱 진입점
│   │   └── index.css        # Tailwind CSS
│   └── index.html
│
├── server/                    # 백엔드 (Express)
│   ├── index.ts              # 서버 진입점
│   ├── routes.ts             # API 라우트
│   ├── auth.ts               # 인증 미들웨어
│   ├── storage.ts            # DB 인터페이스
│   ├── db.ts                 # Drizzle 설정
│   └── vite.ts               # Vite 개발 서버
│
├── shared/                    # 공유 타입/스키마
│   └── schema.ts             # Drizzle ORM 스키마
│
├── BACKEND_GUIDE.md          # 백엔드 수정 가이드 ⭐
├── PROJECT_EXPORT_GUIDE.md   # 이 파일
├── design_guidelines.md      # 디자인 가이드
├── replit.md                 # 프로젝트 문서
├── package.json              # 의존성
├── tsconfig.json             # TypeScript 설정
├── tailwind.config.ts        # Tailwind CSS 설정
├── vite.config.ts            # Vite 설정 (Vue plugin)
└── drizzle.config.ts         # Drizzle ORM 설정
```

---

## 🚀 로컬 환경 설치 방법

### 1. 사전 요구사항
- **Node.js 20+** ([다운로드](https://nodejs.org/))
- **PostgreSQL 14+** ([다운로드](https://www.postgresql.org/download/))
- **npm** (Node.js와 함께 설치됨)

### 2. 프로젝트 설정

```bash
# 프로젝트 폴더로 이동
cd shophub

# 의존성 설치
npm install
```

### 3. 환경 변수 설정

`.env` 파일을 프로젝트 루트에 생성:

```bash
# .env 파일 생성
cat > .env << EOF
DATABASE_URL=postgresql://username:password@localhost:5432/shophub
SESSION_SECRET=your-random-secret-key-at-least-32-characters-long
NODE_ENV=development
PORT=5000
EOF
```

**중요**:
- `DATABASE_URL`: PostgreSQL 연결 문자열
- `SESSION_SECRET`: 랜덤한 문자열 (최소 32자 권장)
- `.env` 파일은 Git에 커밋하지 마세요!

### 4. 데이터베이스 설정

```bash
# PostgreSQL 데이터베이스 생성
createdb shophub

# Drizzle로 스키마 푸시
npm run db:push
```

**문제 발생 시**:
```bash
# 강제 푸시 (데이터 손실 주의!)
npm run db:push -- --force
```

### 5. 관리자 계정 생성

```bash
# 1. 먼저 개발 서버 실행
npm run dev

# 2. 브라우저에서 http://localhost:5000/signup 접속
# 3. 계정 생성

# 4. PostgreSQL에 접속하여 관리자 권한 부여
psql shophub

# 5. 관리자 권한 부여 SQL
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

### 6. 개발 서버 실행

```bash
# 개발 모드 (프론트엔드 + 백엔드)
npm run dev

# 브라우저에서 http://localhost:5000 접속
```

### 7. 프로덕션 빌드

```bash
# 빌드
npm run build

# 프로덕션 서버 실행
npm start
```

---

## 🔐 인증 시스템

이 프로젝트는 **이메일/비밀번호 기반 세션 인증**을 사용합니다.

### 주요 특징
- bcrypt로 비밀번호 해싱
- PostgreSQL에 세션 저장
- httpOnly 쿠키로 CSRF 공격 방지
- 세션 유효기간: 1주일

### 로컬 개발 시
1. `/signup`에서 계정 생성
2. 위의 SQL로 관리자 권한 부여
3. `/login`으로 로그인
4. `/admin`에서 관리자 기능 사용

---

## 📊 데이터베이스 스키마

자세한 내용은 `BACKEND_GUIDE.md`를 참조하세요.

**주요 테이블**:
- `users` - 사용자 (이메일, passwordHash, isAdmin)
- `categories` - 카테고리
- `products` - 상품
- `cart_items` - 장바구니
- `orders` - 주문
- `order_items` - 주문 상품
- `sessions` - 세션

---

## 📝 주요 npm 스크립트

```json
{
  "dev": "개발 서버 실행 (프론트엔드 + 백엔드)",
  "build": "프로덕션 빌드",
  "start": "프로덕션 서버 실행",
  "db:push": "DB 스키마 푸시",
  "check": "TypeScript 타입 체크"
}
```

---

## 🌐 배포 옵션

### Replit에서 배포 (가장 쉬움)
1. Replit에서 "Deploy" 버튼 클릭
2. 자동으로 `.replit.app` 도메인 생성
3. PostgreSQL 데이터베이스 자동 관리
4. 환경 변수 자동 설정

### 다른 플랫폼
- **Vercel**: 프론트엔드만 (서버리스 함수 필요)
- **Railway**: 전체 스택 + PostgreSQL 자동 제공 ✅
- **Render**: 전체 스택 + PostgreSQL 자동 제공 ✅
- **Heroku**: 전체 스택 + PostgreSQL (유료)
- **DigitalOcean App Platform**: 전체 스택 + PostgreSQL

**권장**: Railway 또는 Render (무료 티어 제공)

---

## 📚 기술 스택

### 프론트엔드
- **Vue 3** (Composition API)
- **TypeScript**
- **Vite** (빌드 도구)
- **Vue Router** (라우팅)
- **Pinia** (상태 관리)
- **TailwindCSS** (스타일링)
- **Headless UI + Radix Vue** (UI 컴포넌트)
- **vee-validate + Zod** (폼 검증)

### 백엔드
- **Node.js + Express**
- **TypeScript**
- **Drizzle ORM** (데이터베이스)
- **PostgreSQL**
- **bcryptjs** (비밀번호 해싱)
- **express-session** (세션 관리)
- **connect-pg-simple** (PostgreSQL 세션 저장)

### 디자인
- **Noto Sans KR** 폰트
- **녹색 테마** (HSL: 142 76% 36%)
- **반응형 디자인**
- 한국 시장 최적화

---

## 🆘 문제 해결

### 포트 충돌
```bash
# .env 파일에서 포트 변경
PORT=3000
```

### 데이터베이스 연결 실패
```bash
# DATABASE_URL 확인
echo $DATABASE_URL

# PostgreSQL 서비스 시작
# macOS (Homebrew):
brew services start postgresql

# Linux:
sudo service postgresql start

# Windows:
# PostgreSQL을 서비스로 실행
```

### 빌드 오류
```bash
# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install
```

### vite.config.ts 오류
vite.config.ts의 2번째와 8번째 줄을 확인하세요:

```typescript
// 2번째 줄
import vue from "@vitejs/plugin-vue";

// 8번째 줄 (plugins 배열 안)
vue(),
```

React plugin이 아닌 Vue plugin을 사용해야 합니다.

### 세션이 유지되지 않음
```bash
# SESSION_SECRET이 설정되었는지 확인
echo $SESSION_SECRET

# 없으면 .env에 추가
SESSION_SECRET=your-random-secret-key-here
```

---

## 📖 추가 문서

- **백엔드 가이드**: `BACKEND_GUIDE.md`
  - API 엔드포인트 상세 문서
  - 인증 시스템 가이드
  - Storage 인터페이스
  - 새로운 기능 추가 방법
  - 문제 해결

- **프로젝트 개요**: `replit.md`
  - 프로젝트 구조
  - 최근 변경사항
  - 개발 워크플로우

- **디자인 가이드**: `design_guidelines.md`
  - 색상 시스템
  - 타이포그래피
  - 컴포넌트 가이드

---

## 💡 팁

1. **개발 시 hot reload 활용**: Vite가 파일 변경을 자동 감지하여 브라우저를 새로고침합니다.

2. **TypeScript 타입 체크**: `npm run check`로 타입 오류 확인

3. **데이터베이스 변경**: `shared/schema.ts` 수정 후 `npm run db:push`

4. **관리자 권한**: 초기 설정 시 SQL로 관리자 계정 생성 필수

5. **환경 변수**: `.env` 파일은 Git에 커밋하지 마세요!

---

**버전**: 2.0.0 (Vue 3 전환)  
**마지막 업데이트**: 2025-11-09  
**라이선스**: MIT
