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
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, like, desc, isNull, gt } from "drizzle-orm";
import type {
  OrderItemCreateData,
  OrderStatusUpdate,
  OrderItemStatusUpdate,
} from "./types";

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
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(
    id: string,
    product: Partial<InsertProduct>
  ): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;

  // Product variant operations (productId는 UUID, variant id는 serial)
  getProductVariants(productId: string): Promise<ProductVariant[]>;
  getProductVariant(id: number): Promise<ProductVariant | undefined>;
  createProductVariant(variant: InsertProductVariant): Promise<ProductVariant>;
  updateProductVariant(
    id: number,
    variant: Partial<InsertProductVariant>
  ): Promise<ProductVariant | undefined>;
  deleteProductVariant(id: number): Promise<void>;

  // Product size measurements operations
  getProductSizeMeasurements(
    productVariantId: number
  ): Promise<ProductSizeMeasurement[]>;
  getProductSizeMeasurement(
    id: number
  ): Promise<ProductSizeMeasurement | undefined>;
  createProductSizeMeasurement(
    measurement: InsertProductSizeMeasurement
  ): Promise<ProductSizeMeasurement>;
  updateProductSizeMeasurement(
    id: number,
    measurement: Partial<InsertProductSizeMeasurement>
  ): Promise<ProductSizeMeasurement | undefined>;
  deleteProductSizeMeasurement(id: number): Promise<void>;

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
          updatedAt: new Date(),
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
        updatedAt: new Date(),
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

    const results = await query.orderBy(desc(products.createdAt));
    return results;
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id));
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
      .set({ ...product, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // ------------------------------------------------------------------
  // Product variant operations (productId는 UUID, variant id는 serial)
  // ------------------------------------------------------------------
  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    return await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(productVariants.size);
  }

  async getProductVariant(id: number): Promise<ProductVariant | undefined> {
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
    id: number,
    variant: Partial<InsertProductVariant>
  ): Promise<ProductVariant | undefined> {
    const [updated] = await db
      .update(productVariants)
      .set({ ...variant, updatedAt: new Date() })
      .where(eq(productVariants.id, id))
      .returning();
    return updated;
  }

  async deleteProductVariant(id: number): Promise<void> {
    await db.delete(productVariants).where(eq(productVariants.id, id));
  }

  // ------------------------------------------------------------------
  // Product size measurements operations
  // ------------------------------------------------------------------
  async getProductSizeMeasurements(
    productVariantId: number
  ): Promise<ProductSizeMeasurement[]> {
    return await db
      .select()
      .from(productSizeMeasurements)
      .where(eq(productSizeMeasurements.productVariantId, productVariantId));
  }

  async getProductSizeMeasurement(
    id: number
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
    id: number,
    measurement: Partial<InsertProductSizeMeasurement>
  ): Promise<ProductSizeMeasurement | undefined> {
    const [updated] = await db
      .update(productSizeMeasurements)
      .set(measurement)
      .where(eq(productSizeMeasurements.id, id))
      .returning();
    return updated;
  }

  async deleteProductSizeMeasurement(id: number): Promise<void> {
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
      .set({ quantity, updatedAt: new Date() })
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
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!order) return undefined;

    const items = await db
      .select()
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));

    return {
      ...order,
      orderItems: items.map((item) => ({
        ...item.order_items,
        product: item.products,
      })),
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
    const updateData: OrderStatusUpdate = { status, updatedAt: new Date() };
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
        updatedAt: new Date(),
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
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
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
    // expiresAt < now (만료됨)를 의미하려면 lt 사용
    await db
      .delete(emailVerifications)
      .where(eq(emailVerifications.verified, false));
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
      .set({ ...image, updatedAt: new Date() })
      .where(eq(siteImages.id, id))
      .returning();
    return updated;
  }

  async deleteSiteImage(id: number): Promise<void> {
    await db.delete(siteImages).where(eq(siteImages.id, id));
  }

  async countSiteImagesByType(type: SiteImageType): Promise<number> {
    const result = await db
      .select()
      .from(siteImages)
      .where(eq(siteImages.type, type));
    return result.length;
  }
}

export const storage = new DatabaseStorage();
