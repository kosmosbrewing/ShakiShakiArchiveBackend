// server/routes/admin/product.routes.ts
// 관리자 상품 관리 라우트 (/api/admin/products/*)

import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated, isAdmin } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error.middleware";
import { insertProductSchema } from "@shared/schema";
import { meilisearchService } from "../../services/meilisearch.service";
import { createLogger } from "../../utils/logger";

const router = Router();
const logger = createLogger("AdminProduct");

/**
 * Meilisearch 인덱싱 헬퍼 함수
 * 인덱싱 결과를 반환하여 응답에 경고 정보 포함 가능
 */
async function tryMeilisearchIndex(
  action: () => Promise<void>,
  actionName: string
): Promise<{ success: boolean; warning?: string }> {
  try {
    await action();
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Meilisearch ${actionName} 실패`, { error: errorMessage });
    return {
      success: false,
      warning: `검색 인덱스 ${actionName}에 실패했습니다. 검색 결과에 반영되지 않을 수 있습니다.`,
    };
  }
}

// 상품 목록 조회 (관리자)
router.get("/", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const products = await storage.getProducts();
  res.json(products);
}));

// 상품 생성
router.post("/", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const validatedData = insertProductSchema.parse(req.body);
  const product = await storage.createProduct(validatedData);

  // Meilisearch 인덱싱 (동기로 변경하여 결과 확인)
  let searchIndexResult: { success: boolean; warning?: string };
  if (product.categoryId) {
    const category = await storage.getCategory(product.categoryId);
    searchIndexResult = await tryMeilisearchIndex(
      () => meilisearchService.indexProduct(product, category),
      "인덱싱"
    );
  } else {
    searchIndexResult = await tryMeilisearchIndex(
      () => meilisearchService.indexProduct(product),
      "인덱싱"
    );
  }

  // 경고가 있으면 응답에 포함
  res.json({
    ...product,
    ...(searchIndexResult.warning && { _warning: searchIndexResult.warning }),
  });
}));

// 상품 수정 (UUID 기반)
router.patch("/:id", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const product = await storage.updateProduct(
    req.params.id, // UUID 문자열
    req.body
  );
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  // Meilisearch 인덱스 업데이트 (동기로 변경하여 결과 확인)
  let searchIndexResult: { success: boolean; warning?: string };
  if (product.categoryId) {
    const category = await storage.getCategory(product.categoryId);
    searchIndexResult = await tryMeilisearchIndex(
      () => meilisearchService.updateProduct(product, category),
      "업데이트"
    );
  } else {
    searchIndexResult = await tryMeilisearchIndex(
      () => meilisearchService.updateProduct(product),
      "업데이트"
    );
  }

  // 경고가 있으면 응답에 포함
  res.json({
    ...product,
    ...(searchIndexResult.warning && { _warning: searchIndexResult.warning }),
  });
}));

// 상품 삭제 (UUID 기반)
router.delete("/:id", isAuthenticated, isAdmin, asyncHandler(async (req, res) => {
  const productId = req.params.id; // UUID 문자열
  await storage.deleteProduct(productId);

  // Meilisearch 인덱스에서 삭제 (동기로 변경하여 결과 확인)
  const searchIndexResult = await tryMeilisearchIndex(
    () => meilisearchService.deleteProduct(productId),
    "삭제"
  );

  res.json({
    message: "Product deleted",
    ...(searchIndexResult.warning && { _warning: searchIndexResult.warning }),
  });
}));

export default router;
