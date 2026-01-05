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
import { eq, and, like, desc, isNull, gt, lt, count } from "drizzle-orm";
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
  createUser(user: Omit<UpsertUser, "id">): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, user: Partial<UpsertUser>): Promise<User | undefined>;

  // Product operations (UUID 기반)
  getProducts(filters?: {
    search?: string;
    categoryId?: number;
  }): Promise<Product[]>;
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
  }): Promise<Product[]> {
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
    return results;
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
    // 트랜잭션으로 주문과 주문 아이템을 원자적으로 생성
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. 주문 생성 (배송 상세주소, 배송요청사항, PG사 주문ID 포함)
      const orderResult = await client.query(
        `INSERT INTO orders (user_id, total_amount, status, shipping_name, shipping_phone, shipping_postal_code, shipping_address, shipping_detail_address, shipping_request_note, external_order_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
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
        ]
      );
      const orderId = orderResult.rows[0].id;

      // 2. 주문 아이템 생성
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

      await client.query("COMMIT");
      return orderId;
    } catch (error) {
      await client.query("ROLLBACK");
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
    const [updated] = await db
      .update(orders)
      .set({
        paymentProvider: paymentData.paymentProvider,
        paymentKey: paymentData.paymentKey,
        externalOrderId: paymentData.externalOrderId,
        paymentMethod: paymentData.paymentMethod,
        status: paymentData.status,
        paidAt: paymentData.paidAt,
        updatedAt: getKSTDate(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
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
    const [updated] = await db
      .update(orders)
      .set({
        status: cancelData.status,
        canceledAt: cancelData.canceledAt,
        cancelReason: cancelData.cancelReason,
        refundedAmount: cancelData.refundedAmount,
        updatedAt: getKSTDate(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
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
      if (order.status !== "pending_payment") {
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
          }
        } else {
          // variant가 없는 경우: products 테이블의 재고 확인
          const productResult = await client.query(
            `SELECT id, stock_quantity, name
             FROM products
             WHERE id = $1
             FOR UPDATE`,
            [item.product_id]
          );

          if (productResult.rows.length > 0) {
            const product = productResult.rows[0];
            const available = product.stock_quantity;

            if (available < item.quantity) {
              insufficientStock.push({
                productName: product.name,
                requested: item.quantity,
                available: available,
              });
            } else {
              // 재고 차감
              await client.query(
                `UPDATE products
                 SET stock_quantity = stock_quantity - $1, updated_at = NOW()
                 WHERE id = $2`,
                [item.quantity, product.id]
              );
            }
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

    try {
      await client.query("BEGIN");

      // 주문 아이템 조회
      const itemsResult = await client.query(
        `SELECT oi.product_id, oi.quantity, oi.options
         FROM order_items oi
         WHERE oi.order_id = $1`,
        [orderId]
      );

      for (const item of itemsResult.rows) {
        // 옵션에서 사이즈 추출
        let variantSize: string | null = null;
        if (item.options) {
          const match = item.options.match(/Size:\s*(\S+)/i);
          if (match) {
            variantSize = match[1];
          }
        }

        if (variantSize) {
          // variant 재고 복구
          await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE product_id = $2 AND size = $3`,
            [item.quantity, item.product_id, variantSize]
          );
        } else {
          // product 재고 복구
          await client.query(
            `UPDATE products
             SET stock_quantity = stock_quantity + $1, updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, item.product_id]
          );
        }
      }

      await client.query("COMMIT");
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
        const match = item.options.match(/Size:\s*(\S+)/i);
        if (match) {
          const size = match[1];
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
