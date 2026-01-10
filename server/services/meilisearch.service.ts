// server/services/meilisearch.service.ts
// Meilisearch 검색 엔진 서비스

import { MeiliSearch, Index, SearchParams, SearchResponse } from "meilisearch";
import { config } from "../config";
import type { Product, Category } from "@shared/schema";
import { createLogger } from "../utils/logger";

const logger = createLogger("Meilisearch");

// 검색용 상품 문서 타입
export interface ProductDocument {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  categoryId: number | null;
  categoryName: string | null;
  categorySlug: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  createdAt: number; // timestamp for sorting
  updatedAt: number;
}

// 검색 결과 타입
export interface ProductSearchResult {
  hits: ProductDocument[];
  query: string;
  processingTimeMs: number;
  estimatedTotalHits: number;
  limit: number;
  offset: number;
}

// 검색 필터 옵션
export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  categoryId?: number;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: "price_asc" | "price_desc" | "newest" | "oldest";
}

// Meilisearch 서비스 클래스
class MeilisearchService {
  private client: MeiliSearch | null = null;
  private productsIndex: Index | null = null;
  private initialized = false;

  /**
   * Meilisearch 클라이언트 초기화
   */
  async initialize(): Promise<void> {
    if (!config.meilisearch.isEnabled) {
      logger.info("비활성화됨 (MEILISEARCH_HOST 미설정)");
      return;
    }

    try {
      this.client = new MeiliSearch({
        host: config.meilisearch.host,
        apiKey: config.meilisearch.apiKey || undefined,
      });

      // 연결 테스트
      const health = await this.client.health();
      logger.info("연결됨", { status: health.status });

      // 인덱스 설정
      await this.setupIndexes();
      this.initialized = true;
    } catch (error) {
      logger.error("초기화 실패", { error: error instanceof Error ? error.message : String(error) });
      this.client = null;
    }
  }

  /**
   * 인덱스 설정 및 필터/정렬 속성 구성
   */
  private async setupIndexes(): Promise<void> {
    if (!this.client) return;

    const indexName = config.meilisearch.indexes.products;

    // 인덱스 생성 또는 가져오기
    try {
      await this.client.createIndex(indexName, { primaryKey: "id" });
      logger.info("인덱스 생성됨", { indexName });
    } catch {
      // 이미 존재하는 경우 무시
    }

    this.productsIndex = this.client.index(indexName);

    // 필터 가능한 속성 설정
    await this.productsIndex.updateFilterableAttributes([
      "categoryId",
      "categorySlug",
      "price",
      "isAvailable",
      "stockQuantity",
    ]);

    // 정렬 가능한 속성 설정
    await this.productsIndex.updateSortableAttributes([
      "price",
      "createdAt",
      "name",
    ]);

    // 검색 가능한 속성 설정 (가중치 순서)
    await this.productsIndex.updateSearchableAttributes([
      "name", // 가장 높은 가중치
      "description",
      "categoryName",
    ]);

    // 동의어 설정 (한국어 검색 개선)
    await this.productsIndex.updateSynonyms({
      // 의류 관련
      옷: ["의류", "패션", "웨어"],
      상의: ["탑", "티셔츠", "셔츠", "블라우스"],
      하의: ["팬츠", "바지", "스커트", "치마"],
      아우터: ["자켓", "코트", "점퍼", "외투"],
      // 빈티지 관련
      빈티지: ["레트로", "구제", "중고"],
      // 사이즈 관련
      프리사이즈: ["free", "원사이즈"],
    });

    logger.info("인덱스 설정 완료", { indexName });
  }

  /**
   * 서비스 활성화 여부 확인
   */
  isEnabled(): boolean {
    return this.initialized && this.client !== null;
  }

  /**
   * Product + Category 데이터를 검색 문서로 변환
   */
  productToDocument(
    product: Product,
    category?: Category | null
  ): ProductDocument {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: Number(product.price),
      originalPrice: product.originalPrice
        ? Number(product.originalPrice)
        : null,
      categoryId: product.categoryId,
      categoryName: category?.name || null,
      categorySlug: category?.slug || null,
      imageUrl: product.imageUrl,
      isAvailable: product.isAvailable,
      createdAt: new Date(product.createdAt).getTime(),
      updatedAt: new Date(product.updatedAt).getTime(),
    };
  }

  /**
   * 단일 상품 인덱싱
   */
  async indexProduct(
    product: Product,
    category?: Category | null
  ): Promise<void> {
    if (!this.isEnabled() || !this.productsIndex) {
      return;
    }

    try {
      const document = this.productToDocument(product, category);
      await this.productsIndex.addDocuments([document]);
      logger.debug("상품 인덱싱", { productName: product.name });
    } catch (error) {
      logger.error("상품 인덱싱 실패", { productId: product.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 여러 상품 일괄 인덱싱
   */
  async indexProducts(
    products: Product[],
    categories: Map<number, Category>
  ): Promise<void> {
    if (!this.isEnabled() || !this.productsIndex) {
      return;
    }

    try {
      const documents = products.map((product) => {
        const category = product.categoryId
          ? categories.get(product.categoryId)
          : null;
        return this.productToDocument(product, category);
      });

      const task = await this.productsIndex.addDocuments(documents);
      logger.info("상품 일괄 인덱싱 시작", { count: documents.length, taskUid: task.taskUid });
    } catch (error) {
      logger.error("일괄 인덱싱 실패", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 상품 인덱스 업데이트
   */
  async updateProduct(
    product: Product,
    category?: Category | null
  ): Promise<void> {
    // addDocuments는 upsert 방식으로 동작
    await this.indexProduct(product, category);
  }

  /**
   * 상품 인덱스에서 삭제
   */
  async deleteProduct(productId: string): Promise<void> {
    if (!this.isEnabled() || !this.productsIndex) {
      return;
    }

    try {
      await this.productsIndex.deleteDocument(productId);
      logger.debug("상품 삭제", { productId });
    } catch (error) {
      logger.error("상품 삭제 실패", { productId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 전체 인덱스 재구축 (모든 상품 다시 인덱싱)
   */
  async rebuildIndex(
    products: Product[],
    categories: Map<number, Category>
  ): Promise<void> {
    if (!this.isEnabled() || !this.productsIndex) {
      logger.info("비활성화 상태 - 인덱스 재구축 스킵");
      return;
    }

    try {
      // 기존 문서 모두 삭제
      await this.productsIndex.deleteAllDocuments();
      logger.info("기존 인덱스 삭제 완료");

      // 새로 인덱싱
      await this.indexProducts(products, categories);
      logger.info("인덱스 재구축 완료");
    } catch (error) {
      logger.error("인덱스 재구축 실패", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * 상품 검색
   */
  async searchProducts(options: SearchOptions): Promise<ProductSearchResult> {
    const {
      query,
      limit = 20,
      offset = 0,
      categoryId,
      categorySlug,
      minPrice,
      maxPrice,
      inStock,
      sort,
    } = options;

    // Meilisearch 비활성화 시 빈 결과 반환
    if (!this.isEnabled() || !this.productsIndex) {
      return {
        hits: [],
        query,
        processingTimeMs: 0,
        estimatedTotalHits: 0,
        limit,
        offset,
      };
    }

    try {
      // 필터 조건 구성
      const filters: string[] = [];

      if (categoryId) {
        filters.push(`categoryId = ${categoryId}`);
      }
      if (categorySlug) {
        filters.push(`categorySlug = "${categorySlug}"`);
      }
      if (minPrice !== undefined) {
        filters.push(`price >= ${minPrice}`);
      }
      if (maxPrice !== undefined) {
        filters.push(`price <= ${maxPrice}`);
      }
      if (inStock === true) {
        filters.push("isAvailable = true");
        filters.push("stockQuantity > 0");
      }

      // 정렬 조건 구성
      const sortOptions: string[] = [];
      switch (sort) {
        case "price_asc":
          sortOptions.push("price:asc");
          break;
        case "price_desc":
          sortOptions.push("price:desc");
          break;
        case "newest":
          sortOptions.push("createdAt:desc");
          break;
        case "oldest":
          sortOptions.push("createdAt:asc");
          break;
        default:
          // 기본: 관련성 순
          break;
      }

      const searchParams: SearchParams = {
        limit,
        offset,
        filter: filters.length > 0 ? filters.join(" AND ") : undefined,
        sort: sortOptions.length > 0 ? sortOptions : undefined,
      };

      const result: SearchResponse<ProductDocument> =
        await this.productsIndex.search(query, searchParams);

      return {
        hits: result.hits,
        query: result.query || query,
        processingTimeMs: result.processingTimeMs,
        estimatedTotalHits: result.estimatedTotalHits || result.hits.length,
        limit,
        offset,
      };
    } catch (error) {
      logger.error("검색 실패", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * 자동완성 (빠른 검색 제안)
   */
  async autocomplete(
    query: string,
    limit: number = 5
  ): Promise<{ id: string; name: string; slug: string }[]> {
    if (!this.isEnabled() || !this.productsIndex) {
      return [];
    }

    try {
      const result = await this.productsIndex.search(query, {
        limit,
        attributesToRetrieve: ["id", "name", "slug"],
      });

      return result.hits.map((hit) => ({
        id: hit.id,
        name: hit.name,
        slug: hit.slug,
      }));
    } catch (error) {
      logger.error("자동완성 실패", { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * 인덱스 상태 조회
   */
  async getIndexStats(): Promise<{
    numberOfDocuments: number;
    isIndexing: boolean;
  } | null> {
    if (!this.isEnabled() || !this.productsIndex) {
      return null;
    }

    try {
      const stats = await this.productsIndex.getStats();
      return {
        numberOfDocuments: stats.numberOfDocuments,
        isIndexing: stats.isIndexing,
      };
    } catch (error) {
      logger.error("상태 조회 실패", { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
}

// 싱글톤 인스턴스 export
export const meilisearchService = new MeilisearchService();
