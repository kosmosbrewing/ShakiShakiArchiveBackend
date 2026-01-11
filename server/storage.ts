import {
  users,
  products,
  categories,
  cartItems,
  orders,
  orderItems,
  productVariants,
  productSizeMeasurements,
  deliveryAddresses,
  wishlistItems,
  emailVerifications,
  siteImages,
  inquiries,
  inquiryReplies,
  type User,
  type UpsertUser,
  type Product,
  type InsertProduct,
  type Category,
  type InsertCategory,
  type CartItem,
  type InsertCartItem,
  type Order,
  type InsertOrder,
  type OrderItem,
  type ProductVariant,
  type InsertProductVariant,
  type ProductSizeMeasurement,
  type InsertProductSizeMeasurement,
  type DeliveryAddress,
  type InsertDeliveryAddress,
  type WishlistItem,
  type EmailVerification,
  type InsertEmailVerification,
  type SiteImage,
  type InsertSiteImage,
  type SiteImageType,
  type Inquiry,
  type InsertInquiry,
  type InquiryReply,
  type InsertInquiryReply,
  type InquiryType,
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, like, desc, isNull, gt, lt, count, sql } from "drizzle-orm";
import { createLogger } from "./utils/logger";
import type {
  OrderItemCreateData,
  OrderStatusUpdate,
  OrderItemStatusUpdate,
  StockLockResult,
  ConfirmPaymentData,
} from "./types";
import { getKSTDate } from "./utils/date";

export interface IStorage {
  // User operations (UUID 기반)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByNaverId(naverId: string): Promise<User | undefined>;
  getUserByKakaoId(kakaoId: string): Promise<User | undefined>;
  createUser(user: Omit<UpsertUser, "id">): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, user: Partial<UpsertUser>): Promise<User | undefined>;

  // Admin user management operations (관리자 전용 회원 관리)
  getAdminUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<{
    users: User[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }>;
  getAdminUserDetail(userId: string): Promise<
    | (User & {
        stats: {
          totalOrders: number;
          totalSpent: number;
          lastOrderDate: string | null;
          totalInquiries: number;
        };
      })
    | undefined
  >;

  // Product operations (UUID 기반)
  getProducts(filters?: {
    search?: string;
    categoryId?: number;
  }): Promise<(Product & { totalStock: number })[]>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductBySlug(slug: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(
    id: string,
    product: Partial<InsertProduct>
  ): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;

  // Product variant operations (모두 UUID 기반)
  getProductVariants(productId: string): Promise<ProductVariant[]>;
  getProductVariant(id: string): Promise<ProductVariant | undefined>;
  createProductVariant(variant: InsertProductVariant): Promise<ProductVariant>;
  updateProductVariant(
    id: string,
    variant: Partial<InsertProductVariant>
  ): Promise<ProductVariant | undefined>;
  deleteProductVariant(id: string): Promise<void>;

  // Product size measurements operations (모두 UUID 기반)
  getProductSizeMeasurements(
    productVariantId: string
  ): Promise<ProductSizeMeasurement[]>;
  getProductSizeMeasurement(
    id: string
  ): Promise<ProductSizeMeasurement | undefined>;
  createProductSizeMeasurement(
    measurement: InsertProductSizeMeasurement
  ): Promise<ProductSizeMeasurement>;
  updateProductSizeMeasurement(
    id: string,
    measurement: Partial<InsertProductSizeMeasurement>
  ): Promise<ProductSizeMeasurement | undefined>;
  deleteProductSizeMeasurement(id: string): Promise<void>;

  // Category operations
  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(
    id: number,
    category: Partial<InsertCategory>
  ): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<void>;

  // Cart operations (UUID 기반)
  getCartItems(userId: string): Promise<(CartItem & { product: Product })[]>;
  addCartItem(item: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: string, quantity: number): Promise<CartItem | undefined>;
  deleteCartItem(id: string): Promise<void>;
  clearCart(userId: string): Promise<void>;

  // Wishlist operations (UUID 기반)
  getWishlistItems(
    userId: string
  ): Promise<(WishlistItem & { product: Product })[]>;
  addWishlistItem(userId: string, productId: string): Promise<WishlistItem>;
  deleteWishlistItem(userId: string, productId: string): Promise<void>;

  // Order operations (UUID 기반)
  createOrder(
    order: InsertOrder,
    items: OrderItemCreateData[]
  ): Promise<string>; // UUID 반환
  getOrders(userId: string): Promise<Order[]>;
  getOrder(
    orderId: string
  ): Promise<
    (Order & { orderItems: (OrderItem & { product: Product })[] }) | undefined
  >;
  getAllOrders(): Promise<Order[]>;
  getAllOrdersWithItems(): Promise<
    (Order & { orderItems: (OrderItem & { product: Product | null })[] })[]
  >;

  updateOrderStatus(
    orderId: string, // UUID
    status: string,
    trackingNumber?: string
  ): Promise<Order | undefined>;

  updateOrderItemStatus(
    itemId: number, // serial
    status: string,
    trackingNumber?: string
  ): Promise<OrderItem | undefined>;

  deleteOrder(orderId: string): Promise<void>;

  // 결제 관련 메서드 (PG사 통합: 토스페이먼츠, 네이버페이 등)
  updateOrderPayment(
    orderId: string, // UUID
    paymentData: {
      paymentProvider: string; // 'toss', 'naverpay', 'kakaopay' 등
      paymentKey: string;
      externalOrderId: string;
      paymentMethod?: string;
      status: string;
      paidAt?: Date;
    }
  ): Promise<Order | undefined>;

  getOrderByExternalOrderId(
    externalOrderId: string
  ): Promise<Order | undefined>;

  cancelOrderPayment(
    orderId: string, // UUID
    cancelData: {
      status: string;
      canceledAt: Date;
      cancelReason: string;
      refundedAmount?: string;
    }
  ): Promise<Order | undefined>;

  // 소프트 락 기반 결제 승인 (재고 확인 및 차감)
  confirmOrderWithStockLock(
    orderId: string,
    paymentData: ConfirmPaymentData
  ): Promise<StockLockResult>;

  // 주문 취소 시 재고 복구
  restoreStockOnCancel(orderId: string): Promise<void>;

  // 🔒 Cron Job 전용: 재고 복구 + 주문 삭제 (원자적 트랜잭션)
  restoreStockAndDeleteOrder(orderId: string): Promise<void>;

  // 🔒 트랜잭션 기반 결제 전 취소 (재고 복구 + 주문/아이템 상태 업데이트)
  cancelOrderBeforePayment(
    orderId: string,
    cancelData: {
      cancelReason: string;
      restoreStock: boolean;
    }
  ): Promise<Order | undefined>;

  // 주문 취소 시 장바구니 복구
  restoreCartItemsFromOrder(userId: string, orderId: string): Promise<void>;

  // Delivery Address operations (UUID 기반)
  getDeliveryAddresses(userId: string): Promise<DeliveryAddress[]>;
  createDeliveryAddress(
    address: InsertDeliveryAddress
  ): Promise<DeliveryAddress>;
  updateDeliveryAddress(
    id: string, // UUID
    userId: string,
    address: Partial<InsertDeliveryAddress>
  ): Promise<DeliveryAddress | undefined>;
  deleteDeliveryAddress(id: string, userId: string): Promise<void>;

  // Email Verification operations
  createEmailVerification(
    verification: InsertEmailVerification
  ): Promise<EmailVerification>;
  getValidVerification(
    email: string,
    code: string,
    type: string
  ): Promise<EmailVerification | undefined>;
  markVerificationAsUsed(id: number): Promise<void>;
  deleteExpiredVerifications(): Promise<void>;
  isEmailVerified(email: string, type: string): Promise<boolean>;

  // Site Image operations (Hero, Marquee)
  getSiteImages(type?: SiteImageType): Promise<SiteImage[]>;
  getSiteImage(id: number): Promise<SiteImage | undefined>;
  createSiteImage(image: InsertSiteImage): Promise<SiteImage>;
  updateSiteImage(
    id: number,
    image: Partial<InsertSiteImage>
  ): Promise<SiteImage | undefined>;
  deleteSiteImage(id: number): Promise<void>;
  countSiteImagesByType(type: SiteImageType): Promise<number>;

  // Inquiry (Q&A) operations
  getInquiries(filters?: {
    userId?: string;
    productId?: string;
    type?: InquiryType;
    status?: string;
  }): Promise<(Inquiry & { user: User; product?: Product | null })[]>;
  getInquiry(
    id: string
  ): Promise<
    | (Inquiry & {
        user: User;
        product?: Product | null;
        replies: (InquiryReply & { user: User })[];
      })
    | undefined
  >;
  createInquiry(inquiry: InsertInquiry): Promise<Inquiry>;
  updateInquiryStatus(
    id: string,
    status: string
  ): Promise<Inquiry | undefined>;
  deleteInquiry(id: string): Promise<void>;

  // Inquiry Reply operations
  createInquiryReply(reply: InsertInquiryReply): Promise<InquiryReply>;
  deleteInquiryReply(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ------------------------------------------------------------------
  // User operations (UUID 기반)
  // ------------------------------------------------------------------
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByNaverId(naverId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.naverId, naverId));
    return user;
  }

  async getUserByKakaoId(kakaoId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.kakaoId, kakaoId));
    return user;
  }

  async createUser(userData: Omit<UpsertUser, "id">): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: getKSTDate(),
        },
      })
      .returning();
    return user;
  }

  async updateUser(
    id: string, // UUID
    userData: Partial<UpsertUser>
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        ...userData,
        updatedAt: getKSTDate(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  // ------------------------------------------------------------------
  // Admin user management operations (관리자 전용 회원 관리)
  // ------------------------------------------------------------------
  async getAdminUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<{
    users: User[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    // 기본값 설정
    const page = params.page || 1;
    const limit = params.limit || 20;
    const search = params.search || "";
    const sortBy = params.sortBy || "createdAt";
    const sortOrder = params.sortOrder || "desc";
    const offset = (page - 1) * limit;

    // 검색 조건 구성 (이름, 이메일, 전화번호 검색)
    const conditions = [];
    if (search.trim()) {
      conditions.push(
        sql`(
          ${users.userName} ILIKE ${`%${search}%`} OR
          ${users.email} ILIKE ${`%${search}%`} OR
          ${users.phone} ILIKE ${`%${search}%`}
        )`
      );
    }

    // 정렬 필드 검증 (SQL Injection 방지)
    const allowedSortFields = ["createdAt", "userName", "email", "updatedAt"];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";

    // 정렬 컬럼 매핑
    const sortColumn =
      safeSortBy === "createdAt"
        ? users.createdAt
        : safeSortBy === "userName"
        ? users.userName
        : safeSortBy === "email"
        ? users.email
        : users.updatedAt;

    // 총 개수 조회
    let countQuery = db.select({ count: count() }).from(users);
    if (conditions.length > 0) {
      // @ts-ignore: Drizzle SQL builder type complexity
      countQuery = countQuery.where(and(...conditions));
    }
    const [countResult] = await countQuery;
    const total = countResult?.count ?? 0;

    // 회원 목록 조회 (비밀번호 해시 제외)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let usersQuery: any = db
      .select({
        id: users.id,
        email: users.email,
        userName: users.userName,
        zipCode: users.zipCode,
        address: users.address,
        detailAddress: users.detailAddress,
        phone: users.phone,
        emailOptIn: users.emailOptIn,
        profileImageUrl: users.profileImageUrl,
        isAdmin: users.isAdmin,
        naverId: users.naverId,
        kakaoId: users.kakaoId,
        socialProvider: users.socialProvider,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users);

    if (conditions.length > 0) {
      usersQuery = usersQuery.where(and(...conditions));
    }

    // 정렬 적용
    usersQuery =
      sortOrder === "asc"
        ? usersQuery.orderBy(sortColumn)
        : usersQuery.orderBy(desc(sortColumn));

    // 페이지네이션 적용
    usersQuery = usersQuery.limit(limit).offset(offset);

    const usersList = await usersQuery;

    // 응답 구성
    const totalPages = Math.ceil(total / limit);

    return {
      users: usersList as User[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async getAdminUserDetail(userId: string): Promise<
    | (User & {
        stats: {
          totalOrders: number;
          totalSpent: number;
          lastOrderDate: string | null;
          totalInquiries: number;
        };
      })
    | undefined
  > {
    // 사용자 정보 조회
    const user = await this.getUser(userId);
    if (!user) return undefined;

    // 통계 정보 병렬 조회
    const [orderStats, inquiryStats] = await Promise.all([
      // 주문 통계
      db
        .select({
          totalOrders: count(),
          totalSpent: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
          lastOrderDate: sql<Date | null>`MAX(${orders.createdAt})`,
        })
        .from(orders)
        .where(eq(orders.userId, userId)),
      // 문의 통계
      db
        .select({ totalInquiries: count() })
        .from(inquiries)
        .where(eq(inquiries.userId, userId)),
    ]);

    const orderStat = orderStats[0];
    const inquiryStat = inquiryStats[0];

    // lastOrderDate를 안전하게 ISO 문자열로 변환
    let lastOrderDateString: string | null = null;
    if (orderStat?.lastOrderDate) {
      try {
        // Date 객체인 경우 ISO 문자열로 변환
        lastOrderDateString = new Date(orderStat.lastOrderDate).toISOString();
      } catch (error) {
        // 변환 실패 시 null로 유지
        lastOrderDateString = null;
      }
    }

    return {
      ...user,
      stats: {
        totalOrders: orderStat?.totalOrders ?? 0,
        totalSpent: parseFloat(orderStat?.totalSpent ?? "0"),
        lastOrderDate: lastOrderDateString, // 항상 string | null
        totalInquiries: inquiryStat?.totalInquiries ?? 0,
      },
    };
  }

  // ------------------------------------------------------------------
  // Category operations
  // ------------------------------------------------------------------
  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug));
    return category;
  }
  // ------------------------------------------------------------------
  // Product operations
  // ------------------------------------------------------------------
  async getProducts(filters?: {
    search?: string;
    categoryId?: number;
  }): Promise<(Product & { totalStock: number })[]> {
    let query = db.select().from(products);

    const conditions = [];
    if (filters?.search) {
      conditions.push(like(products.name, `%${filters.search}%`));
    }
    if (filters?.categoryId) {
      conditions.push(eq(products.categoryId, filters.categoryId));
    }

    if (conditions.length > 0) {
      // @ts-ignore: Drizzle query builder type complexity
      query = query.where(and(...conditions));
    }

    const results = await query.orderBy(desc(products.updatedAt));

    // 각 상품의 variants 재고를 합산하여 totalStock 계산
    const productsWithStock = await Promise.all(
      results.map(async (product) => {
        const variants = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.productId, product.id));

        // 모든 variants의 stockQuantity 합산
        const totalStock = variants.reduce(
          (sum, variant) => sum + (variant.stockQuantity || 0),
          0
        );

        return {
          ...product,
          totalStock,
        };
      })
    );

    return productsWithStock;
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id));
    return product;
  }

  async getProductBySlug(slug: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.slug, slug));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(
    id: string, // UUID
    product: Partial<InsertProduct>
  ): Promise<Product | undefined> {
    const [updated] = await db
      .update(products)
      // updatedAt이 직접 전달되면 그 값을 사용, 아니면 현재 KST 시간으로 자동 갱신
      .set({ updatedAt: getKSTDate(), ...product })
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // ------------------------------------------------------------------
  // Product variant operations (모두 UUID 기반)
  // ------------------------------------------------------------------
  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    return await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(productVariants.size);
  }

  async getProductVariant(id: string): Promise<ProductVariant | undefined> {
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, id));
    return variant;
  }

  async createProductVariant(
    variant: InsertProductVariant
  ): Promise<ProductVariant> {
    const [newVariant] = await db
      .insert(productVariants)
      .values(variant)
      .returning();
    return newVariant;
  }

  async updateProductVariant(
    id: string,
    variant: Partial<InsertProductVariant>
  ): Promise<ProductVariant | undefined> {
    const [updated] = await db
      .update(productVariants)
      .set({ ...variant, updatedAt: getKSTDate() })
      .where(eq(productVariants.id, id))
      .returning();
    return updated;
  }

  async deleteProductVariant(id: string): Promise<void> {
    await db.delete(productVariants).where(eq(productVariants.id, id));
  }

  // ------------------------------------------------------------------
  // Product size measurements operations (모두 UUID 기반)
  // ------------------------------------------------------------------
  async getProductSizeMeasurements(
    productVariantId: string
  ): Promise<ProductSizeMeasurement[]> {
    return await db
      .select()
      .from(productSizeMeasurements)
      .where(eq(productSizeMeasurements.productVariantId, productVariantId));
  }

  async getProductSizeMeasurement(
    id: string
  ): Promise<ProductSizeMeasurement | undefined> {
    const [measurement] = await db
      .select()
      .from(productSizeMeasurements)
      .where(eq(productSizeMeasurements.id, id));
    return measurement;
  }

  async createProductSizeMeasurement(
    measurement: InsertProductSizeMeasurement
  ): Promise<ProductSizeMeasurement> {
    const [newMeasurement] = await db
      .insert(productSizeMeasurements)
      .values(measurement)
      .returning();
    return newMeasurement;
  }

  async updateProductSizeMeasurement(
    id: string,
    measurement: Partial<InsertProductSizeMeasurement>
  ): Promise<ProductSizeMeasurement | undefined> {
    const [updated] = await db
      .update(productSizeMeasurements)
      .set(measurement)
      .where(eq(productSizeMeasurements.id, id))
      .returning();
    return updated;
  }

  async deleteProductSizeMeasurement(id: string): Promise<void> {
    await db
      .delete(productSizeMeasurements)
      .where(eq(productSizeMeasurements.id, id));
  }

  // ------------------------------------------------------------------
  // Category operations
  // ------------------------------------------------------------------
  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories).orderBy(categories.name);
  }

  async getCategory(id: number): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id));
    return category;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db
      .insert(categories)
      .values(category)
      .returning();
    return newCategory;
  }

  async updateCategory(
    id: number,
    category: Partial<InsertCategory>
  ): Promise<Category | undefined> {
    const [updated] = await db
      .update(categories)
      .set(category)
      .where(eq(categories.id, id))
      .returning();
    return updated;
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // ------------------------------------------------------------------
  // Cart operations (UUID 기반)
  // ------------------------------------------------------------------
  async getCartItems(
    userId: string // UUID
  ): Promise<(CartItem & { product: Product; variant?: ProductVariant })[]> {
    const items = await db
      .select()
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      // [신규] 옵션 정보 가져오기 (Left Join: 옵션 없는 상품도 조회됨)
      .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .where(eq(cartItems.userId, userId));

    return items.map((item) => ({
      ...item.cart_items,
      product: item.products,
      // [신규] variant 정보 매핑 (없으면 undefined)
      variant: item.product_variants || undefined,
    }));
  }

  async addCartItem(item: InsertCartItem): Promise<CartItem> {
    // variantId 비교 조건 추가 (버그 수정: 같은 상품이라도 다른 옵션이면 별도 아이템)
    const conditions = [
      eq(cartItems.userId, item.userId),
      eq(cartItems.productId, item.productId),
    ];

    // variantId가 있으면 해당 조건 추가, 없으면 null 체크
    if (item.variantId) {
      conditions.push(eq(cartItems.variantId, item.variantId));
    } else {
      conditions.push(isNull(cartItems.variantId));
    }

    const existing = await db
      .select()
      .from(cartItems)
      .where(and(...conditions));

    if (existing.length > 0) {
      const [updated] = await db
        .update(cartItems)
        .set({ quantity: existing[0].quantity + (item.quantity || 1) })
        .where(eq(cartItems.id, existing[0].id))
        .returning();
      return updated;
    }

    const [newItem] = await db.insert(cartItems).values(item).returning();
    return newItem;
  }

  async updateCartItem(
    id: string, // UUID
    quantity: number
  ): Promise<CartItem | undefined> {
    const [updated] = await db
      .update(cartItems)
      .set({ quantity, updatedAt: getKSTDate() })
      .where(eq(cartItems.id, id))
      .returning();
    return updated;
  }

  async deleteCartItem(id: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearCart(userId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

  // ------------------------------------------------------------------
  // Wishlist operations (UUID 기반)
  // ------------------------------------------------------------------
  async getWishlistItems(
    userId: string // UUID
  ): Promise<(WishlistItem & { product: Product })[]> {
    const items = await db
      .select()
      .from(wishlistItems)
      .innerJoin(products, eq(wishlistItems.productId, products.id))
      .where(eq(wishlistItems.userId, userId))
      .orderBy(desc(wishlistItems.createdAt));

    return items.map((item) => ({
      ...item.wishlist_items,
      product: item.products,
    }));
  }

  async addWishlistItem(
    userId: string, // UUID
    productId: string // UUID
  ): Promise<WishlistItem> {
    // 중복 확인
    const existing = await db
      .select()
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.userId, userId),
          eq(wishlistItems.productId, productId)
        )
      );

    if (existing.length > 0) {
      return existing[0];
    }

    const [newItem] = await db
      .insert(wishlistItems)
      .values({ userId, productId })
      .returning();
    return newItem;
  }

  async deleteWishlistItem(userId: string, productId: string): Promise<void> {
    await db
      .delete(wishlistItems)
      .where(
        and(
          eq(wishlistItems.userId, userId),
          eq(wishlistItems.productId, productId)
        )
      );
  }

  // ------------------------------------------------------------------
  // Order operations (트랜잭션 적용, UUID 기반)
  // ------------------------------------------------------------------
  async createOrder(
    order: InsertOrder,
    items: OrderItemCreateData[]
  ): Promise<string> { // UUID 반환
    // 🔒 Option A: 주문 생성 시 재고 확인 + 차감 (Self-Lock Bypass 포함)
    const client = await pool.connect();
    const logger = createLogger("OrderCreate");

    // 🔒 수정: Size 정규화 함수 (Self-Lock Bypass 키 일치 보장)
    const normalizeSize = (size: string): string => {
      return size.trim().toLowerCase();
    };

    try {
      await client.query("BEGIN");

      logger.info("주문 생성 트랜잭션 시작", {
        userId: order.userId,
        totalAmount: order.totalAmount,
        itemCount: items.length,
      });

      // 1. 🔒 Self-Lock Bypass: 본인의 pending_payment/paying 주문 확인
      const userOrdersResult = await client.query(
        `SELECT oi.product_id, oi.quantity, oi.options
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.user_id = $1
           AND o.status IN ('pending_payment', 'paying')
           AND o.created_at > NOW() - INTERVAL '10 minutes'`,
        [order.userId]
      );

      // 본인의 주문 아이템을 Map으로 저장 (variantId -> quantity)
      const userReservedStock = new Map<string, number>();
      for (const item of userOrdersResult.rows) {
        // options에서 Size 추출 (Size: XXX 형식)
        let variantKey = item.product_id; // 기본값은 productId
        if (item.options) {
          const match = item.options.match(/Size:\s*(.+?)$/im);
          if (match) {
            const size = normalizeSize(match[1]); // 🔒 수정: 정규화 적용
            variantKey = `${item.product_id}-${size}`;
          }
        }

        const existing = userReservedStock.get(variantKey) || 0;
        userReservedStock.set(variantKey, existing + item.quantity);
      }

      logger.info("Self-Lock Bypass 확인", {
        userId: order.userId,
        existingOrderCount: userOrdersResult.rows.length,
        reservedItemCount: userReservedStock.size,
      });

      // 2. 재고 확인 및 차감 (Self-Lock Bypass 적용)
      const insufficientStock: { productName: string; requested: number; available: number }[] = [];

      for (const item of items) {
        // options에서 Size 추출
        let size: string | null = null;
        if (item.options) {
          const match = item.options.match(/Size:\s*(.+?)$/im);
          if (match) {
            size = match[1].trim();
          }
        }

        if (size) {
          // variant가 있는 경우: SELECT FOR UPDATE로 행 잠금
          const variantResult = await client.query(
            `SELECT pv.id, pv.stock_quantity, p.name as product_name
             FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
             WHERE pv.product_id = $1 AND pv.size = $2
             FOR UPDATE`,
            [item.productId, size]
          );

          if (variantResult.rows.length === 0) {
            await client.query("ROLLBACK");
            throw new Error(`상품 옵션을 찾을 수 없습니다: ${item.productName} (Size: ${size})`);
          }

          const variant = variantResult.rows[0];
          const availableStock = variant.stock_quantity;

          // 🔒 Self-Lock Bypass: 본인 차감 재고 복구
          const variantKey = `${item.productId}-${normalizeSize(size)}`; // 🔒 수정: 정규화 적용
          const userReserved = userReservedStock.get(variantKey) || 0;
          const effectiveStock = availableStock + userReserved;

          if (effectiveStock < item.quantity) {
            insufficientStock.push({
              productName: item.productName,
              requested: item.quantity,
              available: effectiveStock, // 🔒 수정: Self-Lock Bypass 적용된 재고 표시
            });
            continue; // 🔒 수정: 재고 부족 시 차감하지 않고 다음 아이템으로
          }

          // 재고 차감
          await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity - $1, updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, variant.id]
          );

          logger.info("재고 차감 완료", {
            productId: item.productId,
            size,
            quantity: item.quantity,
            before: availableStock,
            after: availableStock - item.quantity,
            selfLockBypass: userReserved > 0,
          });
        } else {
          // 🔒 수정: variant(옵션) 정보가 없으면 에러 (fallback 제거)
          await client.query("ROLLBACK");
          throw new Error(
            `상품 옵션 정보가 누락되었습니다: ${item.productName}. ` +
            `상품에 옵션(사이즈)이 있는 경우 반드시 선택해야 합니다.`
          );
        }
      }

      // 3. 재고 부족 시 롤백
      if (insufficientStock.length > 0) {
        await client.query("ROLLBACK");
        logger.warn("재고 부족으로 주문 생성 실패", {
          userId: order.userId,
          insufficientStock,
        });
        throw new Error(
          `재고가 부족합니다: ${insufficientStock.map(s => `${s.productName} (요청: ${s.requested}개, 재고: ${s.available}개)`).join(", ")}`
        );
      }

      // 4. 주문 생성
      const isStockReservedValue = order.isStockReserved ?? true;

      logger.info("🔍 주문 생성 - isStockReserved 값 확인", {
        userId: order.userId,
        receivedValue: order.isStockReserved,
        finalValue: isStockReservedValue,
        message: "✅ DB에 저장될 값",
      });

      const orderResult = await client.query(
        `INSERT INTO orders (user_id, total_amount, status, shipping_name, shipping_phone, shipping_postal_code, shipping_address, shipping_detail_address, shipping_request_note, external_order_id, is_stock_reserved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          order.userId,
          order.totalAmount,
          order.status,
          order.shippingName,
          order.shippingPhone,
          order.shippingPostalCode,
          order.shippingAddress,
          order.shippingDetailAddress || null,
          order.shippingRequestNote || null,
          order.externalOrderId || null,
          isStockReservedValue, // 🔒 CRITICAL: 주문 생성 시 재고 차감하므로 true (이중 차감 방지)
        ]
      );
      const orderId = orderResult.rows[0].id;

      logger.info("주문 테이블 삽입 완료", {
        orderId,
        isStockReserved: isStockReservedValue,
      });

      // 5. 주문 아이템 생성
      for (const item of items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, options, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            orderId,
            item.productId,
            item.productName,
            item.productPrice,
            item.quantity,
            item.options,
            "pending_payment",
          ]
        );
      }

      logger.info("주문 아이템 삽입 완료", { orderId, itemCount: items.length });

      await client.query("COMMIT");

      logger.info("주문 생성 완료", { orderId, userId: order.userId });

      return orderId;
    } catch (error) {
      await client.query("ROLLBACK");

      logger.error("주문 생성 실패", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined, // 🔒 수정: stack trace 추가
        userId: order.userId,
      });

      throw error;
    } finally {
      client.release();
    }
  }

  async getOrders(userId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async getOrder(
    orderId: string // UUID
  ): Promise<
    (Order & { orderItems: (OrderItem & { product: Product })[] }) | undefined
  > {
    // N+1 문제 해결: 단일 JOIN 쿼리로 주문과 주문 상품을 함께 조회
    const result = await db
      .select()
      .from(orders)
      .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orders.id, orderId));

    if (result.length === 0) return undefined;

    // 첫 번째 행에서 주문 정보 추출
    const order = result[0].orders;

    // 주문 상품 목록 구성 (orderItems가 null일 수 있음)
    const orderItemsList = result
      .filter((row) => row.order_items !== null)
      .map((row) => ({
        ...row.order_items!,
        product: row.products!,
      }));

    return {
      ...order,
      orderItems: orderItemsList,
    };
  }

  async getAllOrders(): Promise<Order[]> {
    return await db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async getAllOrdersWithItems(): Promise<
    (Order & { orderItems: (OrderItem & { product: Product | null })[] })[]
  > {
    // N+1 쿼리 개선: 단일 JOIN 쿼리로 모든 데이터 조회
    const result = await db
      .select()
      .from(orders)
      .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .orderBy(desc(orders.createdAt));

    // 결과를 주문별로 그룹화 (UUID 기반)
    const orderMap = new Map<
      string, // UUID
      Order & { orderItems: (OrderItem & { product: Product | null })[] }
    >();

    for (const row of result) {
      const orderId = row.orders.id;

      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          ...row.orders,
          orderItems: [],
        });
      }

      if (row.order_items) {
        orderMap.get(orderId)!.orderItems.push({
          ...row.order_items,
          product: row.products,
        });
      }
    }

    return Array.from(orderMap.values());
  }

  async updateOrderStatus(
    orderId: string, // UUID
    status: string,
    trackingNumber?: string
  ): Promise<Order | undefined> {
    // any 타입 제거: 명시적 타입 사용
    const updateData: OrderStatusUpdate = { status, updatedAt: getKSTDate() };
    if (trackingNumber !== undefined) {
      updateData.trackingNumber = trackingNumber;
    }

    const [updated] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async updateOrderItemStatus(
    itemId: number,
    status: string,
    trackingNumber?: string
  ): Promise<OrderItem | undefined> {
    // any 타입 제거: 명시적 타입 사용
    const updateData: OrderItemStatusUpdate = { status };
    if (trackingNumber !== undefined) {
      updateData.trackingNumber = trackingNumber;
    }

    const [updated] = await db
      .update(orderItems)
      .set(updateData)
      .where(eq(orderItems.id, itemId))
      .returning();
    return updated;
  }

  async deleteOrder(orderId: string): Promise<void> {
    // CASCADE로 인해 order_items도 자동 삭제됨
    await db.delete(orders).where(eq(orders.id, orderId));
  }

  // ------------------------------------------------------------------
  // 결제 관련 메서드 (PG사 통합: 토스페이먼츠, 네이버페이 등, UUID 기반)
  // ------------------------------------------------------------------
  async updateOrderPayment(
    orderId: string, // UUID
    paymentData: {
      paymentProvider: string;
      paymentKey: string;
      externalOrderId: string;
      paymentMethod?: string;
      status: string;
      paidAt?: Date;
    }
  ): Promise<Order | undefined> {
    // 🔒 트랜잭션으로 주문 및 주문 아이템 상태 동시 업데이트
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. 주문 상태 업데이트
      const orderResult = await client.query(
        `UPDATE orders
         SET payment_provider = $1,
             payment_key = $2,
             external_order_id = $3,
             payment_method = $4,
             status = $5,
             paid_at = $6,
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          paymentData.paymentProvider,
          paymentData.paymentKey,
          paymentData.externalOrderId,
          paymentData.paymentMethod || null,
          paymentData.status,
          paymentData.paidAt || null,
          orderId,
        ]
      );

      if (orderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return undefined;
      }

      // 2. 주문 아이템 상태 일괄 업데이트
      await client.query(
        `UPDATE order_items
         SET status = $1
         WHERE order_id = $2`,
        [paymentData.status, orderId]
      );

      await client.query("COMMIT");

      return orderResult.rows[0] as Order;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderByExternalOrderId(
    externalOrderId: string
  ): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.externalOrderId, externalOrderId));
    return order;
  }

  async cancelOrderPayment(
    orderId: string, // UUID
    cancelData: {
      status: string;
      canceledAt: Date;
      cancelReason: string;
      refundedAmount?: string;
    }
  ): Promise<Order | undefined> {
    // 🔒 트랜잭션으로 주문 및 주문 아이템 상태 동시 업데이트
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. 주문 상태 업데이트
      const orderResult = await client.query(
        `UPDATE orders
         SET status = $1,
             canceled_at = $2,
             cancel_reason = $3,
             refunded_amount = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          cancelData.status,
          cancelData.canceledAt,
          cancelData.cancelReason,
          cancelData.refundedAmount || null,
          orderId,
        ]
      );

      if (orderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return undefined;
      }

      // 2. 주문 아이템 상태 일괄 업데이트
      await client.query(
        `UPDATE order_items
         SET status = $1
         WHERE order_id = $2`,
        [cancelData.status, orderId]
      );

      await client.query("COMMIT");

      return orderResult.rows[0] as Order;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 소프트 락 기반 결제 승인 (재고 확인 및 차감)
  // PostgreSQL SELECT ... FOR UPDATE를 사용하여 동시성 제어
  // ------------------------------------------------------------------
  async confirmOrderWithStockLock(
    orderId: string,
    paymentData: ConfirmPaymentData
  ): Promise<StockLockResult> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. 주문 상태 확인 (이미 처리된 주문인지)
      const orderResult = await client.query(
        `SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return { success: false, orderId, error: "주문을 찾을 수 없습니다" };
      }

      const order = orderResult.rows[0];
      // pending_payment: 주문 생성 직후
      // paying: 결제창 오픈 후 (PUT /api/orders/:id/status/paying 호출 후)
      const validStatuses = ["pending_payment", "paying"];
      if (!validStatuses.includes(order.status)) {
        await client.query("ROLLBACK");
        return { success: false, orderId, error: "이미 처리된 주문입니다" };
      }

      // 2. 주문 아이템 조회 (옵션 정보 파싱하여 variant 확인)
      const itemsResult = await client.query(
        `SELECT oi.id, oi.product_id, oi.product_name, oi.quantity, oi.options,
                p.name as current_product_name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      const insufficientStock: StockLockResult["insufficientStock"] = [];

      // 3. 각 주문 아이템에 대해 재고 확인 및 차감
      for (const item of itemsResult.rows) {
        // 옵션에서 사이즈 추출 (예: "Size: M")
        let variantSize: string | null = null;
        if (item.options) {
          const match = item.options.match(/Size:\s*(\S+)/i);
          if (match) {
            variantSize = match[1];
          }
        }

        if (variantSize) {
          // variant가 있는 경우: SELECT ... FOR UPDATE로 행 잠금
          const variantResult = await client.query(
            `SELECT id, stock_quantity, size
             FROM product_variants
             WHERE product_id = $1 AND size = $2
             FOR UPDATE`,
            [item.product_id, variantSize]
          );

          if (variantResult.rows.length > 0) {
            const variant = variantResult.rows[0];
            const available = variant.stock_quantity;

            if (available < item.quantity) {
              // 재고 부족
              insufficientStock.push({
                productName: item.current_product_name,
                variantSize: variant.size,
                requested: item.quantity,
                available: available,
              });
            } else {
              // 재고 차감
              await client.query(
                `UPDATE product_variants
                 SET stock_quantity = stock_quantity - $1, updated_at = NOW()
                 WHERE id = $2`,
                [item.quantity, variant.id]
              );
            }
          } else {
            // variant를 찾을 수 없음
            insufficientStock.push({
              productName: item.current_product_name,
              variantSize: variantSize,
              requested: item.quantity,
              available: 0,
            });
          }
        } else {
          // variant가 없는 경우: 기본 variant(ONE_SIZE) 사용
          const variantResult = await client.query(
            `SELECT id, stock_quantity, size
             FROM product_variants
             WHERE product_id = $1
             ORDER BY created_at ASC
             LIMIT 1
             FOR UPDATE`,
            [item.product_id]
          );

          if (variantResult.rows.length > 0) {
            const variant = variantResult.rows[0];
            const available = variant.stock_quantity;

            if (available < item.quantity) {
              insufficientStock.push({
                productName: item.current_product_name,
                requested: item.quantity,
                available: available,
              });
            } else {
              // 재고 차감
              await client.query(
                `UPDATE product_variants
                 SET stock_quantity = stock_quantity - $1, updated_at = NOW()
                 WHERE id = $2`,
                [item.quantity, variant.id]
              );
            }
          } else {
            // variant가 없음 (데이터 무결성 문제)
            insufficientStock.push({
              productName: item.current_product_name,
              requested: item.quantity,
              available: 0,
            });
          }
        }
      }

      // 4. 재고 부족이 있으면 롤백
      if (insufficientStock.length > 0) {
        await client.query("ROLLBACK");
        return {
          success: false,
          orderId,
          error: "재고가 부족합니다",
          insufficientStock,
        };
      }

      // 5. 주문 상태 업데이트 (결제 완료)
      await client.query(
        `UPDATE orders
         SET status = 'payment_confirmed',
             payment_provider = $1,
             payment_key = $2,
             external_order_id = $3,
             payment_method = $4,
             paid_at = $5,
             updated_at = $6
         WHERE id = $7`,
        [
          paymentData.paymentProvider,
          paymentData.paymentKey,
          paymentData.externalOrderId,
          paymentData.paymentMethod || null,
          paymentData.paidAt || getKSTDate(),
          getKSTDate(),
          orderId,
        ]
      );

      // 6. 주문 아이템 상태도 업데이트
      await client.query(
        `UPDATE order_items SET status = 'payment_confirmed' WHERE order_id = $1`,
        [orderId]
      );

      await client.query("COMMIT");

      return { success: true, orderId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 주문 취소 시 재고 복구
  // ------------------------------------------------------------------
  async restoreStockOnCancel(orderId: string): Promise<void> {
    const client = await pool.connect();
    const logger = createLogger("StockRestore");

    // 🔒 normalizeSize 함수 (createOrder와 동일)
    const normalizeSize = (size: string): string => {
      return size.trim().toLowerCase();
    };

    try {
      await client.query("BEGIN");

      // 주문 아이템 조회
      const itemsResult = await client.query(
        `SELECT oi.product_id, oi.quantity, oi.options
         FROM order_items oi
         WHERE oi.order_id = $1`,
        [orderId]
      );

      logger.info("재고 복구 시작", {
        orderId,
        itemCount: itemsResult.rows.length,
      });

      for (const item of itemsResult.rows) {
        // 옵션에서 사이즈 추출 (공백 포함된 사이즈도 처리: "X Large", "Free Size" 등)
        let variantSize: string | null = null;
        if (item.options) {
          const match = item.options.match(/Size:\s*(.+?)$/im);
          if (match) {
            // 🔒 normalizeSize 적용 (createOrder와 동일하게)
            variantSize = normalizeSize(match[1]);
          }
        }

        if (variantSize) {
          // variant 재고 복구 (사이즈 지정)
          const updateResult = await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE product_id = $2 AND LOWER(TRIM(size)) = $3
             RETURNING id, size, stock_quantity`,
            [item.quantity, item.product_id, variantSize]
          );

          if (updateResult.rows.length > 0) {
            logger.info("재고 복구 완료 (variant)", {
              productId: item.product_id,
              size: updateResult.rows[0].size,
              quantity: item.quantity,
              newStock: updateResult.rows[0].stock_quantity,
            });
          } else {
            logger.warn("재고 복구 실패 - variant 찾을 수 없음", {
              productId: item.product_id,
              size: variantSize,
            });
          }
        } else {
          // variant 재고 복구 (첫 번째 variant 사용)
          const updateResult = await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE product_id = $2
             AND id = (
               SELECT id FROM product_variants
               WHERE product_id = $2
               ORDER BY created_at ASC
               LIMIT 1
             )
             RETURNING id, size, stock_quantity`,
            [item.quantity, item.product_id]
          );

          if (updateResult.rows.length > 0) {
            logger.info("재고 복구 완료 (기본 variant)", {
              productId: item.product_id,
              size: updateResult.rows[0].size,
              quantity: item.quantity,
              newStock: updateResult.rows[0].stock_quantity,
            });
          }
        }
      }

      await client.query("COMMIT");
      logger.info("재고 복구 트랜잭션 완료", { orderId });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("재고 복구 실패 - 롤백", {
        orderId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 🔒 Cron Job 전용: 재고 복구 + 주문 삭제 (원자적 트랜잭션)
  // 재고 복구 성공 후 주문 삭제 실패 시 중복 재고 복구 방지
  // ------------------------------------------------------------------
  async restoreStockAndDeleteOrder(orderId: string): Promise<void> {
    const client = await pool.connect();
    const logger = createLogger("RestoreAndDelete");

    // 🔒 normalizeSize 함수 (createOrder와 동일)
    const normalizeSize = (size: string): string => {
      return size.trim().toLowerCase();
    };

    try {
      await client.query("BEGIN");

      // 1. 주문 아이템 조회
      const itemsResult = await client.query(
        `SELECT oi.product_id, oi.quantity, oi.options
         FROM order_items oi
         WHERE oi.order_id = $1`,
        [orderId]
      );

      logger.info("재고 복구 및 주문 삭제 시작 (Cron)", {
        orderId,
        itemCount: itemsResult.rows.length,
      });

      // 2. 재고 복구
      for (const item of itemsResult.rows) {
        // 옵션에서 사이즈 추출
        let variantSize: string | null = null;
        if (item.options) {
          const match = item.options.match(/Size:\s*(.+?)$/im);
          if (match) {
            variantSize = normalizeSize(match[1]);
          }
        }

        if (variantSize) {
          // variant 재고 복구 (사이즈 지정)
          const updateResult = await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE product_id = $2 AND LOWER(TRIM(size)) = $3
             RETURNING id, size, stock_quantity`,
            [item.quantity, item.product_id, variantSize]
          );

          if (updateResult.rows.length > 0) {
            logger.info("재고 복구 완료 (variant)", {
              productId: item.product_id,
              size: updateResult.rows[0].size,
              quantity: item.quantity,
              newStock: updateResult.rows[0].stock_quantity,
            });
          } else {
            logger.warn("재고 복구 실패 - variant 찾을 수 없음", {
              productId: item.product_id,
              size: variantSize,
            });
          }
        } else {
          // variant 재고 복구 (첫 번째 variant 사용)
          const updateResult = await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE product_id = $2
             AND id = (
               SELECT id FROM product_variants
               WHERE product_id = $2
               ORDER BY created_at ASC
               LIMIT 1
             )
             RETURNING id, size, stock_quantity`,
            [item.quantity, item.product_id]
          );

          if (updateResult.rows.length > 0) {
            logger.info("재고 복구 완료 (기본 variant)", {
              productId: item.product_id,
              size: updateResult.rows[0].size,
              quantity: item.quantity,
              newStock: updateResult.rows[0].stock_quantity,
            });
          }
        }
      }

      // 3. 주문 및 주문 아이템 삭제 (CASCADE)
      const deleteResult = await client.query(
        `DELETE FROM orders WHERE id = $1 RETURNING id, external_order_id`,
        [orderId]
      );

      if (deleteResult.rows.length > 0) {
        logger.info("주문 삭제 완료", {
          orderId,
          externalOrderId: deleteResult.rows[0].external_order_id,
        });
      }

      await client.query("COMMIT");
      logger.info("재고 복구 및 주문 삭제 트랜잭션 완료 (Cron)", { orderId });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("재고 복구 및 주문 삭제 실패 - 롤백", {
        orderId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 🔒 트랜잭션 기반 결제 전 취소
  // 재고 복구 + 주문 상태 업데이트 + 아이템 상태 업데이트를 원자적으로 처리
  // ------------------------------------------------------------------
  async cancelOrderBeforePayment(
    orderId: string,
    cancelData: {
      cancelReason: string;
      restoreStock: boolean;
    }
  ): Promise<Order | undefined> {
    const client = await pool.connect();
    const logger = createLogger("CancelOrderBeforePayment");

    // 🔒 normalizeSize 함수 (createOrder와 동일)
    const normalizeSize = (size: string): string => {
      return size.trim().toLowerCase();
    };

    try {
      await client.query("BEGIN");

      // 1. 재고 복구 (필요한 경우)
      if (cancelData.restoreStock) {
        logger.info("재고 복구 시작 (결제 전 취소)", { orderId });

        // 주문 아이템 조회
        const itemsResult = await client.query(
          `SELECT oi.product_id, oi.quantity, oi.options
           FROM order_items oi
           WHERE oi.order_id = $1`,
          [orderId]
        );

        for (const item of itemsResult.rows) {
          // 옵션에서 사이즈 추출 (공백 포함된 사이즈도 처리: "X Large", "Free Size" 등)
          let variantSize: string | null = null;
          if (item.options) {
            const match = item.options.match(/Size:\s*(.+?)$/im);
            if (match) {
              // 🔒 normalizeSize 적용 (createOrder와 동일하게)
              variantSize = normalizeSize(match[1]);
            }
          }

          if (variantSize) {
            // variant 재고 복구 (사이즈 지정)
            const updateResult = await client.query(
              `UPDATE product_variants
               SET stock_quantity = stock_quantity + $1, updated_at = NOW()
               WHERE product_id = $2 AND LOWER(TRIM(size)) = $3
               RETURNING id, size, stock_quantity`,
              [item.quantity, item.product_id, variantSize]
            );

            if (updateResult.rows.length > 0) {
              logger.info("재고 복구 완료 (variant)", {
                productId: item.product_id,
                size: updateResult.rows[0].size,
                quantity: item.quantity,
                newStock: updateResult.rows[0].stock_quantity,
              });
            } else {
              logger.warn("재고 복구 실패 - variant 찾을 수 없음", {
                productId: item.product_id,
                size: variantSize,
              });
            }
          } else {
            // variant 재고 복구 (첫 번째 variant 사용)
            const updateResult = await client.query(
              `UPDATE product_variants
               SET stock_quantity = stock_quantity + $1, updated_at = NOW()
               WHERE product_id = $2
               AND id = (
                 SELECT id FROM product_variants
                 WHERE product_id = $2
                 ORDER BY created_at ASC
                 LIMIT 1
               )
               RETURNING id, size, stock_quantity`,
              [item.quantity, item.product_id]
            );

            if (updateResult.rows.length > 0) {
              logger.info("재고 복구 완료 (기본 variant)", {
                productId: item.product_id,
                size: updateResult.rows[0].size,
                quantity: item.quantity,
                newStock: updateResult.rows[0].stock_quantity,
              });
            }
          }
        }

        logger.info("재고 복구 완료 (결제 전 취소)", { orderId });
      }

      // 2. 주문 상태 업데이트
      const orderResult = await client.query(
        `UPDATE orders
         SET status = $1,
             canceled_at = NOW(),
             cancel_reason = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        ["cancelled", cancelData.cancelReason, orderId]
      );

      // 3. 주문 아이템 상태 일괄 업데이트
      await client.query(
        `UPDATE order_items
         SET status = $1
         WHERE order_id = $2`,
        ["cancelled", orderId]
      );

      await client.query("COMMIT");

      // Drizzle 타입으로 변환하여 반환
      if (orderResult.rows.length > 0) {
        return orderResult.rows[0] as Order;
      }
      return undefined;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 주문 취소 시 장바구니 복구
  // ------------------------------------------------------------------
  async restoreCartItemsFromOrder(
    userId: string,
    orderId: string
  ): Promise<void> {
    // 주문 아이템 조회
    const itemsResult = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    for (const item of itemsResult) {
      // 옵션에서 사이즈 추출하여 variant 찾기
      let variantId: string | null = null;

      if (item.options) {
        const match = item.options.match(/Size:\s*(.+?)$/im);
        if (match) {
          const size = match[1].trim();
          // 해당 상품의 variant 중 size가 일치하는 것 찾기
          const variants = await this.getProductVariants(item.productId);
          const matchedVariant = variants.find((v) => v.size === size);
          if (matchedVariant) {
            variantId = matchedVariant.id;
          }
        }
      }

      // 장바구니에 추가 (addCartItem이 중복 처리 자동으로 함)
      await this.addCartItem({
        userId,
        productId: item.productId,
        variantId,
        quantity: item.quantity,
      });
    }
  }

  // ------------------------------------------------------------------
  // Delivery Address operations (UUID 기반)
  // ------------------------------------------------------------------
  async getDeliveryAddresses(userId: string): Promise<DeliveryAddress[]> {
    return await db
      .select()
      .from(deliveryAddresses)
      .where(eq(deliveryAddresses.userId, userId))
      .orderBy(
        desc(deliveryAddresses.isDefault),
        desc(deliveryAddresses.createdAt)
      );
  }

  async createDeliveryAddress(
    addressData: InsertDeliveryAddress
  ): Promise<DeliveryAddress> {
    // 기본 배송지가 아니면 트랜잭션 불필요
    if (!addressData.isDefault) {
      const [newAddress] = await db
        .insert(deliveryAddresses)
        .values(addressData)
        .returning();
      return newAddress;
    }

    // 기본 배송지 설정 시 트랜잭션으로 원자적 처리
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. 기존 기본 배송지 해제
      await client.query(
        `UPDATE delivery_addresses SET is_default = false WHERE user_id = $1`,
        [addressData.userId]
      );

      // 2. 새 배송지 추가
      const result = await client.query(
        `INSERT INTO delivery_addresses (user_id, recipient, phone, zip_code, address, detail_address, request_note, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          addressData.userId,
          addressData.recipient,
          addressData.phone,
          addressData.zipCode,
          addressData.address,
          addressData.detailAddress || null,
          addressData.requestNote || null,
          addressData.isDefault,
        ]
      );

      await client.query("COMMIT");
      return result.rows[0] as DeliveryAddress;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDeliveryAddress(
    id: string, // UUID
    userId: string,
    addressData: Partial<InsertDeliveryAddress>
  ): Promise<DeliveryAddress | undefined> {
    // 기본 배송지 변경이 아니면 트랜잭션 불필요
    if (!addressData.isDefault) {
      const [updated] = await db
        .update(deliveryAddresses)
        .set(addressData)
        .where(
          and(
            eq(deliveryAddresses.id, id),
            eq(deliveryAddresses.userId, userId)
          )
        )
        .returning();
      return updated;
    }

    // 기본 배송지 변경 시 트랜잭션으로 원자적 처리
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. 기존 기본 배송지 해제
      await client.query(
        `UPDATE delivery_addresses SET is_default = false WHERE user_id = $1`,
        [userId]
      );

      // 2. 선택한 배송지를 기본으로 설정
      const result = await client.query(
        `UPDATE delivery_addresses SET is_default = true WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, userId]
      );

      await client.query("COMMIT");
      return result.rows[0] as DeliveryAddress | undefined;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteDeliveryAddress(id: string, userId: string): Promise<void> {
    await db
      .delete(deliveryAddresses)
      .where(
        and(eq(deliveryAddresses.id, id), eq(deliveryAddresses.userId, userId))
      );
  }

  // ------------------------------------------------------------------
  // Email Verification operations
  // ------------------------------------------------------------------
  async createEmailVerification(
    verification: InsertEmailVerification
  ): Promise<EmailVerification> {
    // 기존 미사용 인증코드 삭제 후 새로 생성
    await db
      .delete(emailVerifications)
      .where(
        and(
          eq(emailVerifications.email, verification.email),
          eq(emailVerifications.type, verification.type),
          eq(emailVerifications.verified, false)
        )
      );

    const [newVerification] = await db
      .insert(emailVerifications)
      .values(verification)
      .returning();
    return newVerification;
  }

  async getValidVerification(
    email: string,
    code: string,
    type: string
  ): Promise<EmailVerification | undefined> {
    const [verification] = await db
      .select()
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.email, email),
          eq(emailVerifications.code, code),
          eq(emailVerifications.type, type),
          eq(emailVerifications.verified, false),
          gt(emailVerifications.expiresAt, new Date())
        )
      );
    return verification;
  }

  async markVerificationAsUsed(id: number): Promise<void> {
    await db
      .update(emailVerifications)
      .set({ verified: true })
      .where(eq(emailVerifications.id, id));
  }

  async deleteExpiredVerifications(): Promise<void> {
    // 버그 수정: 만료된 인증코드만 삭제 (expiresAt < now AND verified = false)
    await db
      .delete(emailVerifications)
      .where(
        and(
          eq(emailVerifications.verified, false),
          lt(emailVerifications.expiresAt, new Date())
        )
      );
  }

  async isEmailVerified(email: string, type: string): Promise<boolean> {
    const [verification] = await db
      .select()
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.email, email),
          eq(emailVerifications.type, type),
          eq(emailVerifications.verified, true)
        )
      )
      .orderBy(desc(emailVerifications.createdAt))
      .limit(1);
    return !!verification;
  }

  // ------------------------------------------------------------------
  // Site Image operations (Hero, Marquee)
  // ------------------------------------------------------------------
  async getSiteImages(type?: SiteImageType): Promise<SiteImage[]> {
    if (type) {
      return await db
        .select()
        .from(siteImages)
        .where(eq(siteImages.type, type))
        .orderBy(siteImages.displayOrder);
    }
    return await db
      .select()
      .from(siteImages)
      .orderBy(siteImages.type, siteImages.displayOrder);
  }

  async getSiteImage(id: number): Promise<SiteImage | undefined> {
    const [image] = await db
      .select()
      .from(siteImages)
      .where(eq(siteImages.id, id));
    return image;
  }

  async createSiteImage(image: InsertSiteImage): Promise<SiteImage> {
    const [newImage] = await db.insert(siteImages).values(image).returning();
    return newImage;
  }

  async updateSiteImage(
    id: number,
    image: Partial<InsertSiteImage>
  ): Promise<SiteImage | undefined> {
    const [updated] = await db
      .update(siteImages)
      .set({ ...image, updatedAt: getKSTDate() })
      .where(eq(siteImages.id, id))
      .returning();
    return updated;
  }

  async deleteSiteImage(id: number): Promise<void> {
    await db.delete(siteImages).where(eq(siteImages.id, id));
  }

  async countSiteImagesByType(type: SiteImageType): Promise<number> {
    // 성능 개선: 전체 레코드 조회 대신 COUNT 쿼리 사용
    const [result] = await db
      .select({ count: count() })
      .from(siteImages)
      .where(eq(siteImages.type, type));
    return result?.count ?? 0;
  }

  // ------------------------------------------------------------------
  // Inquiry (Q&A) operations
  // ------------------------------------------------------------------
  async getInquiries(filters?: {
    userId?: string;
    productId?: string;
    type?: InquiryType;
    status?: string;
  }): Promise<(Inquiry & { user: User; product?: Product | null })[]> {
    const conditions = [];

    if (filters?.userId) {
      conditions.push(eq(inquiries.userId, filters.userId));
    }
    if (filters?.productId) {
      conditions.push(eq(inquiries.productId, filters.productId));
    }
    if (filters?.type) {
      conditions.push(eq(inquiries.type, filters.type));
    }
    if (filters?.status) {
      conditions.push(eq(inquiries.status, filters.status));
    }

    let query = db
      .select()
      .from(inquiries)
      .innerJoin(users, eq(inquiries.userId, users.id))
      .leftJoin(products, eq(inquiries.productId, products.id));

    if (conditions.length > 0) {
      // @ts-ignore: Drizzle query builder type complexity
      query = query.where(and(...conditions));
    }

    const result = await query.orderBy(desc(inquiries.createdAt));

    return result.map((row) => ({
      ...row.inquiries,
      user: row.users,
      product: row.products || null,
    }));
  }

  async getInquiry(
    id: string
  ): Promise<
    | (Inquiry & {
        user: User;
        product?: Product | null;
        replies: (InquiryReply & { user: User })[];
      })
    | undefined
  > {
    // N+1 문제 해결: 문의와 답변을 단일 쿼리로 조회
    // 문의 작성자와 답변 작성자가 다를 수 있으므로 별도 alias 필요
    // Drizzle에서 같은 테이블을 여러 번 조인하려면 별도 처리 필요
    // 여기서는 2개의 병렬 쿼리로 최적화 (Promise.all)
    const [inquiryResult, repliesResult] = await Promise.all([
      db
        .select()
        .from(inquiries)
        .innerJoin(users, eq(inquiries.userId, users.id))
        .leftJoin(products, eq(inquiries.productId, products.id))
        .where(eq(inquiries.id, id)),
      db
        .select()
        .from(inquiryReplies)
        .innerJoin(users, eq(inquiryReplies.userId, users.id))
        .where(eq(inquiryReplies.inquiryId, id))
        .orderBy(inquiryReplies.createdAt),
    ]);

    if (inquiryResult.length === 0) return undefined;

    const row = inquiryResult[0];
    const replies = repliesResult.map((r) => ({
      ...r.inquiry_replies,
      user: r.users,
    }));

    return {
      ...row.inquiries,
      user: row.users,
      product: row.products || null,
      replies,
    };
  }

  async createInquiry(inquiry: InsertInquiry): Promise<Inquiry> {
    const [newInquiry] = await db.insert(inquiries).values(inquiry).returning();
    return newInquiry;
  }

  async updateInquiryStatus(
    id: string,
    status: string
  ): Promise<Inquiry | undefined> {
    const [updated] = await db
      .update(inquiries)
      .set({ status, updatedAt: getKSTDate() })
      .where(eq(inquiries.id, id))
      .returning();
    return updated;
  }

  async deleteInquiry(id: string): Promise<void> {
    await db.delete(inquiries).where(eq(inquiries.id, id));
  }

  // ------------------------------------------------------------------
  // Inquiry Reply operations
  // ------------------------------------------------------------------
  async createInquiryReply(reply: InsertInquiryReply): Promise<InquiryReply> {
    const [newReply] = await db
      .insert(inquiryReplies)
      .values(reply)
      .returning();

    // 문의 상태를 'answered'로 업데이트
    await db
      .update(inquiries)
      .set({ status: "answered", updatedAt: getKSTDate() })
      .where(eq(inquiries.id, reply.inquiryId));

    return newReply;
  }

  async deleteInquiryReply(id: number): Promise<void> {
    await db.delete(inquiryReplies).where(eq(inquiryReplies.id, id));
  }
}

export const storage = new DatabaseStorage();
