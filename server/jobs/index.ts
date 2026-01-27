// server/jobs/index.ts
// 스케줄러 통합 모듈

export {
  startAutoConfirmScheduler,
  runAutoConfirmManually,
} from "./auto-confirm.job";

import { startAutoConfirmScheduler } from "./auto-confirm.job";
import { createLogger } from "../utils/logger";

const logger = createLogger("Jobs");

/**
 * 모든 스케줄러 시작
 */
export function initializeSchedulers(): void {
  logger.info("스케줄러 초기화 시작");

  // 자동 구매확정 스케줄러
  startAutoConfirmScheduler();

  logger.info("스케줄러 초기화 완료");
}
