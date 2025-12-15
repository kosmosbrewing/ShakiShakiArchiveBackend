import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  decimal,
  timestamp,
  boolean,
  jsonb,
  index,
  serial,
  bigint,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// [수정] Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  // [변경] firstName, lastName -> userName
  userName: varchar("user_name", { length: 100 }).notNull(),
  // [추가] 주소 및 연락처 정보
  zipCode: varchar("zip_code", { length: 20 }),
  address: varchar("address", { length: 255 }),
  detailAddress: varchar("detail_address", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  emailOptIn: boolean("email_opt_in").default(false).notNull(), // 이메일 수신 여부

  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

// [수정] Auth schemas
export const signupSchema = z.object({
  email: z.string().email("유효한 이메일 주소를 입력해주세요"),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
  userName: z.string().min(1, "이름을 입력해주세요"), // 변경됨
  // 선택 정보 (회원가입 시 받을 수도, 나중에 수정할 수도 있음)
  zipCode: z.string().optional(),
  address: z.string().optional(),
  detailAddress: z.string().optional(),
  phone: z.string().optional(),
  emailOptIn: z.boolean().optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email("유효한 이메일 주소를 입력해주세요"),
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Categories table
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  description: text("description"),
  imageUrl: varchar("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export type Category = typeof categories.$inferSelect;
export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});
export type InsertCategory = z.infer<typeof insertCategorySchema>;

// Products table
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  categoryId: bigint("category_id", { mode: "number" }).references(
    () => categories.id
  ),
  imageUrl: varchar("image_url"),
  images: text("images").array(),
  detailImages: text("detail_images").array(),
  stockQuantity: integer("stock_quantity").default(0).notNull(),
  isAvailable: boolean("is_available").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ------------------------------------------------------------------
// [신규 생성] Users Relations (기존에 없었으므로 새로 정의)
// ------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  cartItems: many(cartItems),
  orders: many(orders),
  deliveryAddresses: many(deliveryAddresses),
  // [추가] 위시리스트 연결
  wishlistItems: many(wishlistItems),
}));

// ------------------------------------------------------------------
// [수정] Products Relations (위시리스트 추가)
// ------------------------------------------------------------------
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  cartItems: many(cartItems),
  orderItems: many(orderItems),
  productVariants: many(productVariants),
  // [추가] 위시리스트 연결
  wishlistItems: many(wishlistItems),
}));

export type Product = typeof products.$inferSelect;
export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;

// Shopping cart items
export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  productId: bigint("product_id", { mode: "number" })
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  variantId: bigint("variant_id", { mode: "number" }).references(
    () => productVariants.id,
    { onDelete: "set null" }
  ),
  quantity: integer("quantity").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  user: one(users, {
    fields: [cartItems.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
  // [신규] 옵션 정보 연결
  variant: one(productVariants, {
    fields: [cartItems.variantId],
    references: [productVariants.id],
  }),
}));

export type CartItem = typeof cartItems.$inferSelect;
export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;

// Order status enum
export const orderStatusEnum = [
  "pending_payment",
  "payment_confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof orderStatusEnum)[number];

// Orders table
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .references(() => users.id)
    .notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 })
    .default("pending_payment")
    .notNull(),
  shippingName: varchar("shipping_name", { length: 100 }).notNull(),
  shippingPhone: varchar("shipping_phone", { length: 20 }).notNull(),
  shippingAddress: text("shipping_address").notNull(),
  shippingPostalCode: varchar("shipping_postal_code", { length: 20 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  orderItems: many(orderItems),
}));

export type Order = typeof orders.$inferSelect;
export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;

// Order items table
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: bigint("order_id", { mode: "number" })
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  productId: bigint("product_id", { mode: "number" })
    .references(() => products.id)
    .notNull(),
  productName: varchar("product_name", { length: 255 }).notNull(),
  productPrice: decimal("product_price", { precision: 10, scale: 2 }).notNull(),
  options: text("options"),
  quantity: integer("quantity").notNull(),

  // [추가됨] 개별 상품 상태 및 운송장
  status: varchar("status", { length: 50 })
    .default("pending_payment")
    .notNull(),
  trackingNumber: varchar("tracking_number", { length: 100 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export type OrderItem = typeof orderItems.$inferSelect;
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

// Product variants/sizes table
export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: bigint("product_id", { mode: "number" })
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  size: varchar("size", { length: 50 }).notNull(),
  color: varchar("color", { length: 50 }),
  sku: varchar("sku", { length: 100 }).unique(),
  price: decimal("price", { precision: 10, scale: 2 }),
  stockQuantity: integer("stock_quantity").default(0).notNull(),
  isAvailable: boolean("is_available").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const productVariantsRelations = relations(
  productVariants,
  ({ one }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
  })
);

export type ProductVariant = typeof productVariants.$inferSelect;
export const insertProductVariantSchema = createInsertSchema(
  productVariants
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;

// Product size measurements table
export const productSizeMeasurements = pgTable("product_size_measurements", {
  id: serial("id").primaryKey(),
  productVariantId: bigint("product_variant_id", { mode: "number" })
    .references(() => productVariants.id, { onDelete: "cascade" })
    .notNull(),
  totalLength: decimal("total_length", { precision: 8, scale: 2 }),
  shoulderWidth: decimal("shoulder_width", { precision: 8, scale: 2 }),
  chestSection: decimal("chest_section", { precision: 8, scale: 2 }),
  sleeveLength: decimal("sleeve_length", { precision: 8, scale: 2 }),
  waistSection: decimal("waist_section", { precision: 8, scale: 2 }),
  hipSection: decimal("hip_section", { precision: 8, scale: 2 }),
  thighSection: decimal("thigh_section", { precision: 8, scale: 2 }),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productSizeMeasurementsRelations = relations(
  productSizeMeasurements,
  ({ one }) => ({
    productVariant: one(productVariants, {
      fields: [productSizeMeasurements.productVariantId],
      references: [productVariants.id],
    }),
  })
);

export type ProductSizeMeasurement =
  typeof productSizeMeasurements.$inferSelect;
export const insertProductSizeMeasurementSchema = createInsertSchema(
  productSizeMeasurements
).omit({
  id: true,
  createdAt: true,
});
export type InsertProductSizeMeasurement = z.infer<
  typeof insertProductSizeMeasurementSchema
>;

// [신규] 배송지 관리 테이블
export const deliveryAddresses = pgTable("delivery_addresses", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  recipient: varchar("recipient", { length: 100 }).notNull(), // 받는 사람 이름
  phone: varchar("phone", { length: 20 }).notNull(), // 전화번호
  zipCode: varchar("zip_code", { length: 20 }).notNull(), // 우편번호
  address: varchar("address", { length: 255 }).notNull(), // 기본 주소
  detailAddress: varchar("detail_address", { length: 255 }), // 상세 주소
  requestNote: varchar("request_note", { length: 255 }), // 배송 요청사항
  isDefault: boolean("is_default").default(false).notNull(), // 기본 배송지 여부
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DeliveryAddress = typeof deliveryAddresses.$inferSelect;
export const insertDeliveryAddressSchema = createInsertSchema(
  deliveryAddresses
).omit({
  id: true,
  createdAt: true,
});

export type InsertDeliveryAddress = z.infer<typeof insertDeliveryAddressSchema>;

// ------------------------------------------------------------------
// [신규] 7. 위시리스트 (Wishlist Items)
// ------------------------------------------------------------------
export const wishlistItems = pgTable("wishlist_items", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  productId: bigint("product_id", { mode: "number" })
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 위시리스트 관계 정의 (User와 Product를 연결)
export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
  user: one(users, {
    fields: [wishlistItems.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [wishlistItems.productId],
    references: [products.id],
  }),
}));

export type WishlistItem = typeof wishlistItems.$inferSelect;
export const insertWishlistItemSchema = createInsertSchema(wishlistItems).omit({
  id: true,
  createdAt: true,
});
export type InsertWishlistItem = z.infer<typeof insertWishlistItemSchema>;
