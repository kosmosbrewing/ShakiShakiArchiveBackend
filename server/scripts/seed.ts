import { db } from "../db";
import { 
  categories, 
  products, 
  productVariants,
  users,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedDatabase() {
  try {
    console.log("🌱 데이터베이스 시드 시작...\n");

    // 1. 기존 데이터 확인
    const existingUsers = await db.select().from(users).limit(1);
    const existingCategories = await db.select().from(categories).limit(1);
    const existingProducts = await db.select().from(products).limit(1);

    if (existingUsers.length > 0 || existingCategories.length > 0 || existingProducts.length > 0) {
      console.log("📊 기존 데이터 발견:");
      if (existingUsers.length > 0) console.log("   - 사용자:", existingUsers.length, "명");
      if (existingCategories.length > 0) console.log("   - 카테고리:", existingCategories.length, "개");
      if (existingProducts.length > 0) console.log("   - 상품:", existingProducts.length, "개");
      console.log("\n💡 기존 데이터와 새 데이터를 통합합니다.\n");
    }

    // 2. 테스트 사용자 생성
    console.log("👤 테스트 사용자 생성 중...");
    const passwordHash = await bcrypt.hash("password123", 10);
    
    const adminUser = await db
      .insert(users)
      .values({
        email: "admin@example.com",
        passwordHash,
        userName: "관리자",
        isAdmin: true,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { isAdmin: true }
      })
      .returning()
      .then(r => r[0]);
    
    console.log(`   ✅ 관리자: admin@example.com (관리자)\n`);

    // 3. 카테고리 생성
    console.log("📁 카테고리 생성 중...");
    const categoryNames = [
      { name: "전자제품", slug: "electronics", description: "스마트폰, 노트북, 태블릿 등" },
      { name: "패션", slug: "fashion", description: "의류, 신발, 액세서리" },
      { name: "생활용품", slug: "lifestyle", description: "주방용품, 침구류, 가구" },
      { name: "뷰티", slug: "beauty", description: "화장품, 스킨케어" },
    ];

    const createdCategories = await Promise.all(
      categoryNames.map(cat =>
        db
          .insert(categories)
          .values(cat)
          .onConflictDoUpdate({
            target: categories.slug,
            set: cat
          })
          .returning()
          .then(r => r[0])
      )
    );

    console.log(`   ✅ ${createdCategories.length}개 카테고리 생성됨\n`);

    // 4. 상품 및 변종 생성
    console.log("📦 상품 및 사이즈 생성 중...");

    // 전자제품 상품
    const electronicsProducts = [
      {
        name: "Samsung Galaxy S24 Ultra",
        slug: "samsung-galaxy-s24-ultra",
        description: "최신형 삼성 갤럭시 S24 울트라",
        price: "1499.99",
        originalPrice: "1699.99",
        imageUrl: "https://via.placeholder.com/400?text=Galaxy+S24",
        images: [
          "https://via.placeholder.com/400?text=Galaxy+S24+Front",
          "https://via.placeholder.com/400?text=Galaxy+S24+Back",
          "https://via.placeholder.com/400?text=Galaxy+S24+Side"
        ],
        detailImages: [
          "https://via.placeholder.com/800?text=Display+Specs",
          "https://via.placeholder.com/800?text=Camera+Features",
          "https://via.placeholder.com/800?text=Performance",
          "https://via.placeholder.com/800?text=Battery"
        ],
        stockQuantity: 50,
        categoryId: createdCategories[0].id,
        variants: [
          { size: "256GB", sku: "S24-256GB", stockQuantity: 30 },
          { size: "512GB", sku: "S24-512GB", stockQuantity: 15 },
          { size: "1TB", sku: "S24-1TB", stockQuantity: 5 }
        ]
      },
      {
        name: "Apple MacBook Pro 16",
        slug: "apple-macbook-pro-16",
        description: "M4 Pro 칩이 탑재된 강력한 맥북",
        price: "2499.99",
        originalPrice: "2799.99",
        imageUrl: "https://via.placeholder.com/400?text=MacBook+Pro",
        images: [
          "https://via.placeholder.com/400?text=MacBook+Front",
          "https://via.placeholder.com/400?text=MacBook+Back",
          "https://via.placeholder.com/400?text=MacBook+Side"
        ],
        detailImages: [
          "https://via.placeholder.com/800?text=Display+XDR",
          "https://via.placeholder.com/800?text=Processor+M4",
          "https://via.placeholder.com/800?text=Battery+Life",
          "https://via.placeholder.com/800?text=Connectivity"
        ],
        stockQuantity: 30,
        categoryId: createdCategories[0].id,
        variants: [
          { size: "M4 Pro", sku: "MBP-M4PRO", stockQuantity: 15 },
          { size: "M4 Max", sku: "MBP-M4MAX", stockQuantity: 15 }
        ]
      }
    ];

    // 패션 상품
    const fashionProducts = [
      {
        name: "Nike Air Force 1",
        slug: "nike-air-force-1",
        description: "클래식 화이트 스니커즈",
        price: "120.00",
        originalPrice: "150.00",
        imageUrl: "https://via.placeholder.com/400?text=Nike+Air+Force",
        images: [
          "https://via.placeholder.com/400?text=Shoe+Front",
          "https://via.placeholder.com/400?text=Shoe+Side",
          "https://via.placeholder.com/400?text=Shoe+Top"
        ],
        detailImages: [
          "https://via.placeholder.com/800?text=Comfort+Features",
          "https://via.placeholder.com/800?text=Materials",
          "https://via.placeholder.com/800?text=Size+Guide",
          "https://via.placeholder.com/800?text=Care+Instructions"
        ],
        stockQuantity: 100,
        categoryId: createdCategories[1].id,
        variants: [
          { size: "6", color: "White", sku: "AF1-6-WHT", stockQuantity: 25 },
          { size: "7", color: "White", sku: "AF1-7-WHT", stockQuantity: 25 },
          { size: "8", color: "White", sku: "AF1-8-WHT", stockQuantity: 25 },
          { size: "9", color: "White", sku: "AF1-9-WHT", stockQuantity: 25 }
        ]
      },
      {
        name: "Gucci Classic Handbag",
        slug: "gucci-classic-handbag",
        description: "명품 구찌 핸드백",
        price: "1200.00",
        originalPrice: "1500.00",
        imageUrl: "https://via.placeholder.com/400?text=Gucci+Bag",
        images: [
          "https://via.placeholder.com/400?text=Bag+Front",
          "https://via.placeholder.com/400?text=Bag+Side",
          "https://via.placeholder.com/400?text=Bag+Open"
        ],
        detailImages: [
          "https://via.placeholder.com/800?text=Premium+Leather",
          "https://via.placeholder.com/800?text=Signature+Detail",
          "https://via.placeholder.com/800?text=Interior+Design",
          "https://via.placeholder.com/800?text=Care+Guide"
        ],
        stockQuantity: 20,
        categoryId: createdCategories[1].id,
        variants: [
          { size: "Large", color: "Black", sku: "GUCCI-L-BLK", stockQuantity: 10 },
          { size: "Large", color: "Brown", sku: "GUCCI-L-BRN", stockQuantity: 10 }
        ]
      }
    ];

    // 생활용품
    const lifestyleProducts = [
      {
        name: "Dyson V15 Vacuum",
        slug: "dyson-v15-vacuum",
        description: "강력한 무선 청소기",
        price: "799.99",
        originalPrice: "999.99",
        imageUrl: "https://via.placeholder.com/400?text=Dyson+V15",
        images: [
          "https://via.placeholder.com/400?text=Vacuum+Front",
          "https://via.placeholder.com/400?text=Vacuum+Attached",
          "https://via.placeholder.com/400?text=Vacuum+Detail"
        ],
        detailImages: [
          "https://via.placeholder.com/800?text=Suction+Power",
          "https://via.placeholder.com/800?text=Battery+60min",
          "https://via.placeholder.com/800?text=Smart+Sensor",
          "https://via.placeholder.com/800?text=Filter+Technology"
        ],
        stockQuantity: 15,
        categoryId: createdCategories[2].id,
        variants: [
          { size: "Standard", sku: "DYSON-V15", stockQuantity: 15 }
        ]
      }
    ];

    // 뷰티
    const beautyProducts = [
      {
        name: "SK-II Facial Treatment Essence",
        slug: "sk2-facial-treatment",
        description: "프리미엄 한방 스킨케어 에센스",
        price: "99.00",
        originalPrice: "120.00",
        imageUrl: "https://via.placeholder.com/400?text=SK-II",
        images: [
          "https://via.placeholder.com/400?text=Bottle+Front",
          "https://via.placeholder.com/400?text=Bottle+Back",
          "https://via.placeholder.com/400?text=Product+Detail"
        ],
        detailImages: [
          "https://via.placeholder.com/800?text=Ingredients",
          "https://via.placeholder.com/800?text=Benefits",
          "https://via.placeholder.com/800?text=How+To+Use",
          "https://via.placeholder.com/800?text=Before+After"
        ],
        stockQuantity: 200,
        categoryId: createdCategories[3].id,
        variants: [
          { size: "160ml", sku: "SK2-160", stockQuantity: 100 },
          { size: "240ml", sku: "SK2-240", stockQuantity: 100 }
        ]
      }
    ];

    const allProducts = [
      ...electronicsProducts,
      ...fashionProducts,
      ...lifestyleProducts,
      ...beautyProducts
    ];

    // 상품 및 변종 생성
    for (const productData of allProducts) {
      const { variants, ...product } = productData;
      
      const createdProduct = await db
        .insert(products)
        .values(product as any)
        .onConflictDoUpdate({
          target: products.slug,
          set: product as any
        })
        .returning()
        .then(r => r[0]);

      // 변종 추가
      if (variants && variants.length > 0) {
        await Promise.all(
          variants.map(variant =>
            db
              .insert(productVariants)
              .values({
                productId: createdProduct.id,
                size: variant.size,
                sku: variant.sku,
                stockQuantity: variant.stockQuantity,
                isAvailable: true
              })
              .onConflictDoUpdate({
                target: productVariants.sku,
                set: {
                  stockQuantity: variant.stockQuantity,
                  isAvailable: true
                }
              })
              .catch(() => {}) // SKU 중복 무시
          )
        );
      }
    }

    console.log(`   ✅ ${allProducts.length}개 상품 생성됨\n`);

    // 5. 요약
    const totalCategories = await db.select().from(categories);
    const totalProducts = await db.select().from(products);
    const totalVariants = await db.select().from(productVariants);

    console.log("✨ 데이터베이스 시드 완료!\n");
    console.log("📊 최종 현황:");
    console.log(`   - 카테고리: ${totalCategories.length}개`);
    console.log(`   - 상품: ${totalProducts.length}개`);
    console.log(`   - 변종(사이즈): ${totalVariants.length}개\n`);

    console.log("🔐 테스트 계정:");
    console.log(`   이메일: admin@example.com`);
    console.log(`   비밀번호: password123`);
    console.log(`   권한: 관리자\n`);

    console.log("🎉 시드 완료! 애플리케이션을 시작할 준비가 되었습니다.\n");

  } catch (error) {
    console.error("❌ 시드 실패:", error);
    process.exit(1);
  }
}

seedDatabase();
