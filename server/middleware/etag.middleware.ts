// server/middleware/etag.middleware.ts
// ETag 기반 조건부 요청 미들웨어

import { Request, Response, NextFunction } from "express";
import etag from "etag";

/**
 * ETag 미들웨어
 *
 * GET 요청에 대해 응답의 ETag를 생성하고,
 * If-None-Match 헤더와 비교하여 304 Not Modified를 반환합니다.
 *
 * 동작 방식:
 * 1. 응답 본문을 캡처하여 ETag 해시 생성
 * 2. If-None-Match 헤더와 비교
 * 3. 동일하면 304 Not Modified (본문 없음, Cache-Control 헤더 유지)
 * 4. 다르면 200 OK (전체 응답)
 *
 * 사용처:
 * - 공개 API (products, categories, constants, site-images)
 * - 자주 변경되지 않는 리소스
 *
 * 주의:
 * - POST/PUT/DELETE 등 변경 요청에는 적용하지 않음
 * - 압축 미들웨어 전에 적용해야 압축 전 본문으로 ETag 생성
 * - 304 응답 시에도 Cache-Control 헤더가 포함되어야 브라우저가 캐시 정책을 재설정
 */
export const etagMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // GET 요청만 처리
    if (req.method !== "GET") {
      return next();
    }

    // 원본 res.json 백업
    const originalJson = res.json.bind(res);

    // res.json 오버라이드
    res.json = function (body: any): Response {
      // 응답 본문을 JSON 문자열로 변환
      const content = JSON.stringify(body);

      // ETag 생성 (weak ETag 사용: W/"hash")
      const generatedEtag = etag(content, { weak: true });

      // ETag 헤더 설정
      res.setHeader("ETag", generatedEtag);

      // If-None-Match 헤더 확인
      const clientEtag = req.headers["if-none-match"];

      if (clientEtag && clientEtag === generatedEtag) {
        // ETag가 일치하면 304 Not Modified 반환
        // ✅ Express는 이미 설정된 헤더(Cache-Control, Vary 등)를 자동으로 유지
        // res.status(304)는 헤더를 지우지 않으므로 cacheControl 미들웨어에서
        // 설정한 Cache-Control과 Vary 헤더가 그대로 전달됨
        res.status(304).end();
        return res;
      }

      // ETag가 다르거나 없으면 정상 응답
      // ✅ 성능 개선: 이미 stringify한 content를 재사용
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(content);
      return res;
    };

    next();
  };
};
