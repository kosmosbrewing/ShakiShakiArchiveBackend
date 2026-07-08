# 백엔드 품질 개선 백로그 (2026-07-08)

4개 관점(보안 / 안정성·가용성 / DB·성능 / 결제·주문 정합성) 병렬 코드 점검 결과.
프론트엔드 품질 개선(프론트 repo `docs/QUALITY_IMPROVEMENTS_2026-07-08.md`)과 같은 방식으로 수행.
아직 착수 전이며, 심각도·우선순위 순으로 정리. **기존 기능·가용성을 훼손하지 않는 선에서 개선하는 것이 전제.**

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

### A-2. 토스 confirm의 isStockReserved 경로에 원자적 상태 가드 없음 (결제)

**위치**: `server/routes/payment.routes.ts:228-388`, `server/storage.ts:1591`

**현상**: 상태 체크(payableStatuses)와 상태 변경(updateOrderPayment) 사이에 락이 없고,
UPDATE도 `WHERE id=$7`뿐이라 상태 조건이 없음. confirm이 동시 2회 오면(더블클릭/재시도)
둘 다 상태 체크를 통과해 DB 확정·clearCart·알림·이메일이 이중 실행될 수 있음.
토스 `confirmPayment`는 Idempotency-Key 미사용이라 PG 레벨 멱등도 없음.
(`isStockReserved=false` 경로는 `confirmOrderWithStockLock`의 FOR UPDATE로 보호됨 — 이 경로만 빈틈)

**개선**: `updateOrderPayment`의 UPDATE에 `AND status IN ('pending_payment','paying')` 추가,
rowCount=0이면 이미 처리로 간주해 조기 반환. (order.routes.ts:419-434의 paying 전이가
이미 이 원자적 패턴을 쓰고 있음 — 동일 패턴 적용)

### A-3. 전체 환불: PG 취소 성공 후 DB 확정 실패 시 보상 없음 (결제)

**위치**: `server/routes/order.routes.ts:891-1004`

**현상**: PG 취소 성공 후 별도 트랜잭션에서 REFUNDED 확정 + 재고 복구를 하는데,
이 트랜잭션이 실패하면 throw만 하고 끝 — PG는 환불 완료됐는데 주문은 REFUNDING에
고착되고 재고 미복구. 관리자 수동 개입 전까지 상태 불일치.

**개선**: PG 취소 성공 직후 실패 지점을 텔레그램 알림 + 로그로 승격하고,
관리자가 멱등 재실행할 수 있는 재처리 경로(또는 재시도 큐) 마련.

### A-4. process 레벨 unhandledRejection/uncaughtException 핸들러 부재 (가용성)

**위치**: `server/index.ts`

**현상**: Express 전역 에러 핸들러는 라우트 밖(스케줄러, fire-and-forget Promise,
orderCleanup 등 백그라운드 작업)의 에러를 잡지 못함. 미처리 reject는 조용한 유실
또는 프로세스 크래시로 이어질 수 있음.

**개선**: `process.on('unhandledRejection'/'uncaughtException')` 등록 →
구조화 로깅 + 텔레그램 알림, uncaughtException은 graceful shutdown 후 재기동 유도.

### A-5. Graceful shutdown이 HTTP 서버를 닫지 않음 — 배포 시 진행 중 요청 유실 (가용성)

**위치**: `server/db.ts:229` (handleShutdown), `server/index.ts`

**현상**: SIGTERM/SIGINT 시 `closePool()`만 하고 즉시 exit. `httpServer.close()`가
어디서도 호출되지 않아, 배포 롤링 시 진행 중 요청(결제 승인 중이면 특히 위험)이
커넥션 끊김으로 유실될 수 있음.

**개선**: shutdown 순서를 `httpServer.close()`(신규 수신 중단 + drain) → 타임아웃 →
`closePool()` → exit로 변경. shutdown 로직을 index.ts로 이동하거나 httpServer 주입.

### A-6. 공개 문의 목록 API에 페이지네이션 없음 (성능)

**위치**: `server/routes/inquiry.routes.ts:60`, `server/storage.ts:2944-2955`

**현상**: `GET /api/inquiries`의 필터(productId/type/status)가 전부 optional이라
파라미터 없이 호출하면 전체 inquiries를 JOIN 포함 전량 반환. 공개 엔드포인트라
데이터 증가 시 부하·OOM 위험. 관리자 문의 목록(`admin/inquiry.routes.ts:62`)도 동일.

**개선**: `getInquiries`에 page/limit(공개 기본 20~40, 관리자 200) + COUNT 추가.
2026-02 `getProducts`/`getAllOrdersWithItems` 페이지네이션과 동일 패턴.

### A-7. 네이버페이 상품정보 XML 엔드포인트 N+1 (성능)

**위치**: `server/routes/naverpay-order.routes.ts:500-518`

**현상**: productIds 루프마다 `getProduct` + `getProductVariants` 개별 호출 — N개 상품에
2N개 쿼리. 외부(네이버)가 배치로 호출하는 엔드포인트라 선형 증가.

**개선**: `inArray` 기반 배치 조회 메서드 추가(2회 쿼리) 후 메모리 그룹핑.

---

## B. Medium

| # | 항목 | 위치 | 요지 |
|---|---|---|---|
| B-1 | 네이버페이 웹훅 인증 부재 | `naverpay-order.routes.ts:994` (notification 외 3종) | 서명/IP 검증 없음. 재조회(getOrderChangeDetails) + 멱등성 체크가 1차 방어라 위조 주문 생성은 어렵지만, 임의 트리거 가능. 네이버 문서의 검증 수단(IP 대역 등) 확인 후 적용 + rate limit |
| B-2 | 네이버페이 결제완료 금액 대조 없음 | `naverpay-order.routes.ts:905-951` | detail 금액을 그대로 신뢰해 주문 확정. DB product.price로 재계산·대조 후 불일치 시 보류 처리 (토스/카카오에는 있는 검증) |
| B-3 | 카카오페이 tid 인메모리 Map | `kakaopay.routes.ts:52-67` | 서버 재시작/다중 인스턴스 시 tid 유실 → 결제창 완료 후 승인 불가. orders 컬럼 또는 Redis(TTL)로 이전 |
| B-4 | 네이버페이 CANCEL_DONE 자동 반영 없음 | `naverpay-order.routes.ts:1079-1090` | 고객이 네이버 측에서 취소해도 로그만 남김 — 주문 상태·재고 미반영. 멱등 가드 포함 자동 전이 + 재고 복구 |
| B-5 | 배송지 수정 Zod 누락 (mass assignment) | `address.routes.ts:33-45` | req.body를 통째로 `.set()`에 전달. `insertDeliveryAddressSchema.partial()` parse로 화이트리스트 |
| B-6 | 재고 선점 삭제가 userId 전체 대상 | `payment.routes.ts:329-338`, `kakaopay.routes.ts:406-408` | 동일 유저 병렬 주문 시 다른 주문의 예약 기록까지 삭제. orderId 기준으로 좁히거나, 선점 패턴이 dead code면 제거 |
| B-7 | payment.routes 취소 경로에 환불 ceiling 없음 | `payment.routes.ts:502-598` | 부분취소 누적액이 결제액을 넘는지 검증 없음 (order.routes의 partial-cancel에는 있음). 동일 가드 추가 |
| B-8 | 네이버 OAuth fetch 타임아웃 없음 | `services/naver.service.ts:103,125,154` | raw fetch가 http-client(AbortController) 우회. 네이버 인증 서버 지연 시 무한 대기. http-client로 교체 |

---

## C. Low

- **C-1** `cart.routes.ts:41-45` — 수량 변경에 상한(max) 검증 없음. Zod `int().min(1).max()` 적용.
- **C-2** `storage.ts:1462` — `getAllOrders()` LIMIT 없음 (호출처는 비프로덕션 디버그뿐이나 foot-gun). `.limit(10)` 파라미터화 또는 제거.
- **C-3** `storage.ts:1391` — `getOrders(userId)` LIMIT 없음. 마이페이지 주문 목록 page/limit 도입.
- **C-4** `storage.ts:691` — 상품 검색 `LIKE '%s%'` 풀스캔. Meilisearch로 위임 여부 확인 후, DB 검색 유지 시 pg_trgm GIN 인덱스.
- **C-5** `index.ts:98` — `notFoundHandler`가 정의만 되고 마운트 안 됨. errorHandler 앞에 추가 (관측성).
- **C-6** `error.middleware.ts:61` — 에러 로그의 req.query 마스킹 없음. OAuth code/paymentKey가 query로 오는 경로 마스킹 + SENSITIVE_KEYS에 'code' 추가 검토.
- **C-7** `routes/index.ts:33` — `/health`가 DB 상태 무관 200. readiness(SELECT 1)와 liveness 분리 검토 — 배포 파이프라인의 헬시 판정 방식 확인 후.
- **C-8** `payment.routes.ts:579-598` — 취소 상태변경과 재고복구가 별도 트랜잭션. 단일 트랜잭션으로 묶거나 복구 실패를 알림으로 승격.
- **C-9** `naverpay-order.service.ts:990-999` — 요청 로깅 경로에서 certiKey 마스킹 명시 확인.

---

## 착수 시 주의 (기능·가용성 보전)

- **A-2, B-6, B-7**: 결제 경로 수정은 프론트 결제 플로우(토스/카카오/네이버 콜백)와 왕복 테스트 필수. 테스트 결제 1회씩 확인 후 배포.
- **A-5**: shutdown 순서 변경은 배포 중 동작이 바뀌므로, 적용 후 첫 배포에서 무중단 여부 관찰.
- **A-6**: 공개 문의 목록 페이지네이션은 프론트 `api.ts`의 하위 호환 패턴(`Array.isArray()` 체크) 확인 후, 프론트·백엔드 동시 반영 (2026-02 페이지네이션 작업과 동일 절차).
- **B-1**: 웹훅에 검증을 추가할 때 네이버 실제 알림이 차단되지 않도록 로그 모드로 먼저 관찰 후 강제.

---

## 참고: 이번 점검에서 확인된 정상 동작 (개선 불필요)

- **보안**: 세션 쿠키(httpOnly/secure/sameSite) 정상, CORS 운영 화이트리스트 강제, admin 전 라우트 `isAdmin` + 2FA(admin2faVerifiedAt) 요구, SQL Injection 없음(전 raw SQL 파라미터 바인딩), 파일 업로드 MIME 화이트리스트 + 10MB 제한 + Cloudinary 스트림, 에러 응답 운영 시 내부 정보 미노출, 하드코딩 시크릿 없음, 시크릿 미설정 시 기동 중단.
- **안정성**: 전역 에러 핸들러 + asyncHandler 래퍼, rate limiter 세분화(전역/인증/이메일/결제/관리자), json 1mb 제한, helmet, DB 풀 설정(max 20, timeout), PG API 타임아웃(http-client AbortController), 로그 민감정보 마스킹 + 텔레그램 알림 마스킹.
- **DB·성능**: 주문 생성 트랜잭션(BEGIN/COMMIT + `SELECT FOR UPDATE` 재고 락), 결제 이중 재고 차감 방지(`isStockReserved` 가드), 장바구니 advisory lock, 핵심 조회 N+1 없음(getProducts/getOrders/getCartItems 전부 JOIN 또는 2단계 inArray), 스키마 인덱스 대부분 정의됨, base64 대용량 응답 없음.
- **결제 정합성**: 토스/카카오 서버 금액 재계산 + 승인액 대조, 주문 소유자 검증 일관, paying 전이 원자적 UPDATE(모범 패턴), 부분취소 ceiling(order.routes 경로), NON_CANCELABLE_STATUSES 서버 강제, 네이버페이 멱등성 체크(externalOrderId).
