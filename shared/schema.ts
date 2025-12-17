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
  // [수정] nullable로 변경 - 소셜 로그인 사용자는 비밀번호 없음
  passwordHash: varchar("password_hash", { length: 255 }),
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

  // [추가] 소셜 로그인 관련 필드
  naverId: varchar("naver_id", { length: 100 }).unique(), // 네이버 고유 ID
  socialProvider: varchar("social_provider", { length: 20 }), // 'naver', 'kakao' 등

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

// Categories table (id 직접 입력 가능)
export const categories = pgTable("categories", {
  id: integer("id").primaryKey(), // serial 대신 integer로 변경하여 직접 입력 가능
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
  // 배송 정보 (deliveryAddresses 테이블 구조 참고)
  shippingName: varchar("shipping_name", { length: 100 }).notNull(),
  shippingPhone: varchar("shipping_phone", { length: 20 }).notNull(),
  shippingPostalCode: varchar("shipping_postal_code", { length: 20 }).notNull(),
  shippingAddress: text("shipping_address").notNull(), // 기본 주소
  shippingDetailAddress: varchar("shipping_detail_address", { length: 255 }), // 상세 주소
  shippingRequestNote: varchar("shipping_request_note", { length: 255 }), // 배송 요청사항
  trackingNumber: varchar("tracking_number", { length: 100 }),
  // 결제 정보 (PG사 통합 대응: 토스페이먼츠, 네이버페이 등)
  paymentProvider: varchar("payment_provider", { length: 50 }), // 'toss', 'naverpay', 'kakaopay' 등
  paymentKey: varchar("payment_key", { length: 200 }), // PG사 결제 고유 키
  externalOrderId: varchar("external_order_id", { length: 64 }), // PG사 주문 ID
  paymentMethod: varchar("payment_method", { length: 50 }), // 'card', 'transfer', 'naverpay' 등
  paidAt: timestamp("paid_at"),
  canceledAt: timestamp("canceled_at"),
  cancelReason: text("cancel_reason"),
  refundedAmount: decimal("refunded_amount", {
    precision: 10,
    scale: 2,
  }).default("0"),
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

// ------------------------------------------------------------------
// 토스페이먼츠 결제 관련 Zod 스키마
// ------------------------------------------------------------------

// 결제 승인 요청 스키마
export const confirmPaymentSchema = z.object({
  paymentKey: z.string().max(200, "paymentKey는 최대 200자입니다"),
  orderId: z.string().min(6).max(64, "orderId는 6-64자입니다"),
  amount: z.number().positive("결제 금액은 양수여야 합니다"),
});
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

// 결제 취소 요청 스키마
export const cancelPaymentSchema = z.object({
  cancelReason: z.string().min(1, "취소 사유를 입력해주세요"),
  cancelAmount: z.number().positive().optional(), // 부분 취소 시
  refundReceiveAccount: z
    .object({
      bank: z.string(),
      accountNumber: z.string(),
      holderName: z.string(),
    })
    .optional(), // 가상계좌 환불 시
});
export type CancelPaymentInput = z.infer<typeof cancelPaymentSchema>;

// ------------------------------------------------------------------
// 이메일 인증코드 테이블
// ------------------------------------------------------------------
export const emailVerifications = pgTable("email_verifications", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(), // 6자리 인증코드
  type: varchar("type", { length: 20 }).notNull(), // 'signup', 'password_reset' 등
  verified: boolean("verified").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(), // 만료 시간
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EmailVerification = typeof emailVerifications.$inferSelect;
export const insertEmailVerificationSchema = createInsertSchema(
  emailVerifications
).omit({
  id: true,
  verified: true,
  createdAt: true,
});
export type InsertEmailVerification = z.infer<
  typeof insertEmailVerificationSchema
>;

// 이메일 인증코드 요청 스키마
export const sendVerificationCodeSchema = z.object({
  email: z.string().email("유효한 이메일 주소를 입력해주세요"),
  type: z.enum(["signup", "password_reset"]).default("signup"),
});
export type SendVerificationCodeInput = z.infer<
  typeof sendVerificationCodeSchema
>;

// 이메일 인증코드 확인 스키마
export const verifyEmailCodeSchema = z.object({
  email: z.string().email("유효한 이메일 주소를 입력해주세요"),
  code: z.string().length(6, "인증코드는 6자리입니다"),
  type: z.enum(["signup", "password_reset"]).default("signup"),
});
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;
