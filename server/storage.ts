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
  returns,
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
  type Return,
  type InsertReturn,
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, like, asc, desc, isNull, gt, lt, count, sum, sql, inArray } from "drizzle-orm";
import { createLogger } from "./utils/logger";
import type {
  OrderItemCreateData,
  OrderStatusUpdate,
  OrderItemStatusUpdate,
  StockLockResult,
  ConfirmPaymentData,
} from "./types";
// DB 세션이 KST로 설정되어 있으므로 sql`NOW()`를 사용하여 일관된 시간 저장

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
    soldOut?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ products: (Product & { totalStock: number })[]; total: number }>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductBySlug(slug: string): Promise<Product | undefined>;
  getProductViewStats(limit?: number): Promise<{
    totalViewCount: number;
    topViewedProducts: (Product & { totalStock: number })[];
  }>;
  incrementProductViewCount(productId: string): Promise<void>;
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
  updateCartItem(id: string, userId: string, quantity: number): Promise<CartItem | undefined>;
  deleteCartItem(id: string, userId: string): Promise<boolean>;
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
  getOrders(userId: string): Promise<
    (Order & { orderItems: (OrderItem & { product: Product | null })[] })[]
  >;
  getOrder(
    orderId: string
  ): Promise<
    (Order & { orderItems: (OrderItem & { product: Product })[] }) | undefined
  >;
  getAllOrders(): Promise<Order[]>;
  getAllOrdersWithItems(options?: {
    page?: number;
    limit?: number;
  }): Promise<{
    orders: (Order & { orderItems: (OrderItem & { product: Product | null })[] })[];
    total: number;
  }>;

  updateOrderStatus(
    orderId: string, // UUID
    status: string,
    trackingNumber?: string
  ): Promise<Order | undefined>;

  updateOrderItemStatus(
    itemId: number, // serial
    status: string,
    trackingNumber?: string,
    courierCompany?: string
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

  // 개별 주문 상품 취소 (부분 취소용)
  cancelOrderItemPayment(
    orderItemId: number,
    cancelData: {
      status: string;
      cancelReason?: string;
    }
  ): Promise<OrderItem | undefined>;

  // 개별 상품 재고 복구 (부분 취소용)
  restoreStockOnItemCancel(orderItemId: number): Promise<void>;

  // 주문 환불 금액 누적 업데이트
  addRefundedAmount(
    orderId: string,
    additionalRefundAmount: string,
    updatePenaltyFlag?: boolean
  ): Promise<Order | undefined>;

  // 판매자 귀책 취소 금액 누적 업데이트 (직권 취소 시)
  addSellerCancelledAmount(
    orderId: string,
    amount: string
  ): Promise<Order | undefined>;

  // 관리자 수기환불 처리 (PG 호출/재고 복구 없음)
  manualRefundOrderItem(params: {
    orderId: string;
    orderItemId: number;
    refundAmount: number;
    cancelReason: string;
  }): Promise<void>;

  // 주문 상태만 업데이트 (orderItems는 건드리지 않음)
  updateOrderStatusOnly(
    orderId: string,
    updateData: {
      status: string;
      cancelReason?: string;
    }
  ): Promise<Order | undefined>;

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
  clearEmailVerification(email: string, type: string): Promise<void>;

  // Site Image operations (Main, Hero, Marquee, Journal)
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
  }): Promise<(Inquiry & { user: User; product?: Product | null; replyCount: number })[]>;
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
  getInquiryReply(id: number): Promise<InquiryReply | undefined>;
  deleteInquiryReply(id: number): Promise<void>;

  // Return operations (반품 관련)
  createReturnRequest(returnData: InsertReturn): Promise<Return>;
  getReturnRequest(id: string): Promise<Return | undefined>;
  getReturnsByOrderId(orderId: string): Promise<Return[]>;
  getReturnsByUserId(userId: string): Promise<Return[]>;
  updateReturnTracking(
    id: string,
    data: { trackingNumber: string; courierCompany: string; status: string }
  ): Promise<Return | undefined>;
  updateReturnInspection(
    id: string,
    data: { result: string; note?: string }
  ): Promise<Return | undefined>;

  // 부분 취소 (배송 전)
  partialCancelOrder(params: {
    orderId: string;
    cancelItemIds: number[];
    refundAmount: number;
    cancelReason: string;
    isFullCancel: boolean;
    updatePenaltyFlag: boolean;
  }): Promise<void>;

  // 반품 완료 처리
  completeReturn(
    returnId: string,
    params: {
      refundAmount: number;
      inspectionResult: string;
      inspectionNote?: string;
      updatePenaltyFlag: boolean;
      isLastItem: boolean;
    }
  ): Promise<void>;

  // 아이템 상태 기반으로 부모 주문 상태 동기화
  syncOrderStatusFromItems(orderId: string): Promise<void>;

  // 주문 아이템 조회
  getOrderItemById(itemId: number): Promise<OrderItem | undefined>;
  getOrderItemsByOrderId(orderId: string): Promise<OrderItem[]>;
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
    // 이메일은 항상 소문자로 저장되므로 소문자로 검색 (인덱스 활용)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
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
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning();
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
          updatedAt: sql`NOW()`,
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
        updatedAt: sql`NOW()`,
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
    soldOut?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ products: (Product & { totalStock: number })[]; total: number }> {
    // LEFT JOIN + SUM을 사용하여 N+1 문제 해결
    // 한 번의 쿼리로 각 상품의 총 재고를 계산
    const conditions = [];
    if (filters?.search) {
      conditions.push(like(products.name, `%${filters.search}%`));
    }
    if (filters?.categoryId) {
      conditions.push(eq(products.categoryId, filters.categoryId));
    }
    if (filters?.soldOut) {
      conditions.push(eq(products.isAvailable, true));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const totalStockExpression = sql<number>`COALESCE(SUM(${productVariants.stockQuantity}), 0)`;
    const soldOutHavingClause = filters?.soldOut
      ? sql`${totalStockExpression} = 0`
      : undefined;

    let total = 0;

    if (filters?.soldOut) {
      // soldOut은 variant 재고 합계 기준이라 GROUP BY/HAVING 이후의 행 수를 세야 한다.
      let soldOutCountBaseQuery = db
        .select({ id: products.id })
        .from(products)
        .leftJoin(productVariants, eq(products.id, productVariants.productId));

      if (whereClause) {
        // @ts-ignore: Drizzle query builder type complexity
        soldOutCountBaseQuery = soldOutCountBaseQuery.where(whereClause);
      }

      // @ts-ignore: Drizzle query builder type complexity
      soldOutCountBaseQuery = soldOutCountBaseQuery
        .groupBy(products.id)
        .having(soldOutHavingClause);

      const soldOutCountSubquery = soldOutCountBaseQuery.as("sold_out_products");
      const [countResult] = await db
        .select({ total: count() })
        .from(soldOutCountSubquery);
      total = countResult?.total || 0;
    } else {
      // COUNT 쿼리: 전체 상품 수 (같은 WHERE 조건)
      let countQuery = db
        .select({ total: count() })
        .from(products);

      if (whereClause) {
        // @ts-ignore: Drizzle query builder type complexity
        countQuery = countQuery.where(whereClause);
      }

      const [countResult] = await countQuery;
      total = countResult?.total || 0;
    }

    // 데이터 쿼리: products와 productVariants를 LEFT JOIN하여 총 재고 계산
    let query = db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        imageUrl: products.imageUrl,
        price: products.price,
        originalPrice: products.originalPrice,
        categoryId: products.categoryId,
        images: products.images,
        detailImages: products.detailImages,
        isAvailable: products.isAvailable,
        viewCount: products.viewCount,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        // SUM을 사용하여 모든 variants의 stockQuantity 합산
        // COALESCE를 사용하여 NULL을 0으로 처리
        totalStock: totalStockExpression,
      })
      .from(products)
      .leftJoin(productVariants, eq(products.id, productVariants.productId))
      .groupBy(products.id);

    if (whereClause) {
      // @ts-ignore: Drizzle query builder type complexity
      query = query.where(whereClause);
    }
    if (soldOutHavingClause) {
      // @ts-ignore: Drizzle query builder type complexity
      query = query.having(soldOutHavingClause);
    }

    // DB 레벨 정렬: isAvailable DESC → 재고 유무 ASC(있으면 0, 없으면 1) → updatedAt DESC
    // HAVING 없이 ORDER BY에서 집계값 사용 가능 (GROUP BY 이후)
    // @ts-ignore: Drizzle query builder type complexity
    query = query.orderBy(
      desc(products.isAvailable),
      asc(sql`CASE WHEN COALESCE(SUM(${productVariants.stockQuantity}), 0) > 0 THEN 0 ELSE 1 END`),
      desc(products.updatedAt),
    );

    // 페이지네이션 적용 (page/limit이 전달된 경우)
    const page = filters?.page;
    const limit = filters?.limit;
    if (page && limit) {
      // @ts-ignore: Drizzle query builder type complexity
      query = query.limit(limit).offset((page - 1) * limit);
    }

    const results = await query;

    return { products: results, total };
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

  async getProductViewStats(limit: number = 10): Promise<{
    totalViewCount: number;
    topViewedProducts: (Product & { totalStock: number })[];
  }> {
    const safeLimit = Math.min(50, Math.max(1, limit));

    const [totalResult] = await db
      .select({
        totalViewCount: sql<number>`COALESCE(SUM(${products.viewCount}), 0)`,
      })
      .from(products);

    const topViewedProducts = await db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        imageUrl: products.imageUrl,
        price: products.price,
        originalPrice: products.originalPrice,
        categoryId: products.categoryId,
        images: products.images,
        detailImages: products.detailImages,
        isAvailable: products.isAvailable,
        viewCount: products.viewCount,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        totalStock: sql<number>`COALESCE(SUM(${productVariants.stockQuantity}), 0)`,
      })
      .from(products)
      .leftJoin(productVariants, eq(products.id, productVariants.productId))
      .groupBy(products.id)
      .orderBy(desc(products.viewCount), desc(products.updatedAt))
      .limit(safeLimit);

    return {
      totalViewCount: Number(totalResult?.totalViewCount ?? 0),
      topViewedProducts,
    };
  }

  async incrementProductViewCount(productId: string): Promise<void> {
    await db
      .update(products)
      .set({
        viewCount: sql`${products.viewCount} + 1`,
      })
      .where(eq(products.id, productId));
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    // DB 세션 KST timezone 보장을 위해 명시적으로 NOW() 사용
    const [newProduct] = await db
      .insert(products)
      .values({
        ...product,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning();
    return newProduct;
  }

  async updateProduct(
    id: string, // UUID
    product: Partial<InsertProduct>
  ): Promise<Product | undefined> {
    const [updated] = await db
      .update(products)
      // updatedAt이 직접 전달되면 그 값을 사용, 아니면 DB의 NOW() 사용
      .set({ updatedAt: sql`NOW()`, ...product })
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
      .values({
        ...variant,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning();
    return newVariant;
  }

  async updateProductVariant(
    id: string,
    variant: Partial<InsertProductVariant>
  ): Promise<ProductVariant | undefined> {
    const [updated] = await db
      .update(productVariants)
      .set({ ...variant, updatedAt: sql`NOW()` })
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
      .values({
        ...measurement,
        createdAt: sql`NOW()`,
      })
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
      .values({
        ...category,
        createdAt: sql`NOW()`,
      })
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
    // race condition 방지: 동일 (user, product, variant) 조합에 대해 advisory lock 획득
    // unique constraint 없이 마이그레이션 없이 안전하게 직렬화
    // pg_advisory_xact_lock는 트랜잭션 종료 시 자동 해제됨
    return await db.transaction(async (tx) => {
      const lockKey = `cart:${item.userId}:${item.productId}:${item.variantId ?? "null"}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // variantId 비교 조건 (같은 상품이라도 다른 옵션이면 별도 아이템)
      const conditions = [
        eq(cartItems.userId, item.userId),
        eq(cartItems.productId, item.productId),
      ];

      if (item.variantId) {
        conditions.push(eq(cartItems.variantId, item.variantId));
      } else {
        conditions.push(isNull(cartItems.variantId));
      }

      const existing = await tx
        .select()
        .from(cartItems)
        .where(and(...conditions));

      if (existing.length > 0) {
        const [updated] = await tx
          .update(cartItems)
          .set({ quantity: existing[0].quantity + (item.quantity || 1) })
          .where(eq(cartItems.id, existing[0].id))
          .returning();
        return updated;
      }

      const [newItem] = await tx.insert(cartItems).values(item).returning();
      return newItem;
    });
  }

  // userId 필터 필수 — id만으로 갱신/삭제하면 타인의 장바구니 조작(IDOR) 가능
  async updateCartItem(
    id: string, // UUID
    userId: string,
    quantity: number
  ): Promise<CartItem | undefined> {
    const [updated] = await db
      .update(cartItems)
      .set({ quantity, updatedAt: sql`NOW()` })
      .where(and(eq(cartItems.id, id), eq(cartItems.userId, userId)))
      .returning();
    return updated;
  }

  async deleteCartItem(id: string, userId: string): Promise<boolean> {
    const deleted = await db
      .delete(cartItems)
      .where(and(eq(cartItems.id, id), eq(cartItems.userId, userId)))
      .returning({ id: cartItems.id });
    return deleted.length > 0;
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
        `INSERT INTO orders (user_id, items_amount, shipping_fee, total_amount, status, shipping_name, shipping_phone, shipping_postal_code, shipping_address, shipping_detail_address, shipping_request_note, external_order_id, is_stock_reserved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          order.userId,
          order.itemsAmount,
          order.shippingFee,
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

  async getOrders(userId: string): Promise<
    (Order & { orderItems: (OrderItem & { product: Product | null })[] })[]
  > {
    // N+1 쿼리 개선: 단일 JOIN 쿼리로 주문과 주문 상품, 상품 정보를 함께 조회
    const result = await db
      .select()
      .from(orders)
      .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orders.userId, userId))
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

  async getAllOrdersWithItems(options?: {
    page?: number;
    limit?: number;
  }): Promise<{
    orders: (Order & { orderItems: (OrderItem & { product: Product | null })[] })[];
    total: number;
  }> {
    // 기본값: page=1, limit=200 (options 미전달 시에도 안전하게 동작)
    const effectivePage = options?.page ?? 1;
    const effectiveLimit = options?.limit ?? 200;

    // 1단계: 전체 주문 수 COUNT
    const [{ total }] = await db.select({ total: count() }).from(orders);

    // 2단계: orders 테이블만 페이지네이션
    const paginatedOrders = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(effectiveLimit)
      .offset((effectivePage - 1) * effectiveLimit);

    if (paginatedOrders.length === 0) {
      return { orders: [], total };
    }

    // 3단계: 해당 order IDs로 orderItems + products JOIN
    const orderIds = paginatedOrders.map((o) => o.id);
    const itemsResult = await db
      .select()
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, orderIds));

    // 결과를 주문별로 그룹화 (UUID 기반)
    const orderMap = new Map<
      string,
      Order & { orderItems: (OrderItem & { product: Product | null })[] }
    >();

    // 먼저 주문 데이터 초기화 (순서 보장)
    for (const order of paginatedOrders) {
      orderMap.set(order.id, { ...order, orderItems: [] });
    }

    // 아이템 데이터 매핑
    for (const row of itemsResult) {
      const orderId = row.order_items.orderId;
      if (orderMap.has(orderId)) {
        orderMap.get(orderId)!.orderItems.push({
          ...row.order_items,
          product: row.products,
        });
      }
    }

    return { orders: Array.from(orderMap.values()), total };
  }

  async updateOrderStatus(
    orderId: string, // UUID
    status: string,
    trackingNumber?: string
  ): Promise<Order | undefined> {
    // any 타입 제거: 명시적 타입 사용
    // DB 세션이 KST로 설정되어 있으므로 sql`NOW()` 사용
    const updateData: OrderStatusUpdate = { status, updatedAt: sql`NOW()` };
    if (trackingNumber !== undefined) {
      updateData.trackingNumber = trackingNumber;
    }

    // 배송 완료 시 delivered_at 기록 (자동 구매확정 기준일)
    if (status === "delivered") {
      updateData.deliveredAt = sql`NOW()`;
    }

    // 구매 확정 시 confirmed_at 기록 (정산 근거)
    if (status === "purchase_confirmed") {
      updateData.confirmedAt = sql`NOW()`;
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
    trackingNumber?: string,
    courierCompany?: string
  ): Promise<OrderItem | undefined> {
    // any 타입 제거: 명시적 타입 사용
    const updateData: OrderItemStatusUpdate = { status };
    if (trackingNumber !== undefined) {
      updateData.trackingNumber = trackingNumber;
    }
    if (courierCompany !== undefined) {
      updateData.courierCompany = courierCompany;
    }

    // 배송 완료 시 delivered_at 기록 (자동 구매확정 기준일)
    if (status === "delivered") {
      updateData.deliveredAt = sql`NOW()`;
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

      // 1. 주문 상태 업데이트 (paid_at은 COALESCE로 NOW() 사용)
      const orderResult = await client.query(
        `UPDATE orders
         SET payment_provider = $1,
             payment_key = $2,
             external_order_id = $3,
             payment_method = $4,
             status = $5,
             paid_at = COALESCE($6, NOW()),
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
      cancelReason: string;
      refundedAmount?: string;
    }
  ): Promise<Order | undefined> {
    // 🔒 트랜잭션으로 주문 및 주문 아이템 상태 동시 업데이트
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. 주문 상태 업데이트 (canceled_at은 NOW() 사용)
      const orderResult = await client.query(
        `UPDATE orders
         SET status = $1,
             canceled_at = NOW(),
             cancel_reason = $2,
             refunded_amount = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [
          cancelData.status,
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
      // DB 세션이 KST로 설정되어 있으므로 NOW() 사용
      await client.query(
        `UPDATE orders
         SET status = 'payment_confirmed',
             payment_provider = $1,
             payment_key = $2,
             external_order_id = $3,
             payment_method = $4,
             paid_at = COALESCE($5, NOW()),
             updated_at = NOW()
         WHERE id = $6`,
        [
          paymentData.paymentProvider,
          paymentData.paymentKey,
          paymentData.externalOrderId,
          paymentData.paymentMethod || null,
          paymentData.paidAt || null,
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
  // 개별 주문 상품 취소 (부분 취소용)
  // ------------------------------------------------------------------
  async cancelOrderItemPayment(
    orderItemId: number,
    cancelData: {
      status: string;
      cancelReason?: string;
    }
  ): Promise<OrderItem | undefined> {
    const [updated] = await db
      .update(orderItems)
      .set({
        status: cancelData.status,
      })
      .where(eq(orderItems.id, orderItemId))
      .returning();
    return updated;
  }

  // ------------------------------------------------------------------
  // 개별 상품 재고 복구 (부분 취소용)
  // ------------------------------------------------------------------
  async restoreStockOnItemCancel(orderItemId: number): Promise<void> {
    const client = await pool.connect();
    const logger = createLogger("StockRestoreItem");

    // 🔒 normalizeSize 함수 (createOrder와 동일)
    const normalizeSize = (size: string): string => {
      return size.trim().toLowerCase();
    };

    try {
      await client.query("BEGIN");

      // 주문 아이템 조회
      const itemResult = await client.query(
        `SELECT oi.product_id, oi.quantity, oi.options
         FROM order_items oi
         WHERE oi.id = $1`,
        [orderItemId]
      );

      if (itemResult.rows.length === 0) {
        await client.query("ROLLBACK");
        logger.warn("개별 재고 복구 실패 - 아이템 없음", { orderItemId });
        return;
      }

      const item = itemResult.rows[0];

      logger.info("개별 재고 복구 시작", {
        orderItemId,
        productId: item.product_id,
        quantity: item.quantity,
      });

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
          logger.info("개별 재고 복구 완료 (variant)", {
            orderItemId,
            productId: item.product_id,
            size: updateResult.rows[0].size,
            quantity: item.quantity,
            newStock: updateResult.rows[0].stock_quantity,
          });
        } else {
          logger.warn("개별 재고 복구 실패 - variant 찾을 수 없음", {
            orderItemId,
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
          logger.info("개별 재고 복구 완료 (기본 variant)", {
            orderItemId,
            productId: item.product_id,
            size: updateResult.rows[0].size,
            quantity: item.quantity,
            newStock: updateResult.rows[0].stock_quantity,
          });
        }
      }

      await client.query("COMMIT");
      logger.info("개별 재고 복구 트랜잭션 완료", { orderItemId });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("개별 재고 복구 실패 - 롤백", {
        orderItemId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 주문 환불 금액 누적 업데이트 (페널티 플래그 업데이트 옵션)
  // ------------------------------------------------------------------
  async addRefundedAmount(
    orderId: string,
    additionalRefundAmount: string,
    updatePenaltyFlag?: boolean
  ): Promise<Order | undefined> {
    // 페널티 플래그 업데이트가 필요한 경우
    if (updatePenaltyFlag) {
      const result = await db
        .update(orders)
        .set({
          refundedAmount: sql`COALESCE(refunded_amount, '0')::numeric + ${additionalRefundAmount}::numeric`,
          shippingPenaltyApplied: true,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();
      return result[0];
    }

    const result = await db
      .update(orders)
      .set({
        refundedAmount: sql`COALESCE(refunded_amount, '0')::numeric + ${additionalRefundAmount}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return result[0];
  }

  // ------------------------------------------------------------------
  // 판매자 귀책 취소 금액 누적 업데이트 (직권 취소 시)
  // - 직권 취소로 인해 무료배송 기준이 깨진 경우 고객 보호
  // - 이후 고객 귀책 반품 시 가상 남은 금액 계산에 사용
  // ------------------------------------------------------------------
  async addSellerCancelledAmount(
    orderId: string,
    amount: string
  ): Promise<Order | undefined> {
    const result = await db
      .update(orders)
      .set({
        sellerCancelledAmount: sql`COALESCE(seller_cancelled_amount, '0')::numeric + ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return result[0];
  }

  async manualRefundOrderItem(params: {
    orderId: string;
    orderItemId: number;
    refundAmount: number;
    cancelReason: string;
  }): Promise<void> {
    const client = await pool.connect();
    const logger = createLogger("ManualRefund");

    try {
      await client.query("BEGIN");

      const itemResult = await client.query(
        `SELECT id, order_id, status
         FROM order_items
         WHERE id = $1 AND order_id = $2
         FOR UPDATE`,
        [params.orderItemId, params.orderId],
      );

      if (itemResult.rows.length === 0) {
        const error = new Error("수기환불 처리할 주문 상품을 찾을 수 없습니다.") as Error & {
          statusCode?: number;
          code?: string;
        };
        error.statusCode = 404;
        error.code = "ORDER_ITEM_NOT_FOUND";
        throw error;
      }

      const currentStatus = String(itemResult.rows[0].status);
      if (["refunded", "cancelled"].includes(currentStatus)) {
        const error = new Error("이미 취소/환불 처리된 주문 상품입니다.") as Error & {
          statusCode?: number;
          code?: string;
        };
        error.statusCode = 400;
        error.code = "ORDER_ITEM_ALREADY_FINALIZED";
        throw error;
      }

      const orderResult = await client.query(
        `SELECT id, total_amount, refunded_amount
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [params.orderId],
      );

      if (orderResult.rows.length === 0) {
        const error = new Error("주문을 찾을 수 없습니다.") as Error & {
          statusCode?: number;
          code?: string;
        };
        error.statusCode = 404;
        error.code = "ORDER_NOT_FOUND";
        throw error;
      }

      const totalAmount = Number(orderResult.rows[0].total_amount || 0);
      const alreadyRefundedAmount = Number(orderResult.rows[0].refunded_amount || 0);
      if (alreadyRefundedAmount + params.refundAmount > totalAmount) {
        const error = new Error("누적 환불 금액이 주문 결제 금액을 초과할 수 없습니다.") as Error & {
          statusCode?: number;
          code?: string;
        };
        error.statusCode = 400;
        error.code = "REFUND_AMOUNT_EXCEEDS_TOTAL";
        throw error;
      }

      await client.query(
        `UPDATE order_items
         SET status = 'refunded'
         WHERE id = $1`,
        [params.orderItemId],
      );

      const statusesResult = await client.query(
        `SELECT status
         FROM order_items
         WHERE order_id = $1`,
        [params.orderId],
      );

      const statuses = statusesResult.rows.map((row: { status: string }) => row.status);
      const isFullRefund = statuses.every((status: string) =>
        ["refunded", "cancelled"].includes(status),
      );

      await client.query(
        `UPDATE orders
         SET status = $1,
             refunded_amount = COALESCE(refunded_amount, '0')::numeric + $2::numeric,
             cancel_reason = $3,
             canceled_at = CASE WHEN $4 THEN NOW() ELSE canceled_at END,
             updated_at = NOW()
         WHERE id = $5`,
        [
          isFullRefund ? "refunded" : "partial_refunded",
          params.refundAmount,
          params.cancelReason,
          isFullRefund,
          params.orderId,
        ],
      );

      await client.query("COMMIT");

      logger.info("관리자 수기환불 처리 완료", {
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        refundAmount: params.refundAmount,
        isFullRefund,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("관리자 수기환불 처리 실패", {
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 주문 상태만 업데이트 (orderItems는 건드리지 않음, 부분 취소 완료 시 사용)
  // ------------------------------------------------------------------
  async updateOrderStatusOnly(
    orderId: string,
    updateData: {
      status: string;
      cancelReason?: string;
    }
  ): Promise<Order | undefined> {
    const result = await db
      .update(orders)
      .set({
        status: updateData.status,
        cancelReason: updateData.cancelReason,
        canceledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return result[0];
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
        .values({
          ...addressData,
          createdAt: sql`NOW()`,
        })
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

      // 2. 새 배송지 추가 (created_at은 NOW() 사용)
      const result = await client.query(
        `INSERT INTO delivery_addresses (user_id, recipient, phone, zip_code, address, detail_address, request_note, is_default, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
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
      .values({
        ...verification,
        createdAt: sql`NOW()`,
      })
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
          gt(emailVerifications.expiresAt, sql`NOW()`)
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
          lt(emailVerifications.expiresAt, sql`NOW()`)
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

  async clearEmailVerification(email: string, type: string): Promise<void> {
    // 보안: 사용 완료된 인증 레코드를 삭제하여 재사용 방지
    await db
      .delete(emailVerifications)
      .where(
        and(
          eq(emailVerifications.email, email),
          eq(emailVerifications.type, type),
          eq(emailVerifications.verified, true)
        )
      );
  }

  // ------------------------------------------------------------------
  // Site Image operations (Main, Hero, Marquee, Journal)
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
    const [newImage] = await db
      .insert(siteImages)
      .values({
        ...image,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning();
    return newImage;
  }

  async updateSiteImage(
    id: number,
    image: Partial<InsertSiteImage>
  ): Promise<SiteImage | undefined> {
    const [updated] = await db
      .update(siteImages)
      .set({ ...image, updatedAt: sql`NOW()` })
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
  }): Promise<(Inquiry & { user: User; product?: Product | null; replyCount: number })[]> {
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

    // 문의 ID 목록 추출
    const inquiryIds = result.map((row) => row.inquiries.id);

    // 각 문의별 답변 개수를 단일 쿼리로 조회 (성능 최적화)
    let replyCountMap = new Map<string, number>();
    if (inquiryIds.length > 0) {
      const replyCounts = await db
        .select({
          inquiryId: inquiryReplies.inquiryId,
          count: count(),
        })
        .from(inquiryReplies)
        .where(inArray(inquiryReplies.inquiryId, inquiryIds))
        .groupBy(inquiryReplies.inquiryId);

      replyCountMap = new Map(
        replyCounts.map((r) => [r.inquiryId, r.count])
      );
    }

    // 결과 매핑 (답변 개수 포함)
    return result.map((row) => ({
      ...row.inquiries,
      user: row.users,
      product: row.products || null,
      replyCount: replyCountMap.get(row.inquiries.id) || 0,
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
    const [newInquiry] = await db
      .insert(inquiries)
      .values({
        ...inquiry,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning();
    return newInquiry;
  }

  async updateInquiryStatus(
    id: string,
    status: string
  ): Promise<Inquiry | undefined> {
    const [updated] = await db
      .update(inquiries)
      .set({ status, updatedAt: sql`NOW()` })
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
      .values({
        ...reply,
        createdAt: sql`NOW()`,
      })
      .returning();

    // 문의 상태를 'answered'로 업데이트
    await db
      .update(inquiries)
      .set({ status: "answered", updatedAt: sql`NOW()` })
      .where(eq(inquiries.id, reply.inquiryId));

    return newReply;
  }

  async getInquiryReply(id: number): Promise<InquiryReply | undefined> {
    const [reply] = await db
      .select()
      .from(inquiryReplies)
      .where(eq(inquiryReplies.id, id));
    return reply;
  }

  async deleteInquiryReply(id: number): Promise<void> {
    await db.delete(inquiryReplies).where(eq(inquiryReplies.id, id));
  }

  // ------------------------------------------------------------------
  // Return operations (반품 관련)
  // ------------------------------------------------------------------
  async createReturnRequest(returnData: InsertReturn): Promise<Return> {
    const [newReturn] = await db
      .insert(returns)
      .values({
        ...returnData,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning();
    return newReturn;
  }

  async getReturnRequest(id: string): Promise<Return | undefined> {
    const [returnRequest] = await db
      .select()
      .from(returns)
      .where(eq(returns.id, id));
    return returnRequest;
  }

  async getReturnsByOrderId(orderId: string): Promise<Return[]> {
    return await db
      .select()
      .from(returns)
      .where(eq(returns.orderId, orderId))
      .orderBy(desc(returns.createdAt));
  }

  async getReturnsByUserId(userId: string): Promise<Return[]> {
    return await db
      .select()
      .from(returns)
      .where(eq(returns.userId, userId))
      .orderBy(desc(returns.createdAt));
  }

  async updateReturnTracking(
    id: string,
    data: { trackingNumber: string; courierCompany: string; status: string }
  ): Promise<Return | undefined> {
    const [updated] = await db
      .update(returns)
      .set({
        returnTrackingNumber: data.trackingNumber,
        returnCourierCompany: data.courierCompany,
        status: data.status,
        updatedAt: sql`NOW()`,
      })
      .where(eq(returns.id, id))
      .returning();
    return updated;
  }

  async updateReturnInspection(
    id: string,
    data: { result: string; note?: string }
  ): Promise<Return | undefined> {
    const [updated] = await db
      .update(returns)
      .set({
        inspectionResult: data.result,
        inspectionNote: data.note,
        inspectedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(returns.id, id))
      .returning();
    return updated;
  }

  // ------------------------------------------------------------------
  // 주문 아이템 조회
  // ------------------------------------------------------------------
  async getOrderItemById(itemId: number): Promise<OrderItem | undefined> {
    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, itemId));
    return item;
  }

  async getOrderItemsByOrderId(orderId: string): Promise<OrderItem[]> {
    return await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
  }

  // ------------------------------------------------------------------
  // 부분 취소 (배송 전 즉시 환불)
  // ------------------------------------------------------------------
  async partialCancelOrder(params: {
    orderId: string;
    cancelItemIds: number[];
    refundAmount: number;
    cancelReason: string;
    isFullCancel: boolean;
    updatePenaltyFlag: boolean;
  }): Promise<void> {
    const client = await pool.connect();
    const logger = createLogger("PartialCancel");

    // normalizeSize 함수 (createOrder와 동일)
    const normalizeSize = (size: string): string => {
      return size.trim().toLowerCase();
    };

    try {
      await client.query("BEGIN");

      const { orderId, cancelItemIds, refundAmount, cancelReason, isFullCancel, updatePenaltyFlag } = params;

      logger.info("부분 취소 시작", {
        orderId,
        cancelItemIds,
        refundAmount,
        isFullCancel,
      });

      // 1. 취소 대상 아이템 조회 (재고 복구용)
      const itemsResult = await client.query(
        `SELECT id, product_id, quantity, options
         FROM order_items
         WHERE id = ANY($1)`,
        [cancelItemIds]
      );

      // 2. 아이템 상태 업데이트
      for (const itemId of cancelItemIds) {
        await client.query(
          `UPDATE order_items
           SET status = 'refunded'
           WHERE id = $1`,
          [itemId]
        );
      }

      // 3. 재고 복구
      for (const item of itemsResult.rows) {
        let variantSize: string | null = null;
        if (item.options) {
          const match = item.options.match(/Size:\s*(.+?)$/im);
          if (match) {
            variantSize = normalizeSize(match[1]);
          }
        }

        if (variantSize) {
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
          }
        }
      }

      // 4. 주문 상태 및 환불 금액 업데이트 (atomic increment + RETURNING)
      // race condition 방지: SELECT-modify-UPDATE 대신 단일 UPDATE에서 누적 처리
      // updatePenaltyFlag=true일 때만 페널티 플래그를 강제 설정, 그 외에는 기존값 유지
      const orderUpdateResult = await client.query(
        `UPDATE orders
         SET status = $1,
             refunded_amount = COALESCE(refunded_amount, '0')::numeric + $2::numeric,
             cancel_reason = $3,
             canceled_at = CASE WHEN $4 THEN NOW() ELSE canceled_at END,
             shipping_penalty_applied = CASE WHEN $5 THEN true ELSE shipping_penalty_applied END,
             updated_at = NOW()
         WHERE id = $6
         RETURNING refunded_amount`,
        [
          isFullCancel ? "refunded" : "partial_refunded",
          refundAmount,
          cancelReason,
          isFullCancel,
          updatePenaltyFlag,
          orderId,
        ]
      );

      await client.query("COMMIT");

      logger.info("부분 취소 완료", {
        orderId,
        canceledItemCount: cancelItemIds.length,
        totalRefundAmount: orderUpdateResult.rows[0]?.refunded_amount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("부분 취소 실패", {
        orderId: params.orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 아이템 상태 기반 주문 상태 동기화
  // ------------------------------------------------------------------
  async syncOrderStatusFromItems(orderId: string): Promise<void> {
    const client = await pool.connect();
    const logger = createLogger("SyncOrderStatus");

    try {
      await client.query("BEGIN");

      // 1. 해당 주문의 전체 아이템 status 조회
      const itemsResult = await client.query(
        `SELECT status FROM order_items WHERE order_id = $1`,
        [orderId]
      );

      if (itemsResult.rows.length === 0) {
        await client.query("COMMIT");
        return;
      }

      const statuses = itemsResult.rows.map((r: { status: string }) => r.status);
      const finalStatuses = ["purchase_confirmed", "refunded", "cancelled"];

      // 2. 모든 아이템이 purchase_confirmed → 주문도 purchase_confirmed
      if (statuses.every((s: string) => s === "purchase_confirmed")) {
        await client.query(
          `UPDATE orders
           SET status = 'purchase_confirmed',
               confirmed_at = COALESCE(confirmed_at, NOW()),
               updated_at = NOW()
           WHERE id = $1`,
          [orderId]
        );
        logger.info("주문 상태 동기화: purchase_confirmed", { orderId });
      }
      // 3. 모든 아이템이 최종 상태 (purchase_confirmed, refunded, cancelled) → 다수결
      else if (statuses.every((s: string) => finalStatuses.includes(s))) {
        // 다수결로 주문 상태 결정
        const statusCounts: Record<string, number> = {};
        for (const s of statuses) {
          statusCounts[s] = (statusCounts[s] || 0) + 1;
        }

        let dominantStatus = "purchase_confirmed";
        let maxCount = 0;
        for (const [status, cnt] of Object.entries(statusCounts)) {
          if (cnt > maxCount) {
            maxCount = cnt;
            dominantStatus = status;
          }
        }

        const updateFields: string[] = [
          `status = $2`,
          `updated_at = NOW()`,
        ];
        const params: (string | null)[] = [orderId, dominantStatus];

        if (dominantStatus === "purchase_confirmed") {
          updateFields.push(`confirmed_at = COALESCE(confirmed_at, NOW())`);
        }

        await client.query(
          `UPDATE orders SET ${updateFields.join(", ")} WHERE id = $1`,
          params
        );
        logger.info("주문 상태 동기화: 최종 상태", { orderId, dominantStatus });
      }
      // 4. 모든 아이템이 delivered 이상이고, delivered 아이템이 1개 이상 → delivered
      else if (
        statuses.every((s: string) => s === "delivered" || finalStatuses.includes(s)) &&
        statuses.some((s: string) => s === "delivered")
      ) {
        await client.query(
          `UPDATE orders
           SET status = 'delivered',
               delivered_at = COALESCE(delivered_at, NOW()),
               updated_at = NOW()
           WHERE id = $1`,
          [orderId]
        );
        logger.info("주문 상태 동기화: delivered", { orderId });
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("주문 상태 동기화 실패", {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 반품 완료 처리
  // ------------------------------------------------------------------
  async completeReturn(
    returnId: string,
    params: {
      refundAmount: number;
      inspectionResult: string;
      inspectionNote?: string;
      updatePenaltyFlag: boolean;
      isLastItem: boolean;
    }
  ): Promise<void> {
    const client = await pool.connect();
    const logger = createLogger("CompleteReturn");

    // normalizeSize 함수 (createOrder와 동일)
    const normalizeSize = (size: string): string => {
      return size.trim().toLowerCase();
    };

    try {
      await client.query("BEGIN");

      // 1. 반품 정보 조회
      const returnResult = await client.query(
        `SELECT order_id, order_item_id FROM returns WHERE id = $1`,
        [returnId]
      );

      if (returnResult.rows.length === 0) {
        throw new Error("반품 요청을 찾을 수 없습니다");
      }

      const { order_id: orderId, order_item_id: orderItemId } = returnResult.rows[0];

      logger.info("반품 완료 처리 시작", {
        returnId,
        orderId,
        orderItemId,
        refundAmount: params.refundAmount,
      });

      // 2. 반품 상태 업데이트
      await client.query(
        `UPDATE returns
         SET status = 'refunded',
             refund_amount = $1,
             inspection_result = $2,
             inspection_note = $3,
             inspected_at = NOW(),
             refunded_at = NOW(),
             updated_at = NOW()
         WHERE id = $4`,
        [params.refundAmount, params.inspectionResult, params.inspectionNote || null, returnId]
      );

      // 3. 아이템 정보 조회 (재고 복구용)
      const itemResult = await client.query(
        `SELECT product_id, quantity, options FROM order_items WHERE id = $1`,
        [orderItemId]
      );

      if (itemResult.rows.length === 0) {
        throw new Error("주문 아이템을 찾을 수 없습니다");
      }

      const item = itemResult.rows[0];

      // 4. 아이템 상태 업데이트
      await client.query(
        `UPDATE order_items SET status = 'refunded' WHERE id = $1`,
        [orderItemId]
      );

      // 5. 재고 복구
      let variantSize: string | null = null;
      if (item.options) {
        const match = item.options.match(/Size:\s*(.+?)$/im);
        if (match) {
          variantSize = normalizeSize(match[1]);
        }
      }

      if (variantSize) {
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
        }
      }

      // 6. 주문 상태 업데이트 (atomic increment)
      // race condition 방지: SELECT-modify-UPDATE 대신 단일 UPDATE에서 누적 처리
      const orderUpdate = await client.query(
        `UPDATE orders
         SET status = $1,
             refunded_amount = COALESCE(refunded_amount, '0')::numeric + $2::numeric,
             shipping_penalty_applied = CASE WHEN $3 THEN true ELSE shipping_penalty_applied END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING refunded_amount`,
        [
          params.isLastItem ? "refunded" : "partial_refunded",
          params.refundAmount,
          params.updatePenaltyFlag,
          orderId,
        ]
      );

      await client.query("COMMIT");

      logger.info("반품 완료 처리 완료", {
        returnId,
        orderId,
        refundAmount: params.refundAmount,
        totalRefundedAmount: orderUpdate.rows[0]?.refunded_amount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("반품 완료 처리 실패", {
        returnId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }
}

export const storage = new DatabaseStorage();
