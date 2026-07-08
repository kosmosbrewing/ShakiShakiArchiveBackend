# 백엔드 품질 개선 백로그 (2026-07-08)

4개 관점(보안 / 안정성·가용성 / DB·성능 / 결제·주문 정합성) 병렬 코드 점검 결과.
프론트엔드 품질 개선(프론트 repo `docs/QUALITY_IMPROVEMENTS_2026-07-08.md`)과 같은 방식으로 수행.
아직 착수 전이며, 심각도·우선순위 순으로 정리. **기존 기능·가용성을 훼손하지 않는 선에서 개선하는 것이 전제.**

> **운영 전제 (2026-07-08 재검증 반영)**: 결제는 **카카오페이만 운영 사용**.
> 토스/네이버페이 코드는 존재하나 미사용 → 관련 발견은 "개별 수정"이 아니라
> **라우트 일괄 비활성화(A-8)**로 통합하고, 카카오페이 경로 문제를 승격함.
> 네이버 **소셜 로그인**(naver.service.ts + oauth.routes.ts)은 결제와 무관한 운영 기능이므로 비활성화 대상이 아님.

---

## A. High — 우선 조치 권장

### A-1. 장바구니 IDOR — 수량 변경/삭제에 소유권 검증 없음 (보안)

**위치**: `server/routes/cart.routes.ts:41-59`, `server/storage.ts:1097-1111`

**현상**: `PATCH /api/cart/:id`, `DELETE /api/cart/:id`가 cartItem UUID만으로 동작.
`updateCartItem`/`deleteCartItem`의 WHERE에 userId 필터가 없어, 다른 사용자의
cartItem id를 알면 타인의 장바구니를 수정·삭제할 수 있음.
(order/address/return/wishlist는 모두 userId 필터가 있음 — cart만 예외)

**개선**: storage 메서드에 userId 인자 추가 후
`and(eq(cartItems.id, id), eq(cartItems.userId, userId))`로 필터.
기존 address 라우트 패턴과 동일하게 통일.

### A-2. 카카오페이 승인 콜백의 선점 경로에 원자적 상태 가드 없음 (결제 — 주 운영 경로)

**위치**: `server/routes/kakaopay.routes.ts:389-402`, `server/storage.ts:1591-1653`

**현상**: `isStockReserved=true`(선점) 경로가 비원자적 `updateOrderPayment`를 사용 —
UPDATE에 상태 조건이 없고(`WHERE id=$7`만), 콜백 진입부 상태 체크와 UPDATE 사이가
분리(TOCTOU)되어 있음. 동시 승인 콜백 2회(pg_token 재사용/뒤로가기) 시 DB 확정·
`clearCart`·알림·이메일이 이중 실행될 수 있음. 카카오 approve API의 멱등성 보장도
코드상 확인 안 됨. (비선점 경로는 `confirmOrderWithStockLock`의 FOR UPDATE + 상태
재검증으로 보호됨 — **주 운영 경로인 선점만 무방비**. 토스 confirm도 동일 문제이나
미사용이므로 A-8로 차단.)

**개선**: 선점 경로도 `UPDATE orders SET status='payment_confirmed'
WHERE id=$1 AND status IN ('pending_payment','paying')` 조건부 UPDATE로 바꾸고
rowCount=0이면 이미 처리로 간주해 조기 반환(알림·clearCart 스킵).
(order.routes.ts:419-434의 paying 전이가 이미 이 원자적 패턴을 사용 중 — 동일 패턴)

### A-3. 카카오페이 tid 인메모리 저장 — 재시작/다중 인스턴스 시 승인 실패 (결제 — 유일 PG라 승격)

**위치**: `server/routes/kakaopay.routes.ts:43-67, 226, 322-329`

**현상**: tid를 `Map`(TTL 15분)에 저장. 서버 재시작(main push = 프로덕션 배포) 또는
다중 인스턴스 환경에서 ready→callback 사이에 tid가 유실되면, **사용자가 카카오
결제창을 완료했는데** approve를 못 해 "결제 정보가 만료되었습니다"로 실패 처리됨.
(카카오 미승인 건은 15분 후 자동 만료라 실제 청구는 없지만 UX·신뢰 손상)
유일 운영 PG이므로 배포 시마다 결제 중이던 사용자가 실패를 겪을 수 있음.

**개선**: `orders.kakaopay_tid` 컬럼 추가(ready 시 저장, callback 시 조회) —
재시작·다중 인스턴스 모두 해결. 인메모리 Map 제거.

### A-4. 부분취소: PG 취소 성공 후 DB 반영 실패 시 보상 없음 (결제 — 카카오 해당)

**위치**: `server/routes/order.routes.ts:692-759` (PG 분기: kakaopay.routes.ts:693-698)

**현상**: `/:id/partial-cancel`에서 PG 취소 성공 후 `storage.partialCancelOrder`로
DB 반영하는데, 이 사이 실패하면 **PG는 환불됐는데 주문은 결제 상태로 남음** —
보상/재시도 없이 throw. (환불 ceiling 검증 자체는 이 경로에 있음 — 양호)

**개선**: PG 취소 성공 직후의 DB 실패를 텔레그램 알림으로 승격하고,
관리자가 멱등 재실행할 수 있는 재처리 경로 마련.

### A-5. process 레벨 unhandledRejection/uncaughtException 핸들러 부재 (가용성)

**위치**: `server/index.ts`

**현상**: Express 전역 에러 핸들러는 라우트 밖(스케줄러, fire-and-forget Promise,
orderCleanup 등 백그라운드 작업)의 에러를 잡지 못함. 미처리 reject는 조용한 유실
또는 프로세스 크래시로 이어질 수 있음.

**개선**: `process.on('unhandledRejection'/'uncaughtException')` 등록 →
구조화 로깅 + 텔레그램 알림, uncaughtException은 graceful shutdown 후 재기동 유도.

### A-6. Graceful shutdown이 HTTP 서버를 닫지 않음 — 배포 시 진행 중 요청 유실 (가용성)

**위치**: `server/db.ts:229` (handleShutdown), `server/index.ts`

**현상**: SIGTERM/SIGINT 시 `closePool()`만 하고 즉시 exit. `httpServer.close()`가
어디서도 호출되지 않아, 배포 롤링 시 진행 중 요청(**카카오 승인 콜백 중이면 A-3과
결합해 결제 실패**)이 커넥션 끊김으로 유실될 수 있음.

**개선**: shutdown 순서를 `httpServer.close()`(신규 수신 중단 + drain) → 타임아웃 →
`closePool()` → exit로 변경. shutdown 로직을 index.ts로 이동하거나 httpServer 주입.

### A-7. 공개 문의 목록 API에 페이지네이션 없음 (성능)

**위치**: `server/routes/inquiry.routes.ts:60`, `server/storage.ts:2944-2955`

**현상**: `GET /api/inquiries`의 필터가 전부 optional이라 파라미터 없이 호출하면
전체 inquiries를 JOIN 포함 전량 반환. 공개 엔드포인트라 데이터 증가 시 부하·OOM 위험.
관리자 문의 목록(`admin/inquiry.routes.ts:62`)도 동일.

**개선**: `getInquiries`에 page/limit(공개 기본 20~40, 관리자 200) + COUNT 추가.
2026-02 `getProducts`/`getAllOrdersWithItems` 페이지네이션과 동일 패턴.

### A-8. 미사용 PG(토스/네이버페이) 라우트 일괄 비활성화 — 공격 표면 제거 (보안)

**위치**: `server/routes/payment.routes.ts`, `server/routes/naverpay-order.routes.ts`, `server/routes/index.ts:58-61`

**현상**: 활성화 게이트가 라우트별 개별 부착이라 **누락이 있음**:
- 토스: `/client-key`만 `isEnabled` 체크. **핵심 상태 변경 라우트 `/confirm`(149행),
  `/:orderId/cancel`(468행)에 게이트 없음** — 미사용인데 인증 사용자가 호출 가능.
- 네이버페이 주문형: `checkNaverPayOrderEnabled`가 POST 4곳에만 적용.
  **무인증 GET `/product-info`(440행), `/additional-fee`(715행)는 게이트도 인증도 없음** —
  상품·재고·배송비 정보 무인증 노출.

**개선**: 라우트별 부착 대신 **라우터 레벨 게이트**로 일괄 차단:
각 라우터 최상단에 `router.use(checkTossEnabled)` / `router.use(checkNaverPayOrderEnabled)`
1줄, 또는 `routes/index.ts`에서 `if (config.X.isEnabled)`로 조건부 마운트.
env 미설정 상태를 유지하는 것만으로 전체 차단됨. **카카오페이 라우트는 건드리지 않으므로
운영 리스크 없음.** 이로써 미사용 PG 관련 개별 발견(네이버페이 웹훅 인증 부재,
금액 대조 부재, CANCEL_DONE 미처리, 상품 XML N+1, 토스 confirm 경쟁조건)은 전부
"차단됨"으로 해소 — 토스/네이버 재도입 시 개별 항목을 그때 수정.

---

## B. Medium

| # | 항목 | 위치 | 요지 |
|---|---|---|---|
| B-1 | 카카오 전용 `/cancel` 라우트에 환불 ceiling 없음 + refundedAmount 덮어쓰기 | `kakaopay.routes.ts:704-826`, `storage.ts:1685` | `cancelAmount`를 누적 환불액과 대조하지 않고 카카오 API에 그대로 전달(카카오 `-12` 에러에만 의존). `cancelOrderPayment`가 refunded_amount를 누적이 아닌 마지막 취소액으로 **덮어써** 부분취소 2회 시 추적이 깨짐. partial-cancel과 동일한 ceiling 가드 + `COALESCE(refunded_amount,0)+$3` 누적으로 수정. 프론트가 이 라우트를 실제 쓰는지 확인 필요 |
| B-2 | 금액 불일치 시 카카오 승인 취소 보상 없음 | `kakaopay.routes.ts:371-378` | 승인 후 금액 대조 실패 시 throw만 하고 이미 승인된 결제를 취소하지 않음 — PG 승인은 남은 채 실패 화면. 재고부족 경로(462-476)의 `cancelPaymentSimple` 보상을 동일 적용 |
| B-3 | 재고 선점 삭제가 userId 전체 대상 | `kakaopay.routes.ts:406-408` (토스도 동일하나 미사용) | 동일 유저 병렬 주문 시 다른 주문의 예약 기록까지 삭제. orderId 기준으로 좁히거나, 선점 패턴 미사용이면 코드 제거 |
| B-4 | 배송지 수정 Zod 누락 (mass assignment) | `address.routes.ts:33-45` | req.body를 통째로 `.set()`에 전달. `insertDeliveryAddressSchema.partial()` parse로 화이트리스트 |
| B-5 | 네이버 OAuth(소셜 로그인) fetch 타임아웃 없음 | `services/naver.service.ts:103,125,154` | **결제 아님 — 소셜 로그인, 운영 사용 중.** raw fetch가 http-client(AbortController) 우회. 네이버 인증 서버 지연 시 로그인 요청 무한 대기. http-client로 교체 |

---

## C. Low

- **C-1** `cart.routes.ts:41-45` — 수량 변경에 상한(max) 검증 없음. Zod `int().min(1).max()` 적용.
- **C-2** `storage.ts:1462` — `getAllOrders()` LIMIT 없음 (호출처는 비프로덕션 디버그뿐이나 foot-gun). `.limit(10)` 파라미터화 또는 제거.
- **C-3** `storage.ts:1391` — `getOrders(userId)` LIMIT 없음. 마이페이지 주문 목록 page/limit 도입.
- **C-4** `storage.ts:691` — 상품 검색 `LIKE '%s%'` 풀스캔. Meilisearch로 위임 여부 확인 후, DB 검색 유지 시 pg_trgm GIN 인덱스.
- **C-5** `index.ts:98` — `notFoundHandler`가 정의만 되고 마운트 안 됨. errorHandler 앞에 추가 (관측성).
- **C-6** `error.middleware.ts:61` — 에러 로그의 req.query 마스킹 없음. OAuth code가 query로 오는 경로 마스킹 + SENSITIVE_KEYS에 'code' 추가 검토.
- **C-7** `routes/index.ts:33` — `/health`가 DB 상태 무관 200. readiness(SELECT 1)와 liveness 분리 검토 — 배포 파이프라인의 헬시 판정 방식 확인 후.
- **C-8** `payment.routes.ts:579-598` — 취소 상태변경과 재고복구가 별도 트랜잭션 (토스 경로 — A-8 차단 시 사실상 해소).

---

## 착수 순서 제안 (기능·가용성 보전)

1. **A-8 (미사용 PG 차단)** — 카카오 미접촉, 1~2줄 변경으로 공격 표면 대폭 축소. 가장 안전하고 이득 큼.
2. **A-1 (cart IDOR)** — 수정 작고 보안 이득 큼. 프론트 장바구니 CRUD 수동 확인만.
3. **A-5, A-6 (process 핸들러 + graceful shutdown)** — 결제 로직 미접촉. 적용 후 첫 배포에서 무중단 여부 관찰.
4. **A-2, A-3 (카카오 승인 가드 + tid DB화)** — 결제 핵심 경로. **카카오 테스트 결제 왕복(승인/취소/뒤로가기) 확인 후 배포 필수.** A-3은 마이그레이션 동반.
5. **A-4, B-1, B-2 (환불 경로)** — 부분취소 테스트 포함.
6. **A-7 (문의 페이지네이션)** — 프론트 `api.ts` 하위 호환 패턴(`Array.isArray()`) 확인 후 프론트·백엔드 동시 반영.

---

## 참고: 이번 점검에서 확인된 정상 동작 (개선 불필요)

- **보안**: 세션 쿠키(httpOnly/secure/sameSite) 정상, CORS 운영 화이트리스트 강제, admin 전 라우트 `isAdmin` + 2FA(admin2faVerifiedAt) 요구, SQL Injection 없음(전 raw SQL 파라미터 바인딩), 파일 업로드 MIME 화이트리스트 + 10MB 제한 + Cloudinary 스트림, 에러 응답 운영 시 내부 정보 미노출, 하드코딩 시크릿 없음, 시크릿 미설정 시 기동 중단.
- **안정성**: 전역 에러 핸들러 + asyncHandler 래퍼, rate limiter 세분화(전역/인증/이메일/결제/관리자), json 1mb 제한, helmet, DB 풀 설정(max 20, timeout), PG API 타임아웃(http-client AbortController), 로그 민감정보 마스킹 + 텔레그램 알림 마스킹.
- **DB·성능**: 주문 생성 트랜잭션(BEGIN/COMMIT + `SELECT FOR UPDATE` 재고 락), 결제 이중 재고 차감 방지(`isStockReserved` 가드), 장바구니 advisory lock, 핵심 조회 N+1 없음(getProducts/getOrders/getCartItems 전부 JOIN 또는 2단계 inArray), 스키마 인덱스 대부분 정의됨, base64 대용량 응답 없음.
- **결제 정합성 (카카오 기준)**: 승인 후 서버 금액 대조(371-378), 재고부족 시 승인 취소 보상(`cancelPaymentSimple`), 주문 소유자 검증 일관, paying 전이 원자적 UPDATE(모범 패턴 — A-2가 이 패턴을 확산하면 됨), partial-cancel 환불 ceiling, NON_CANCELABLE_STATUSES 서버 강제.
