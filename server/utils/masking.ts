// server/utils/masking.ts
// 개인정보 마스킹 유틸리티 함수

import type { User } from "@shared/schema";

/**
 * 이메일 주소 마스킹
 * 예시: test@gmail.com -> t**t@gmail.com
 *       a@example.com -> a**@example.com
 *       ab@test.com -> a**b@test.com
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;

  // @가 정확히 하나인지 검증 (보안 취약점 수정)
  const atCount = (email.match(/@/g) || []).length;
  if (atCount !== 1) return email; // 잘못된 형식이면 원본 반환

  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;

  // 로컬 파트 마스킹
  if (localPart.length <= 1) {
    return `${localPart}**@${domain}`;
  } else if (localPart.length === 2) {
    return `${localPart[0]}**${localPart[1]}@${domain}`;
  } else {
    // 3글자 이상: 첫 글자 + ** + 마지막 글자
    return `${localPart[0]}**${localPart[localPart.length - 1]}@${domain}`;
  }
}

/**
 * 전화번호 마스킹
 * 예시: 010-1234-5678 -> 010-****-5678
 *       01012345678 -> 010-****-5678
 *
 * 항상 하이픈 포함 형식으로 반환
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // 하이픈 제거
  const cleaned = phone.replace(/-/g, "");

  // 전화번호 형식 검증 (010으로 시작하는 11자리)
  if (!/^010\d{8}$/.test(cleaned)) {
    // 잘못된 형식이면 중간 부분만 마스킹 (일관되게 하이픈 포함)
    if (cleaned.length >= 7) {
      return `${cleaned.slice(0, 3)}-****-${cleaned.slice(-4)}`;
    }
    return phone; // 너무 짧으면 원본 반환
  }

  // 항상 010-****-5678 형식으로 반환 (일관성 유지)
  const part1 = cleaned.slice(0, 3); // 010
  const part3 = cleaned.slice(-4); // 5678

  return `${part1}-****-${part3}`;
}

/**
 * 주소 마스킹
 * 예시: 서울특별시 강남구 테헤란로 123 -> 서울특별시 강남구 테헤***
 */
export function maskAddress(address: string | null | undefined): string | null {
  if (!address) return null;

  // 공백으로 분리
  const parts = address.trim().split(/\s+/);

  if (parts.length <= 2) {
    // 2단어 이하: 마지막 단어만 마스킹
    if (parts.length === 0) return address;
    const lastIndex = parts.length - 1;
    parts[lastIndex] = maskString(parts[lastIndex]);
    return parts.join(" ");
  }

  // 3단어 이상: 앞 2단어는 유지, 나머지는 마스킹
  const visible = parts.slice(0, 2).join(" ");
  const hidden = parts.slice(2).map(maskString).join(" ");

  return `${visible} ${hidden}`;
}

/**
 * 문자열 마스킹 (일반)
 * 예시: 테헤란로 -> 테헤***
 *       123 -> 1**
 */
function maskString(str: string): string {
  if (str.length <= 1) return str;
  if (str.length === 2) return `${str[0]}*`;

  // 3글자 이상: 앞 2글자 유지, 나머지는 ***
  return `${str.slice(0, 2)}***`;
}

/**
 * 상세주소 마스킹
 * 예시: 101동 202호 -> ***
 */
export function maskDetailAddress(
  detailAddress: string | null | undefined
): string | null {
  if (!detailAddress) return null;

  // 상세주소는 전체를 *** 로 마스킹 (보안 강화)
  return "***";
}

/**
 * 사용자 이름 마스킹
 * 예시: 홍길동 -> 홍*동
 *       김철수 -> 김*수
 *       이순 -> 이*
 */
export function maskUserName(
  userName: string | null | undefined
): string | null {
  if (!userName) return null;

  if (userName.length <= 1) return userName;
  if (userName.length === 2) return `${userName[0]}*`;

  // 3글자 이상: 첫 글자 + * + 마지막 글자
  return `${userName[0]}*${userName[userName.length - 1]}`;
}

/**
 * User 객체 마스킹 (조회용 API용)
 * - passwordHash 제거
 * - 개인정보 마스킹 (이메일, 이름, 전화번호, 주소)
 * - 소셜 ID 숨김 (naverId, kakaoId를 null로)
 *
 * 사용처: 관리자 조회 API, 공개 API 등
 */
export function maskUserObject(user: User): Omit<User, 'passwordHash'> & {
  naverId: null;
  kakaoId: null;
} {
  return {
    id: user.id,
    email: maskEmail(user.email) || user.email,
    userName: maskUserName(user.userName) || user.userName,
    phone: maskPhone(user.phone),
    zipCode: user.zipCode, // 우편번호는 공개 정보이므로 마스킹 안 함
    address: maskAddress(user.address),
    detailAddress: maskDetailAddress(user.detailAddress),
    profileImageUrl: user.profileImageUrl,
    isAdmin: user.isAdmin,
    naverId: null, // 소셜 ID는 노출 안 함
    kakaoId: null,
    socialProvider: user.socialProvider,
    emailOptIn: user.emailOptIn,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * 관리자 User 객체 마스킹 (부분 공개)
 * - passwordHash 제거
 * - userName만 공개, 나머지 개인정보는 마스킹
 * - 소셜 ID 숨김 (naverId, kakaoId를 null로)
 *
 * 사용처: 관리자가 작성한 문의/답변 조회 시
 */
export function maskAdminUserObject(user: User): Omit<User, 'passwordHash'> & {
  naverId: null;
  kakaoId: null;
} {
  return {
    id: user.id,
    email: maskEmail(user.email) || user.email,
    userName: user.userName, // 관리자 이름은 공개
    phone: maskPhone(user.phone),
    zipCode: user.zipCode,
    address: maskAddress(user.address),
    detailAddress: maskDetailAddress(user.detailAddress),
    profileImageUrl: user.profileImageUrl,
    isAdmin: user.isAdmin,
    naverId: null,
    kakaoId: null,
    socialProvider: user.socialProvider,
    emailOptIn: user.emailOptIn,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * User 객체 sanitize (passwordHash만 제거, 마스킹 안 함)
 * - passwordHash만 제거하고 나머지는 원본 반환
 *
 * 사용처: 본인 조회
 */
export function sanitizeUserObject(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * 사용자 정보 마스킹 (공개 API용)
 * - 관리자: 이름만 공개, 나머지 마스킹
 * - 일반 사용자: 전체 마스킹
 *
 * 사용처: 문의 목록/상세 조회 시 작성자 정보 표시
 */
export function maskUserForPublicView(user: User): Omit<User, 'passwordHash'> & {
  naverId: null;
  kakaoId: null;
} {
  return user.isAdmin ? maskAdminUserObject(user) : maskUserObject(user);
}

/**
 * 문의 작성자 정보 마스킹 (본인 여부 고려)
 * - 본인: 마스킹 안 함 (전체 정보 공개)
 * - 관리자: 이름만 공개
 * - 일반 사용자: 전체 마스킹
 *
 * 사용처: 문의 상세 조회 시 작성자 정보 표시
 */
export function maskUserForInquiryView(
  user: User,
  isOwner: boolean
): Omit<User, 'passwordHash'> & {
  naverId: null;
  kakaoId: null;
} {
  if (isOwner) {
    return {
      ...sanitizeUserObject(user),
      naverId: null,
      kakaoId: null,
    };
  }
  return maskUserForPublicView(user);
}
