# ShopHub 로컬 환경 설정 가이드

이 가이드는 ShopHub 프로젝트를 로컬 개발 환경에서 실행하는 방법을 설명합니다.

## 사전 요구사항

- Node.js (v18 이상)
- npm 또는 yarn
- PostgreSQL (v14 이상)

## 1. PostgreSQL 설치 및 설정

### Windows

1. [PostgreSQL 공식 사이트](https://www.postgresql.org/download/windows/)에서 설치 프로그램 다운로드
2. 설치 시 기본 포트 5432 사용
3. 설치 중 슈퍼유저 비밀번호 설정

### macOS

```bash
# Homebrew 사용
brew install postgresql@14
brew services start postgresql@14
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

## 2. 데이터베이스 생성

PostgreSQL에 접속하여 데이터베이스를 생성합니다.

```bash
# PostgreSQL에 접속 (Windows는 pgAdmin 사용 가능)
sudo -u postgres psql

# 또는
psql -U postgres
```

PostgreSQL 콘솔에서:

```sql
-- 데이터베이스 생성
CREATE DATABASE shophub_dev;

-- 사용자 생성 (선택사항, 기존 postgres 사용자 사용 가능)
CREATE USER shophub_user WITH PASSWORD 'AA742800!!';

-- 권한 부여
GRANT ALL PRIVILEGES ON DATABASE shophub_dev TO shophub_user;

-- 종료
\q
```

## 3. 프로젝트 설정

### 3.1. 저장소 클론 및 패키지 설치

```bash
# 프로젝트 디렉토리로 이동
cd shophub

# 의존성 설치
npm install
```

### 3.2. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성합니다:

```env
# 데이터베이스 연결 정보
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/shophub_dev

# 세션 비밀키 (랜덤 문자열로 변경)
SESSION_SECRET=your-super-secret-session-key-change-this

# 개발 환경
NODE_ENV=development
```

**중요:**
- `your_password`를 PostgreSQL에서 설정한 실제 비밀번호로 변경
- `SESSION_SECRET`을 안전한 랜덤 문자열로 변경 (최소 32자 권장)

### 3.3. 데이터베이스 스키마 생성

```bash
# Drizzle ORM을 사용하여 데이터베이스 스키마 적용
npm run db:push
```

만약 오류가 발생하면:

```bash
# 강제로 스키마 동기화
npm run db:push --force
```

## 4. Vite 설정 수정 (중요!)

프로젝트를 React 에서 Vue 3로 전환했으므로, `vite.config.ts` 파일을 수정해야 합니다.

**vite.config.ts** 파일을 열어 다음과 같이 수정:

```typescript
// 변경 전 (2번 라인)
import react from "@vitejs/plugin-react";

// 변경 후
import vue from "@vitejs/plugin-vue";
```

```typescript
// 변경 전 (8번 라인)
    react(),

// 변경 후
    vue(),
```

## 5. 애플리케이션 실행

### macOS / Linux

```bash
npm run dev
```

### Windows

#### 방법 1: 배치 파일 사용 (권장) ⭐

프로젝트 루트에 있는 `dev.bat` 파일을 더블클릭하거나, Command Prompt에서 다음을 실행합니다:

```cmd
dev.bat
```

또는:

```cmd
.\dev.bat
```

#### 방법 2: PowerShell 스크립트 사용

PowerShell에서 다음을 실행합니다:

```powershell
.\dev.ps1
```

만약 스크립트 실행이 제한되었다는 오류가 나면:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\dev.ps1
```

#### 방법 3: Git Bash 또는 WSL 사용

Git Bash나 Windows Subsystem for Linux(WSL)을 설치하면 Unix 명령어를 직접 사용할 수 있습니다:

```bash
npm run dev
```

---

성공적으로 실행되면:
- 백엔드: `http://localhost:5000`
- 프론트엔드: `http://localhost:5000` (Vite가 통합되어 같은 포트 사용)

브라우저에서 `http://localhost:5000`을 열면 ShopHub 애플리케이션을 볼 수 있습니다.

## 6. 초기 관리자 계정 생성

### 방법 1: 편리한 스크립트 사용 (권장)

프로젝트에 포함된 스크립트를 사용하면 간단하게 관리자 계정을 생성할 수 있습니다:

```bash
# 관리자 계정 생성 스크립트 실행
npx tsx server/scripts/create-admin.ts
```

기본 계정 정보:
- 이메일: `admin@shophub.com`
- 비밀번호: `admin123!`

**보안**: `server/scripts/create-admin.ts` 파일을 열어 이메일과 비밀번호를 변경하세요!

### 방법 2: 수동으로 변경

1. 회원가입 페이지에서 계정 생성
2. PostgreSQL에서 관리자 권한 부여:

```bash
# PostgreSQL 접속
psql -U postgres -d shophub_dev
```

```sql
-- 생성한 계정을 관리자로 변경
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';

-- 확인
SELECT id, email, is_admin FROM users;

\q
```

## 7. 데이터베이스 샘플 데이터 생성 (선택사항)

테스트를 위한 샘플 데이터를 자동으로 생성할 수 있습니다:

```bash
# 샘플 데이터 생성 스크립트 실행
npx tsx server/scripts/seed-data.ts
```

이 스크립트는 다음을 자동으로 생성합니다:
- 5개의 카테고리 (전자제품, 의류, 도서, 식품, 가전제품)
- 12개의 샘플 상품 (이미지 포함)
- 가격, 재고, 할인가 등 실제와 유사한 데이터

**참고**: 이미 데이터가 있는 경우 중복 오류가 발생할 수 있습니다.

## 문제 해결

### API 500 오류 (products, categories 로드 실패)

이 오류는 주로 **데이터베이스 스키마 미적용** 또는 **데이터베이스 연결 실패**로 인해 발생합니다.

---

#### 먼저 시도: 데이터베이스 스키마 재적용

```bash
npm run db:push
```

위 명령이 실패하면:

```bash
npm run db:push --force
```

그 후 앱 재시작:

```cmd
dev.bat
```

---

문제가 계속되면 아래 단계를 따르세요:

#### 1단계: PostgreSQL 서비스 확인

**Windows:**
1. `Services` 앱 열기 (`Win + R` 입력 후 `services.msc` 실행)
2. 목록에서 `postgresql-x64-*` 찾기
3. 상태가 "Running"인지 확인
4. 실행 중이 아니면 오른쪽 클릭 → `Start`

또는 Command Prompt에서:
```cmd
sc query postgresql-x64-14
```

**macOS/Linux:**
```bash
# PostgreSQL 상태 확인
sudo systemctl status postgresql

# 실행 중이 아니면 시작
sudo systemctl start postgresql
```

#### 2단계: `.env` 파일 설정 확인

프로젝트 루트에 `.env` 파일이 있는지 확인하고, 다음 내용이 정확한지 확인합니다:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/shophub_dev
SESSION_SECRET=your-super-secret-session-key-change-this
NODE_ENV=development
```

**중요:**
- `your_password` → PostgreSQL 설치 시 설정한 슈퍼유저 비밀번호로 변경
- `localhost:5432` → PostgreSQL 기본 포트 (변경했으면 수정)
- `shophub_dev` → 생성한 데이터베이스명

#### 3단계: PostgreSQL 연결 및 테이블 확인

**Windows Command Prompt:**
```cmd
psql -U postgres -d shophub_dev
```

**macOS/Linux:**
```bash
psql -U postgres -d shophub_dev
```

성공하면 `shophub_dev=#` 프롬프트가 나타납니다.

```sql
-- 테이블 목록 확인 (중요!)
\dt

-- products, categories, users 등의 테이블이 있어야 함
-- 없으면 아래에서 스키마 적용 진행

-- 종료
\q
```

**테이블이 없는 경우:**
```bash
npm run db:push
```

또는:
```bash
npm run db:push --force
```

만약 오류가 나면:
- **"cannot connect to server"** → PostgreSQL 서비스가 실행 중인지 확인
- **"database does not exist"** → 데이터베이스 생성 필요 (다음 섹션 참고)
- **"password authentication failed"** → 비밀번호가 잘못됨

#### 4단계: 스키마 적용

```bash
npm run db:push
```

실패하면:
```bash
npm run db:push --force
```

#### 5단계: 애플리케이션 재시작

```cmd
dev.bat
```

또는 이미 실행 중이면 `Ctrl+C`로 중지하고 다시 실행합니다.

---

### 데이터베이스 생성이 안 된 경우

PostgreSQL이 설치되었지만 데이터베이스가 없다면:

**Windows Command Prompt:**
```cmd
psql -U postgres
```

그 후 다음을 실행:
```sql
CREATE DATABASE shophub_dev;
\q
```

**또는 한 줄에:**
```cmd
psql -U postgres -c "CREATE DATABASE shophub_dev"
```

### 포트 충돌

포트 5000이 이미 사용 중인 경우:

**Windows:**
```cmd
netstat -ano | findstr :5000
```

다른 포트로 변경하려면:
```cmd
set PORT=5001 && dev.bat
```

또는 `.env` 파일에 추가:
```env
PORT=5001
```

### npm run db:push 오류

```bash
# 모든 테이블을 삭제하고 재생성 (주의!)
npm run db:push --force
```

**경고:** 이 명령은 모든 데이터를 삭제합니다.

## 개발 팁

### 데이터베이스 초기화

데이터베이스를 완전히 초기화하고 샘플 데이터로 다시 시작하려면:

```bash
# 1. 데이터베이스 삭제 및 재생성
psql -U postgres
DROP DATABASE shophub_dev;
CREATE DATABASE shophub_dev;
\q

# 2. 스키마 재적용
npm run db:push

# 3. 관리자 계정 생성
npx tsx server/scripts/create-admin.ts

# 4. 샘플 데이터 생성
npx tsx server/scripts/seed-data.ts
```

### 로그 확인

서버 로그는 터미널에 출력되며, 브라우저 개발자 도구(F12)에서 네트워크 및 콘솔 로그를 확인할 수 있습니다.

### Hot Reload

Vite를 사용하므로 프론트엔드 코드 변경 시 자동으로 새로고침됩니다. 백엔드 코드 변경 시에는 서버가 자동으로 재시작됩니다.

## 다음 단계

- [PROJECT_EXPORT_GUIDE.md](./PROJECT_EXPORT_GUIDE.md) - 프로젝트 내보내기 가이드
- [BACKEND_MODIFICATION_GUIDE.md](./BACKEND_MODIFICATION_GUIDE.md) - 백엔드 수정 가이드
- [replit.md](./replit.md) - 프로젝트 전체 개요

## 지원

문제가 발생하면 다음을 확인하세요:
1. Node.js 버전 확인: `node -v` (v18 이상)
2. PostgreSQL 실행 확인
3. `.env` 파일 설정 확인
4. `npm install` 재실행
5. 브라우저 콘솔 및 서버 로그 확인
