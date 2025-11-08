-- ShopHub E-Commerce Database Schema
-- PostgreSQL Database Setup Script
-- 생성일: 2024-11-08

-- ==========================================
-- 1. 테이블 생성 (Create Tables)
-- ==========================================

-- Sessions 테이블 (Replit Auth 필수)
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions(expire);

-- Users 테이블
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE,
  first_name VARCHAR,
  last_name VARCHAR,
  profile_image_url VARCHAR,
  is_admin BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Categories 테이블
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  image_url VARCHAR,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Products 테이블
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2),
  category_id VARCHAR REFERENCES categories(id),
  image_url VARCHAR,
  images TEXT[],
  stock_quantity INTEGER DEFAULT 0 NOT NULL,
  is_available BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Cart Items 테이블
CREATE TABLE IF NOT EXISTS cart_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  product_id VARCHAR REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER DEFAULT 1 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Orders 테이블
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending_payment' NOT NULL,
  shipping_name VARCHAR(100) NOT NULL,
  shipping_phone VARCHAR(20) NOT NULL,
  shipping_address TEXT NOT NULL,
  shipping_postal_code VARCHAR(20),
  tracking_number VARCHAR(100),
  stripe_payment_intent_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Order Items 테이블
CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_id VARCHAR REFERENCES products(id) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_price DECIMAL(10, 2) NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ==========================================
-- 2. 샘플 데이터 삽입 (Sample Data)
-- ==========================================

-- 카테고리 샘플 데이터
INSERT INTO categories (id, name, slug, description, image_url) VALUES
  ('cat-electronics', '전자제품', 'electronics', '최신 전자제품 및 가전제품', 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800'),
  ('cat-fashion', '패션', 'fashion', '의류, 신발, 액세서리', 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800'),
  ('cat-living', '생활용품', 'living', '가정용품 및 생활 편의용품', 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=800'),
  ('cat-books', '도서', 'books', '책, 전자책, 오디오북', 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=800'),
  ('cat-sports', '스포츠', 'sports', '운동용품 및 아웃도어 장비', 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800')
ON CONFLICT (slug) DO NOTHING;

-- 상품 샘플 데이터
INSERT INTO products (id, name, slug, description, price, original_price, category_id, image_url, stock_quantity, is_available) VALUES
  ('prod-galaxy-flip6', '갤럭시 Z 플립6', 'galaxy-z-flip6', '최신 폴더블 스마트폰, 컴팩트한 디자인과 강력한 성능', 1398000, 1498000, 'cat-electronics', 'https://images.unsplash.com/photo-1592286927505-02c0c3a0d9bc?w=800', 50, true),
  ('prod-macbook-air-m3', '맥북 에어 M3', 'macbook-air-m3', 'M3 칩 탑재, 초경량 고성능 노트북', 1690000, 1890000, 'cat-electronics', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800', 30, true),
  ('prod-wireless-earbuds', '무선 이어폰 프로', 'wireless-earbuds-pro', '노이즈 캔슬링 기능의 프리미엄 무선 이어폰', 289000, 349000, 'cat-electronics', 'https://images.unsplash.com/photo-1590658165737-15a047b3f867?w=800', 100, true),
  ('prod-cashmere-knit', '캐시미어 니트', 'cashmere-knit', '부드럽고 따뜻한 100% 캐시미어 니트', 189000, 259000, 'cat-fashion', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800', 45, true),
  ('prod-leather-crossbag', '가죽 크로스백', 'leather-crossbag', '이탈리아 천연 가죽 크로스백', 159000, 199000, 'cat-fashion', 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800', 60, true),
  ('prod-premium-sneakers', '프리미엄 운동화', 'premium-sneakers', '편안한 착용감의 고급 운동화', 139000, 179000, 'cat-fashion', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', 80, true),
  ('prod-cordless-vacuum', '무선 청소기', 'cordless-vacuum', '강력한 흡입력의 무선 진공청소기', 459000, 559000, 'cat-living', 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=800', 25, true),
  ('prod-air-purifier', '공기청정기', 'air-purifier', '4단계 필터 시스템 공기청정기', 329000, 399000, 'cat-living', 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800', 35, true)
ON CONFLICT (slug) DO NOTHING;

-- ==========================================
-- 3. 주문 상태 참고 (Order Status Reference)
-- ==========================================
-- pending_payment: 입금 대기
-- payment_confirmed: 결제 확인
-- preparing: 배송 준비
-- shipped: 배송 중
-- delivered: 배송 완료
-- cancelled: 주문 취소

-- ==========================================
-- 4. 관리자 권한 부여 (Grant Admin Access)
-- ==========================================
-- 로그인 후 아래 쿼리로 관리자 권한 부여
-- UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
