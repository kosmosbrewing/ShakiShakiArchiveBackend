// server/services/searchPing.service.ts
// SEO 신선도 자동화: 상품 변경 시 프론트엔드 프리렌더 재빌드 트리거
//
// 동작 방식:
// 1. 관리자가 상품을 생성/수정/삭제하면 scheduleRebuild() 호출 (fire-and-forget)
// 2. 디바운스(10분) 후 GitHub repository_dispatch API 호출
//    → 프론트엔드 deploy.yml(repository_dispatch: content-update)이 재빌드/재배포
//    → 프리렌더 HTML + sitemap.xml + IndexNow 핑까지 자동 갱신
// 3. 연속 편집으로 디바운스가 무한 연장되지 않도록 최대 대기 30분 제한
//
// App Runner 단일 인스턴스 전제로 in-memory 타이머 사용 (Redis 불필요)

import { config } from "../config";
import { createLogger } from "../utils/logger";

const logger = createLogger("SearchPing");

// 마지막 변경 후 10분 대기 (연속 편집을 1회 빌드로 묶음)
const REBUILD_DEBOUNCE_MS = 10 * 60 * 1000;
// 편집이 계속 이어져도 최초 예약 후 30분이 지나면 강제 발화
const REBUILD_MAX_WAIT_MS = 30 * 60 * 1000;

let rebuildTimer: NodeJS.Timeout | null = null;
let firstScheduledAt: number | null = null;
const pendingReasons = new Set<string>();

/**
 * 프론트엔드 재빌드 예약 (디바운스)
 * 토큰 미설정 시 no-op이므로 라우트에서 조건 없이 호출해도 안전
 */
export function scheduleRebuild(reason: string): void {
  if (!config.github.isEnabled) return;

  pendingReasons.add(reason);
  const now = Date.now();

  if (firstScheduledAt === null) {
    firstScheduledAt = now;
  }

  // 최대 대기 초과 시 즉시 발화 (디바운스 무한 연장 방지)
  const elapsed = now - firstScheduledAt;
  const delay = Math.min(
    REBUILD_DEBOUNCE_MS,
    Math.max(0, REBUILD_MAX_WAIT_MS - elapsed)
  );

  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    void dispatchRebuild();
  }, delay);
  // 서버 종료를 막지 않도록 unref
  rebuildTimer.unref?.();

  logger.info("프론트엔드 재빌드 예약", {
    reason,
    delayMs: delay,
    pendingCount: pendingReasons.size,
  });
}

/**
 * GitHub repository_dispatch 호출 (event_type: content-update)
 */
async function dispatchRebuild(): Promise<void> {
  const reasons = Array.from(pendingReasons);
  pendingReasons.clear();
  rebuildTimer = null;
  firstScheduledAt = null;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${config.github.frontendRepo}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.github.dispatchToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "content-update",
          client_payload: { reasons, triggeredAt: new Date().toISOString() },
        }),
      }
    );

    // 성공 시 204 No Content 반환
    if (response.status === 204) {
      logger.info("프론트엔드 재빌드 트리거 성공", { reasons });
    } else {
      const body = await response.text();
      logger.error("프론트엔드 재빌드 트리거 실패", {
        status: response.status,
        body: body.slice(0, 300),
      });
    }
  } catch (error) {
    logger.error("프론트엔드 재빌드 트리거 오류", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
