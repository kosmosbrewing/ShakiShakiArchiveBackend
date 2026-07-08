// server/types/index.ts
// 커스텀 타입 정의 (any 타입 제거용)

import "express-session";
import type { SQL } from "drizzle-orm";

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
    userId?: string; // UUID
    oauthState?: string; // OAuth CSRF 방지용 상태 토큰
    oauthReturnUrl?: string; // OAuth 완료 후 리다이렉트할 URL
    pendingAdminUserId?: string; // 관리자 2차 인증 대기 중인 사용자 UUID
    admin2faChallengeId?: string; // 관리자 2차 인증 challenge UUID
    admin2faCodeHash?: string; // 관리자 2차 인증 코드 HMAC
    admin2faExpiresAt?: string; // ISO datetime
    admin2faAttemptCount?: number;
    admin2faRecoveryAllowed?: boolean; // Telegram 발송 실패 시 임시 복구 코드 허용
    admin2faVerifiedAt?: string; // ISO datetime
    // 카카오페이 tid 백업 저장소 (orderId → tid 정보).
    // 인메모리 tidStore는 서버 재시작/다중 인스턴스에서 유실되므로,
    // PG 세션 스토어에 백업해 배포 중 결제 진행 사용자를 구제한다
    kakaopayTids?: Record<
      string,
      { tid: string; partnerUserId: string; createdAt: number }
    >;
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
// SQL 타입은 Drizzle의 sql`NOW()` 사용을 위해 허용
export interface OrderStatusUpdate {
  status: string;
  trackingNumber?: string;
  deliveredAt?: Date | SQL<unknown>; // 배송 완료 일시
  confirmedAt?: Date | SQL<unknown>; // 구매 확정 일시
  updatedAt: Date | SQL<unknown>;
}

// 주문 아이템 상태 업데이트 타입
export interface OrderItemStatusUpdate {
  status: string;
  trackingNumber?: string;
  courierCompany?: string;
  deliveredAt?: Date | SQL<unknown>; // 배송 완료 일시 (자동 구매확정 기준)
}

// 소프트 락 결제 승인 결과 타입
export interface StockLockResult {
  success: boolean;
  orderId: string;
  error?: string;
  insufficientStock?: {
    productName: string;
    variantSize?: string;
    requested: number;
    available: number;
  }[];
}

// 소프트 락 결제 데이터 타입
export interface ConfirmPaymentData {
  paymentProvider: string;
  paymentKey: string;
  externalOrderId: string;
  paymentMethod?: string;
  paidAt?: Date;
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
