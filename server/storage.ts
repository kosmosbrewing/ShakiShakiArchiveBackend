import {
  users,
  products,
  categories,
  cartItems,
  orders,
  orderItems,
  productVariants,
  productSizeMeasurements,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, like, sql, desc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<UpsertUser, "id">): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: number, user: Partial<UpsertUser>): Promise<User | undefined>;

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

  // Product size measurements operations ✨ NEW
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
  updateOrderStatus(
    orderId: number,
    status: string,
    trackingNumber?: string
  ): Promise<Order | undefined>;
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

  async updateUser(
    id: number,
    userData: Partial<UpsertUser>
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        ...userData,
        updatedAt: new Date(), // 수정 시간 갱신
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

  // Product size measurements operations ✨ NEW
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
}

export const storage = new DatabaseStorage();
