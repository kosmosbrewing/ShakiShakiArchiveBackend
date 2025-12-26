// server/types/index.ts
// 커스텀 타입 정의 (any 타입 제거용)

import "express-session";

// Express Request 확장
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string; // UUID
        email: string;
        isAdmin: boolean;
      };
    }
  }
}

// express-session 확장
declare module "express-session" {
  interface SessionData {
    userId: string; // UUID
    oauthState?: string; // OAuth CSRF 방지용 상태 토큰
    oauthReturnUrl?: string; // OAuth 완료 후 리다이렉트할 URL
  }
}

// 주문 아이템 생성 데이터 타입
export interface OrderItemCreateData {
  productId: string; // UUID
  productName: string;
  productPrice: string;
  quantity: number;
  options: string | null;
}

// 주문 상태 업데이트 타입
export interface OrderStatusUpdate {
  status: string;
  trackingNumber?: string;
  updatedAt: Date;
}

// 주문 아이템 상태 업데이트 타입
export interface OrderItemStatusUpdate {
  status: string;
  trackingNumber?: string;
}

// 사용자 캐시 데이터 타입
export interface CachedUser {
  id: string; // UUID
  email: string;
  isAdmin: boolean;
}

// 사용자 업데이트 데이터 타입
export interface UserUpdateData {
  userName?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  detailAddress?: string;
  emailOptIn?: boolean;
  passwordHash?: string;
}
