import { db } from "../db";
import { categories, products } from "../../shared/schema";

/**
 * 샘플 데이터 생성 스크립트
 *
 * 사용법:
 * npx tsx server/scripts/seed-data.ts
 */

async function seedData() {
  try {
    console.log("샘플 데이터 생성 중...");

    // 1. 카테고리 생성
    console.log("\n1. 카테고리 생성...");
    const categoriesData = [
      {
        name: "전자제품",
        slug: "electronics",
        description: "최신 전자기기 및 액세서리",
      },
      {
        name: "의류",
        slug: "clothing",
        description: "패션 의류 및 액세서리",
      },
      {
        name: "도서",
        slug: "books",
        description: "다양한 장르의 도서",
      },
      {
        name: "식품",
        slug: "food",
        description: "신선한 식품 및 간식",
      },
      {
        name: "가전제품",
        slug: "appliances",
        description: "생활 가전제품",
      },
    ];

    const createdCategories = await db
      .insert(categories)
      .values(categoriesData)
      .returning();

    console.log(`✅ ${createdCategories.length}개 카테고리 생성 완료`);

    // 2. 상품 생성
    console.log("\n2. 상품 생성...");
    const productsData = [
      // 전자제품
      {
        name: "무선 블루투스 이어폰",
        slug: "wireless-earbuds",
        description: "고음질 무선 블루투스 이어폰, ANC 기능 탑재",
        price: "89000",
        originalPrice: "129000",
        categoryId: createdCategories[0].id,
        stockQuantity: 50,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800",
      },
      {
        name: "스마트워치",
        slug: "smart-watch",
        description: "건강 관리 및 알림 기능이 있는 스마트워치",
        price: "199000",
        categoryId: createdCategories[0].id,
        stockQuantity: 30,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
      },
      {
        name: "노트북 스탠드",
        slug: "laptop-stand",
        description: "인체공학적 디자인의 알루미늄 노트북 스탠드",
        price: "45000",
        categoryId: createdCategories[0].id,
        stockQuantity: 100,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800",
      },

      // 의류
      {
        name: "베이직 화이트 티셔츠",
        slug: "basic-white-tshirt",
        description: "100% 면 소재의 기본 티셔츠",
        price: "19000",
        originalPrice: "29000",
        categoryId: createdCategories[1].id,
        stockQuantity: 200,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",
      },
      {
        name: "데님 청바지",
        slug: "denim-jeans",
        description: "클래식 스트레이트 핏 데님 청바지",
        price: "59000",
        categoryId: createdCategories[1].id,
        stockQuantity: 80,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1542272604-787c3835535d?w=800",
      },

      // 도서
      {
        name: "프로그래밍 입문서",
        slug: "programming-basics",
        description: "초보자를 위한 프로그래밍 기초 학습서",
        price: "32000",
        categoryId: createdCategories[2].id,
        stockQuantity: 150,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=800",
      },
      {
        name: "Vue.js 완벽 가이드",
        slug: "vue-js-guide",
        description: "Vue 3 기반의 실무 프로젝트 완벽 가이드",
        price: "38000",
        categoryId: createdCategories[2].id,
        stockQuantity: 75,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800",
      },

      // 식품
      {
        name: "유기농 견과류 믹스",
        slug: "organic-nuts-mix",
        description: "건강한 유기농 견과류 모음",
        price: "15000",
        categoryId: createdCategories[3].id,
        stockQuantity: 120,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=800",
      },
      {
        name: "프리미엄 다크 초콜릿",
        slug: "premium-dark-chocolate",
        description: "카카오 함량 70% 프리미엄 다크 초콜릿",
        price: "12000",
        originalPrice: "15000",
        categoryId: createdCategories[3].id,
        stockQuantity: 90,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1511381939415-e44015466834?w=800",
      },

      // 가전제품
      {
        name: "무선 청소기",
        slug: "cordless-vacuum",
        description: "강력한 흡입력의 무선 청소기",
        price: "289000",
        originalPrice: "349000",
        categoryId: createdCategories[4].id,
        stockQuantity: 25,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1558317374-067fb5f30001?w=800",
      },
      {
        name: "커피 머신",
        slug: "coffee-machine",
        description: "전문가급 에스프레소 커피 머신",
        price: "450000",
        categoryId: createdCategories[4].id,
        stockQuantity: 15,
        isAvailable: true,
        imageUrl:
          "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800",
      },

      // 품절 상품 예시
      {
        name: "한정판 헤드폰",
        slug: "limited-headphones",
        description: "한정판 노이즈 캔슬링 헤드폰 (품절)",
        price: "350000",
        categoryId: createdCategories[0].id,
        stockQuantity: 0,
        isAvailable: false,
        imageUrl:
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
      },
    ];

    const createdProducts = await db
      .insert(products)
      .values(productsData)
      .returning();

    console.log(`✅ ${createdProducts.length}개 상품 생성 완료`);

    console.log("\n✅ 모든 샘플 데이터 생성 완료!");
    console.log("\n생성된 데이터:");
    console.log(`- 카테고리: ${createdCategories.length}개`);
    console.log(`- 상품: ${createdProducts.length}개`);

    process.exit(0);
  } catch (error) {
    console.error("❌ 샘플 데이터 생성 실패:", error);
    process.exit(1);
  }
}

seedData();
