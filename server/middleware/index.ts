// server/middleware/index.ts
// 미들웨어 내보내기

export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
} from "./error.middleware";
export {
  isAuthenticated,
  isAdmin,
  populateUser,
  invalidateUserCache,
} from "./auth.middleware";
export {
  loggerMiddleware,
  slowRequestLogger,
  log,
} from "./logger.middleware";
export {
  cacheControl,
  cacheStrategies,
  type CacheOptions,
} from "./cache.middleware";
export { etagMiddleware } from "./etag.middleware";
export {
  proxyHeadersMiddleware,
  debugHeadersMiddleware,
} from "./proxy-headers.middleware";
