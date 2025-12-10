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
  type InsertOrderItem,
  type ProductVariant,
  type InsertProductVariant,
  type ProductSizeMeasurement,
  type InsertProductSizeMeasurement,
  type DeliveryAddress,
  type InsertDeliveryAddress,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, like, sql, desc } from "drizzle-orm";
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<UpsertUser, "id">): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: number, user: Partial<UpsertUser>): Promise<User | undefined>; // [추가됨]

  // Product operations
  getProducts(filters?: {
    search?: string;
    categoryId?: number;
  }): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(
    id: number,
    product: Partial<InsertProduct>
  ): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;

  // Product variant operations
  getProductVariants(productId: number): Promise<ProductVariant[]>;
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

  // Cart operations
  getCartItems(userId: number): Promise<(CartItem & { product: Product })[]>;
  addCartItem(item: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: number, quantity: number): Promise<CartItem | undefined>;
  deleteCartItem(id: number): Promise<void>;
  clearCart(userId: number): Promise<void>;

  // Order operations
  createOrder(
    order: InsertOrder,
    items: Omit<InsertOrderItem, "orderId">[]
  ): Promise<number>;
  getOrders(userId: number): Promise<Order[]>;
  getOrder(
    orderId: number
  ): Promise<
    (Order & { orderItems: (OrderItem & { product: Product })[] }) | undefined
  >;
  getAllOrders(): Promise<Order[]>;

  // [수정] 관리자용: 모든 주문과 상세 아이템 조회
  getAllOrdersWithItems(): Promise<(Order & { orderItems: any[] })[]>;

  updateOrderStatus(
    orderId: number,
    status: string,
    trackingNumber?: string
  ): Promise<Order | undefined>;

  // 주문 아이템 상태 업데이트
  updateOrderItemStatus(
    itemId: number,
    status: string,
    trackingNumber?: string
  ): Promise<OrderItem | undefined>;

  // [신규] 배송지 관리
  getDeliveryAddresses(userId: number): Promise<DeliveryAddress[]>;
  createDeliveryAddress(
    address: InsertDeliveryAddress
  ): Promise<DeliveryAddress>;
  updateDeliveryAddress(
    id: number,
    userId: number,
    address: Partial<InsertDeliveryAddress>
  ): Promise<DeliveryAddress | undefined>;
  deleteDeliveryAddress(id: number, userId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
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

  // [추가됨] 정보 수정 전용 (UPDATE Only)
  async updateUser(
    id: number,
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

  // Product operations
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
      query = query.where(and(...conditions)) as any;
    }

    const results = await query.orderBy(desc(products.createdAt));
    return results;
  }

  async getProduct(id: number): Promise<Product | undefined> {
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
    id: number,
    product: Partial<InsertProduct>
  ): Promise<Product | undefined> {
    const [updated] = await db
      .update(products)
      .set({ ...product, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // Product variant operations
  async getProductVariants(productId: number): Promise<ProductVariant[]> {
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

  // Product size measurements operations
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

  // Category operations
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

  // Cart operations
  async getCartItems(
    userId: number
  ): Promise<(CartItem & { product: Product })[]> {
    const items = await db
      .select()
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.userId, userId));

    return items.map((item) => ({
      ...item.cart_items,
      product: item.products,
    }));
  }

  async addCartItem(item: InsertCartItem): Promise<CartItem> {
    const existing = await db
      .select()
      .from(cartItems)
      .where(
        and(
          eq(cartItems.userId, item.userId),
          eq(cartItems.productId, item.productId)
        )
      );

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
    id: number,
    quantity: number
  ): Promise<CartItem | undefined> {
    const [updated] = await db
      .update(cartItems)
      .set({ quantity, updatedAt: new Date() })
      .where(eq(cartItems.id, id))
      .returning();
    return updated;
  }

  async deleteCartItem(id: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearCart(userId: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

  // Order operations
  async createOrder(
    order: InsertOrder,
    items: Omit<InsertOrderItem, "orderId">[]
  ): Promise<number> {
    const [newOrder] = await db.insert(orders).values(order).returning();

    const orderItemsWithOrderId = items.map((item) => ({
      ...item,
      orderId: newOrder.id,
    }));

    await db.insert(orderItems).values(orderItemsWithOrderId);

    return newOrder.id;
  }

  async getOrders(userId: number): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async getOrder(
    orderId: number
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

  // [수정] 관리자용: 모든 주문과 상세 아이템 조회 (Join)
  async getAllOrdersWithItems() {
    const allOrders = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt));

    const allItems = await db
      .select()
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id));

    return allOrders.map((order) => {
      const items = allItems
        .filter((row) => row.order_items.orderId === order.id)
        .map((row) => ({
          ...row.order_items,
          product: row.products,
        }));

      return {
        ...order,
        orderItems: items,
      };
    });
  }

  async updateOrderStatus(
    orderId: number,
    status: string,
    trackingNumber?: string
  ): Promise<Order | undefined> {
    const updateData: any = { status, updatedAt: new Date() };
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
    const updateData: any = { status };
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

  // [구현] 배송지 목록 조회 (기본 배송지가 맨 위로 오도록 정렬)
  async getDeliveryAddresses(userId: number): Promise<DeliveryAddress[]> {
    return await db
      .select()
      .from(deliveryAddresses)
      .where(eq(deliveryAddresses.userId, userId))
      .orderBy(
        desc(deliveryAddresses.isDefault),
        desc(deliveryAddresses.createdAt)
      );
  }

  // [구현] 배송지 추가
  async createDeliveryAddress(
    addressData: InsertDeliveryAddress
  ): Promise<DeliveryAddress> {
    // 만약 이번에 추가하는 주소가 '기본 배송지'라면, 기존 것들의 기본 설정을 해제
    if (addressData.isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(eq(deliveryAddresses.userId, addressData.userId));
    }

    const [newAddress] = await db
      .insert(deliveryAddresses)
      .values(addressData)
      .returning();
    return newAddress;
  }

  // [구현] 배송지 수정
  async updateDeliveryAddress(
    id: number,
    userId: number,
    addressData: Partial<InsertDeliveryAddress>
  ): Promise<DeliveryAddress | undefined> {
    // 기본 배송지로 설정하는 경우, 다른 주소들 초기화
    if (addressData.isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(eq(deliveryAddresses.userId, userId));
    }

    const [updated] = await db
      .update(deliveryAddresses)
      .set(addressData)
      .where(
        and(eq(deliveryAddresses.id, id), eq(deliveryAddresses.userId, userId))
      )
      .returning();
    return updated;
  }

  // [구현] 배송지 삭제
  async deleteDeliveryAddress(id: number, userId: number): Promise<void> {
    await db
      .delete(deliveryAddresses)
      .where(
        and(eq(deliveryAddresses.id, id), eq(deliveryAddresses.userId, userId))
      );
  }
}

export const storage = new DatabaseStorage();
