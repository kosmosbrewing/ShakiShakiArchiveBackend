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

## 🗂️ 주요 파일 구조

```
shophub/
├── client/                    # 프론트엔드 (React + Vite)
│   ├── src/
│   │   ├── pages/            # 페이지 컴포넌트
│   │   │   ├── Landing.tsx   # 랜딩 페이지
│   │   │   ├── Home.tsx      # 상품 목록
│   │   │   ├── ProductDetail.tsx
│   │   │   ├── Cart.tsx      # 장바구니
│   │   │   ├── Checkout.tsx  # 주문/결제
│   │   │   ├── Orders.tsx    # 주문 내역
│   │   │   ├── OrderDetail.tsx
│   │   │   └── Admin.tsx     # 관리자 대시보드
│   │   ├── components/       # 재사용 컴포넌트
│   │   │   ├── Navbar.tsx
│   │   │   ├── ProductCard.tsx
│   │   │   └── ui/           # Shadcn UI 컴포넌트
│   │   ├── lib/              # 유틸리티
│   │   │   └── queryClient.ts
│   │   ├── hooks/            # Custom Hooks
│   │   │   └── use-auth.ts
│   │   └── App.tsx           # 메인 앱
│   └── index.html
│
├── server/                    # 백엔드 (Express)
│   ├── index.ts              # 서버 진입점
│   ├── routes.ts             # API 라우트
│   ├── storage.ts            # DB 인터페이스
│   ├── replitAuth.ts         # 인증 설정
│   └── vite.ts               # Vite 개발 서버
│
├── shared/                    # 공유 타입/스키마
│   └── schema.ts             # Drizzle ORM 스키마
│
├── database_setup.sql         # DB 초기화 스크립트 ⭐
├── design_guidelines.md       # 디자인 가이드
├── replit.md                 # 프로젝트 문서
├── package.json              # 의존성
├── tsconfig.json             # TypeScript 설정
├── tailwind.config.ts        # Tailwind CSS 설정
├── vite.config.ts            # Vite 설정
└── drizzle.config.ts         # Drizzle ORM 설정
```

## 🚀 로컬 환경 설치 방법

### 1. 사전 요구사항
- Node.js 20+ 
- PostgreSQL 14+
- npm 또는 yarn

### 2. 프로젝트 설정

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정 (.env 파일 생성)
cat > .env << EOF
DATABASE_URL=postgresql://username:password@localhost:5432/shophub
SESSION_SECRET=your-random-secret-key-here
REPL_ID=your-repl-id
NODE_ENV=development
EOF
```

### 3. 데이터베이스 설정

```bash
# PostgreSQL 데이터베이스 생성
createdb shophub

# 스키마 및 샘플 데이터 삽입
psql shophub < database_setup.sql

# 또는 Drizzle로 스키마 푸시
npm run db:push
```

### 4. 개발 서버 실행

```bash
# 개발 모드 (프론트엔드 + 백엔드)
npm run dev

# 브라우저에서 http://localhost:5000 접속
```

### 5. 프로덕션 빌드

```bash
# 빌드
npm run build

# 프로덕션 실행
npm start
```

## 🔐 인증 설정 (Replit Auth)

현재 Replit Auth를 사용하고 있습니다. 로컬 환경에서는:

1. **옵션 A**: Replit Auth 계속 사용
   - Replit에서 프로젝트를 실행해야 합니다
   
2. **옵션 B**: 다른 인증 시스템으로 교체
   - Clerk, Auth0, NextAuth.js 등
   - `server/replitAuth.ts` 수정 필요

## 📊 데이터베이스 스키마

`database_setup.sql` 파일에 전체 스키마가 포함되어 있습니다:

- **users** - 사용자 정보
- **categories** - 상품 카테고리
- **products** - 상품 정보
- **cart_items** - 장바구니
- **orders** - 주문
- **order_items** - 주문 상품
- **sessions** - 세션 (Replit Auth)

샘플 데이터:
- 5개 카테고리
- 8개 상품

## 🔧 관리자 권한 부여

```sql
-- 로그인 후 사용자 이메일로 관리자 권한 부여
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

## 📝 주요 스크립트

```json
{
  "dev": "개발 서버 실행",
  "build": "프로덕션 빌드",
  "start": "프로덕션 서버 실행",
  "db:push": "DB 스키마 푸시",
  "check": "TypeScript 타입 체크"
}
```

## 🌐 배포 옵션

### Replit에서 배포 (추천)
- Replit에서 "Publish" 버튼 클릭
- 자동으로 `.replit.app` 도메인 생성
- PostgreSQL 데이터베이스 자동 관리

### 다른 플랫폼
- **Vercel**: 프론트엔드 + Serverless Functions
- **Railway**: 전체 스택 + PostgreSQL
- **Render**: 전체 스택 + PostgreSQL
- **Heroku**: 전체 스택 + PostgreSQL

## 📚 기술 스택

**프론트엔드**:
- React 18
- TypeScript
- Vite
- TailwindCSS
- Shadcn UI
- TanStack Query
- Wouter (라우팅)

**백엔드**:
- Node.js
- Express
- TypeScript
- Drizzle ORM
- PostgreSQL
- Replit Auth (OpenID Connect)

**디자인**:
- Noto Sans KR 폰트
- 녹색 테마 (142 76% 36%)
- 반응형 디자인

## 🆘 문제 해결

### 포트 충돌
```bash
# 다른 포트 사용 (server/index.ts 수정)
const PORT = process.env.PORT || 3000;
```

### 데이터베이스 연결 실패
```bash
# DATABASE_URL 확인
echo $DATABASE_URL

# PostgreSQL 서비스 시작
sudo service postgresql start
```

### 빌드 오류
```bash
# node_modules 삭제 후 재설치
rm -rf node_modules
npm install
```

## 📞 지원

- 프로젝트 문서: `replit.md`
- 디자인 가이드: `design_guidelines.md`
- API 문서: `replit.md` 내 API Endpoints 섹션

---

**버전**: 1.0.0  
**마지막 업데이트**: 2024-11-08  
**라이선스**: MIT (또는 원하는 라이선스)
