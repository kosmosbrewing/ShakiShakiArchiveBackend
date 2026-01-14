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
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { DISPOSABLE_EMAIL_DOMAINS } from "./constants/disposable-emails";

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

// [수정] Users table - UUID PK 사용
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(), // UUID 자동 생성
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
  kakaoId: varchar("kakao_id", { length: 100 }).unique(), // 카카오 고유 ID
  socialProvider: varchar("social_provider", { length: 20 }), // 'naver', 'kakao' 등

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

// ------------------------------------------------------------------
// 이메일 도메인 검증 (일회용 이메일 차단)
// ------------------------------------------------------------------

/**
 * 이메일 도메인이 유효한지 검증
 * - 일회용 이메일 차단
 * - RFC 5322 기반 도메인 형식 검증
 *
 * 검증 규칙:
 * 1. 최소 2개의 파트 필요 (domain.tld)
 * 2. 각 파트는 영문자, 숫자, 하이픈만 허용
 * 3. 하이픈은 시작/끝에 올 수 없음
 * 4. 연속된 점 불가
 * 5. TLD는 최소 2자 이상, 숫자만으로 구성 불가
 */
function validateEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;

  // 일회용 이메일 도메인 차단
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return false;
  }

  // 도메인 검증
  const parts = domain.split(".");

  // 최소 2개 파트 필요 (예: example.com)
  if (parts.length < 2) return false;

  // 각 파트(라벨) 검증
  for (const part of parts) {
    // 빈 파트 차단 (연속된 점 방지)
    if (part.length === 0) return false;

    // 파트 길이 제한 (RFC 1035: 최대 63자)
    if (part.length > 63) return false;

    // 하이픈으로 시작하거나 끝나면 안됨
    if (part.startsWith("-") || part.endsWith("-")) return false;

    // 영문자, 숫자, 하이픈만 허용
    if (!/^[a-z0-9-]+$/i.test(part)) return false;
  }

  // TLD(최상위 도메인) 검증
  const tld = parts[parts.length - 1];

  // TLD는 최소 2자 이상
  if (tld.length < 2) return false;

  // TLD는 숫자로만 이루어질 수 없음
  if (/^\d+$/.test(tld)) return false;

  // 도메인 전체 길이 제한 (RFC 1035: 최대 253자)
  if (domain.length > 253) return false;

  return true;
}

// ------------------------------------------------------------------
// 비밀번호 복잡성 검증 함수 (OWASP 기준)
// ------------------------------------------------------------------
/**
 * OWASP 권장 비밀번호 복잡성 규칙:
 * - 최소 8자 이상
 * - 영문 대/소문자, 숫자, 특수문자 중 최소 3가지 조합
 */
function validatePasswordComplexity(password: string): boolean {
  if (password.length < 8) return false;

  let complexity = 0;
  if (/[a-z]/.test(password)) complexity++; // 영문 소문자
  if (/[A-Z]/.test(password)) complexity++; // 영문 대문자
  if (/[0-9]/.test(password)) complexity++; // 숫자
  if (/[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/~`]/.test(password)) complexity++; // 특수문자

  return complexity >= 3; // 최소 3가지 조합
}

// 비밀번호 검증 스키마 (재사용)
const passwordSchema = z
  .string()
  .min(8, "비밀번호는 최소 8자 이상이어야 합니다")
  .refine(validatePasswordComplexity, {
    message: "비밀번호는 영문 대/소문자, 숫자, 특수문자 중 최소 3가지를 조합해야 합니다",
  });

// [수정] Auth schemas
export const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase() // 이메일 정규화: 소문자 변환
    .email("유효한 이메일 주소를 입력해주세요")
    .max(255, "이메일은 최대 255자까지 입력 가능합니다")
    .refine(validateEmailDomain, {
      message: "일회용 이메일 주소는 사용할 수 없습니다. 실제 이메일 주소를 입력해주세요",
    }),
  password: passwordSchema,
  userName: z
    .string()
    .trim()
    .min(1, "이름을 입력해주세요")
    .max(100, "이름은 최대 100자까지 입력 가능합니다")
    .refine(
      (val) => !/<[^>]*>/g.test(val), // XSS 방지: HTML 태그 차단
      { message: "이름에 HTML 태그를 사용할 수 없습니다" }
    ),
  // 선택 정보 (회원가입 시 받을 수도, 나중에 수정할 수도 있음)
  zipCode: z
    .string()
    .trim()
    .max(20, "우편번호는 최대 20자까지 입력 가능합니다")
    .optional(),
  address: z
    .string()
    .trim()
    .max(255, "주소는 최대 255자까지 입력 가능합니다")
    .optional(),
  detailAddress: z
    .string()
    .trim()
    .max(255, "상세주소는 최대 255자까지 입력 가능합니다")
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(
      /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/,
      "올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)"
    )
    .optional()
    .or(z.literal("")), // 빈 문자열 허용
  emailOptIn: z.boolean().optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("유효한 이메일 주소를 입력해주세요"),
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// 비밀번호 재설정 스키마 (비로그인 사용자용)
export const resetPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("유효한 이메일 주소를 입력해주세요"),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// 비밀번호 변경 스키마 (로그인한 사용자용)
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력해주세요"),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// 회원정보 수정 스키마 (로그인한 사용자용)
export const updateUserSchema = z
  .object({
    userName: z
      .string()
      .trim()
      .min(1, "이름을 입력해주세요")
      .max(100, "이름은 최대 100자까지 입력 가능합니다")
      .refine(
        (val) => !/<[^>]*>/g.test(val), // XSS 방지: HTML 태그 차단
        { message: "이름에 HTML 태그를 사용할 수 없습니다" }
      )
      .optional(),
    zipCode: z
      .union([
        z.string().trim().max(20, "우편번호는 최대 20자까지 입력 가능합니다"),
        z.literal(""),
      ])
      .optional(),
    address: z
      .union([
        z.string().trim().max(255, "주소는 최대 255자까지 입력 가능합니다"),
        z.literal(""),
      ])
      .optional(),
    detailAddress: z
      .union([
        z.string().trim().max(255, "상세주소는 최대 255자까지 입력 가능합니다"),
        z.literal(""),
      ])
      .optional(),
    phone: z
      .union([
        z
          .string()
          .trim()
          .regex(
            /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/,
            "올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)"
          ),
        z.literal(""),
      ])
      .optional(),
    emailOptIn: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // 최소 하나 이상의 필드가 제공되어야 함
      return Object.keys(data).length > 0;
    },
    { message: "수정할 정보를 최소 하나 이상 입력해주세요" }
  );
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

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

// Products table - UUID PK 사용
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUID 자동 생성
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
    isAvailable: boolean("is_available").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("IDX_products_category_id").on(table.categoryId),
    index("IDX_products_created_at").on(table.createdAt),
    index("IDX_products_is_available").on(table.isAvailable),
  ]
);

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
export const insertProductSchema = createInsertSchema(products)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    // updatedAt을 optional로 변경하여 직접 입력 가능하게 함 (입력하지 않으면 defaultNow 사용)
    updatedAt: z.coerce.date().optional(),
  });
export type InsertProduct = z.infer<typeof insertProductSchema>;

// Shopping cart items - UUID PK 사용
export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUID 자동 생성
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("IDX_cart_items_user_id").on(table.userId),
    // 복합 인덱스: 장바구니 중복 확인에 사용
    index("IDX_cart_items_user_product_variant").on(
      table.userId,
      table.productId,
      table.variantId
    ),
  ]
);

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
// drizzle-zod가 UUID 컬럼을 올바르게 처리하지 못하므로 명시적으로 오버라이드
export const insertCartItemSchema = createInsertSchema(cartItems, {
  userId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;

// Order status enum
export const orderStatusEnum = [
  "pending_payment",
  "paying",
  "payment_confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof orderStatusEnum)[number];

// Orders table - UUID PK 사용
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUID 자동 생성
    userId: uuid("user_id")
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
    // 재고 선점 여부 (주문 생성 시 재고 차감하므로 항상 true)
    // - 주문 생성 시: storage.createOrder()가 재고 차감 → isStockReserved = true
    // - 결제 승인 시: updateOrderPayment()로 상태만 업데이트 (재고 차감 안 함)
    isStockReserved: boolean("is_stock_reserved").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("IDX_orders_user_id").on(table.userId),
    index("IDX_orders_created_at").on(table.createdAt),
    index("IDX_orders_status").on(table.status),
    index("IDX_orders_external_order_id").on(table.externalOrderId),
  ]
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  orderItems: many(orderItems),
}));

export type Order = typeof orders.$inferSelect;
// drizzle-zod가 UUID 컬럼을 올바르게 처리하지 못하므로 명시적으로 오버라이드
export const insertOrderSchema = createInsertSchema(orders, {
  userId: z.string().uuid(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;

// 바로 구매 아이템 스키마 (API 입력 검증용)
export const directPurchaseItemSchema = z.object({
  productId: z.string().uuid("유효한 상품 ID가 아닙니다"),
  variantId: z.string().uuid("유효한 옵션 ID가 아닙니다").optional(),
  quantity: z.number().int().min(1, "최소 1개 이상").max(99, "최대 99개까지"),
});
export type DirectPurchaseItem = z.infer<typeof directPurchaseItemSchema>;

// 주문 생성 요청 스키마 (API 입력 검증용)
export const createOrderRequestSchema = z.object({
  shippingName: z.string().min(1, "수령인을 입력해주세요"),
  shippingPhone: z.string().min(1, "연락처를 입력해주세요"),
  shippingPostalCode: z.string().min(1, "우편번호를 입력해주세요"),
  shippingAddress: z.string().min(1, "주소를 입력해주세요"),
  shippingDetailAddress: z.string().optional(),
  shippingRequestNote: z.string().optional(),
  paymentMethod: z.enum(["toss", "naverpay"]).optional(),
  directPurchaseItem: directPurchaseItemSchema.optional(),
  reservationId: z.string().uuid().optional(), // 재고 선점 ID
});
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

// Order items table
export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
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
  },
  (table) => [
    index("IDX_order_items_order_id").on(table.orderId),
    index("IDX_order_items_product_id").on(table.productId),
  ]
);

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
// drizzle-zod가 UUID 컬럼을 올바르게 처리하지 못하므로 명시적으로 오버라이드
export const insertOrderItemSchema = createInsertSchema(orderItems, {
  orderId: z.string().uuid(),
  productId: z.string().uuid(),
}).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

// Product variants/sizes table - UUID PK 사용
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUID 자동 생성
    productId: uuid("product_id")
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
  },
  (table) => [index("IDX_product_variants_product_id").on(table.productId)]
);

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
// drizzle-zod가 UUID 컬럼을 올바르게 처리하지 못하므로 명시적으로 오버라이드
export const insertProductVariantSchema = createInsertSchema(productVariants, {
  productId: z.string().uuid(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;

// Product size measurements table - UUID PK 사용
export const productSizeMeasurements = pgTable(
  "product_size_measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUID 자동 생성
    productVariantId: uuid("product_variant_id")
      .references(() => productVariants.id, { onDelete: "cascade" })
      .notNull(),
    totalLength: varchar("total_length", { length: 20 }), // "95" 또는 "95-100" 형식
    shoulderWidth: varchar("shoulder_width", { length: 20 }),
    chestSection: varchar("chest_section", { length: 20 }),
    sleeveLength: varchar("sleeve_length", { length: 20 }),
    waistSection: varchar("waist_section", { length: 20 }),
    hipSection: varchar("hip_section", { length: 20 }),
    thighSection: varchar("thigh_section", { length: 20 }),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("IDX_product_size_measurements_variant_id").on(table.productVariantId),
  ]
);

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

// 사이즈 측정값 검증 정규식 (개선)
// - 1~999 범위의 숫자 (소수점 포함)
// - "숫자-숫자" 범위 형식
// - 0으로 시작하는 값 방지
const sizeValueRegex = /^([1-9]\d{0,2}(\.\d+)?(-[1-9]\d{0,2}(\.\d+)?)?)$/;

/**
 * 사이즈 측정값 Zod 스키마 생성 헬퍼 함수
 * - 정규식 검증: 1~999 또는 "1-999" 형식
 * - 범위 검증: 시작값 <= 끝값
 * - Nullable & Optional
 */
const createSizeMeasurementSchema = () =>
  z
    .string()
    .regex(sizeValueRegex, "올바른 형식이 아닙니다 (예: 95 또는 95-100)")
    .max(20)
    .refine((val) => {
      // 범위 형식인 경우 시작값 <= 끝값 검증
      const match = val.match(/^(\d+\.?\d*)-(\d+\.?\d*)$/);
      if (match) {
        const [, start, end] = match;
        return parseFloat(start) <= parseFloat(end);
      }
      return true;
    }, "시작값이 끝값보다 클 수 없습니다")
    .nullable()
    .optional();

// drizzle-zod가 UUID 컬럼을 올바르게 처리하지 못하므로 명시적으로 오버라이드
export const insertProductSizeMeasurementSchema = createInsertSchema(
  productSizeMeasurements,
  {
    productVariantId: z.string().uuid(),
    totalLength: createSizeMeasurementSchema(),
    shoulderWidth: createSizeMeasurementSchema(),
    chestSection: createSizeMeasurementSchema(),
    sleeveLength: createSizeMeasurementSchema(),
    waistSection: createSizeMeasurementSchema(),
    hipSection: createSizeMeasurementSchema(),
    thighSection: createSizeMeasurementSchema(),
  }
).omit({
  id: true,
  createdAt: true,
});
export type InsertProductSizeMeasurement = z.infer<
  typeof insertProductSizeMeasurementSchema
>;

// [신규] 배송지 관리 테이블 - UUID PK 사용
export const deliveryAddresses = pgTable(
  "delivery_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUID 자동 생성
    userId: uuid("user_id")
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
  },
  (table) => [
    // 복합 인덱스: 사용자별 배송지 조회 + 기본 배송지 정렬
    index("IDX_delivery_addresses_user_id_default").on(
      table.userId,
      table.isDefault
    ),
  ]
);

export type DeliveryAddress = typeof deliveryAddresses.$inferSelect;
// drizzle-zod가 UUID 컬럼을 올바르게 처리하지 못하므로 명시적으로 오버라이드
export const insertDeliveryAddressSchema = createInsertSchema(
  deliveryAddresses,
  {
    userId: z.string().uuid(),
  }
).omit({
  id: true,
  createdAt: true,
});

export type InsertDeliveryAddress = z.infer<typeof insertDeliveryAddressSchema>;

// ------------------------------------------------------------------
// [신규] 7. 위시리스트 (Wishlist Items) - UUID PK 사용
// ------------------------------------------------------------------
export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUID 자동 생성
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // 복합 인덱스: 중복 확인 및 삭제에 사용
    index("IDX_wishlist_items_user_product").on(table.userId, table.productId),
  ]
);

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
// drizzle-zod가 UUID 컬럼을 올바르게 처리하지 못하므로 명시적으로 오버라이드
export const insertWishlistItemSchema = createInsertSchema(wishlistItems, {
  userId: z.string().uuid(),
  productId: z.string().uuid(),
}).omit({
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
export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    code: varchar("code", { length: 6 }).notNull(), // 6자리 인증코드
    type: varchar("type", { length: 20 }).notNull(), // 'signup', 'password_reset' 등
    verified: boolean("verified").default(false).notNull(),
    expiresAt: timestamp("expires_at").notNull(), // 만료 시간
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // 복합 인덱스: 인증코드 조회에 사용
    index("IDX_email_verifications_email_type_verified").on(
      table.email,
      table.type,
      table.verified
    ),
    index("IDX_email_verifications_expires_at").on(table.expiresAt),
  ]
);

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
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("유효한 이메일 주소를 입력해주세요")
    .refine(validateEmailDomain, {
      message: "일회용 이메일 주소는 사용할 수 없습니다. 실제 이메일 주소를 입력해주세요",
    }),
  type: z.enum(["signup", "password_reset"]).default("signup"),
});
export type SendVerificationCodeInput = z.infer<
  typeof sendVerificationCodeSchema
>;

// 이메일 인증코드 확인 스키마
export const verifyEmailCodeSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("유효한 이메일 주소를 입력해주세요"),
  code: z.string().trim().length(6, "인증코드는 6자리입니다"),
  type: z.enum(["signup", "password_reset"]).default("signup"),
});
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;

// ------------------------------------------------------------------
// 사이트 이미지 테이블 (Hero, Marquee 이미지 관리)
// ------------------------------------------------------------------
export const siteImageTypeEnum = ["hero", "marquee"] as const;
export type SiteImageType = (typeof siteImageTypeEnum)[number];

export const siteImages = pgTable(
  "site_images",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 20 }).notNull(), // 'hero' | 'marquee'
    imageUrl: varchar("image_url", { length: 500 }).notNull(),
    linkUrl: varchar("link_url", { length: 500 }), // 클릭 시 이동할 URL (선택)
    displayOrder: integer("display_order").default(0).notNull(), // 표시 순서
    isActive: boolean("is_active").default(true).notNull(), // 활성화 여부
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // 복합 인덱스: 타입별 이미지 조회 + 정렬
    index("IDX_site_images_type_order").on(table.type, table.displayOrder),
  ]
);

export type SiteImage = typeof siteImages.$inferSelect;
export const insertSiteImageSchema = createInsertSchema(siteImages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSiteImage = z.infer<typeof insertSiteImageSchema>;

// Hero/Marquee 이미지 생성/수정 요청 스키마
export const createSiteImageSchema = z.object({
  type: z.enum(siteImageTypeEnum),
  imageUrl: z.string().url("유효한 이미지 URL을 입력해주세요"),
  linkUrl: z.string().url("유효한 링크 URL을 입력해주세요").optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type CreateSiteImageInput = z.infer<typeof createSiteImageSchema>;

export const updateSiteImageSchema = z.object({
  imageUrl: z.string().url("유효한 이미지 URL을 입력해주세요").optional(),
  linkUrl: z.string().url("유효한 링크 URL을 입력해주세요").nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSiteImageInput = z.infer<typeof updateSiteImageSchema>;

// ------------------------------------------------------------------
// Q&A 문의하기 테이블
// ------------------------------------------------------------------
export const inquiryTypeEnum = [
  "product", // 상품 문의
  "shipping", // 배송 문의
  "exchange", // 교환/반품
  "other", // 기타
] as const;
export type InquiryType = (typeof inquiryTypeEnum)[number];

export const inquiryStatusEnum = [
  "pending", // 답변 대기
  "answered", // 답변 완료
  "closed", // 종료
] as const;
export type InquiryStatus = (typeof inquiryStatusEnum)[number];

export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }), // 상품 문의인 경우 (선택)
    type: varchar("type", { length: 20 }).notNull(), // 'product', 'shipping', 'exchange', 'other'
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content").notNull(),
    isPrivate: boolean("is_private").default(false).notNull(), // 비밀글 여부
    status: varchar("status", { length: 20 }).default("pending").notNull(), // 'pending', 'answered', 'closed'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("IDX_inquiries_user_id").on(table.userId),
    index("IDX_inquiries_product_id").on(table.productId),
    index("IDX_inquiries_status").on(table.status),
    index("IDX_inquiries_created_at").on(table.createdAt),
  ]
);

export const inquiriesRelations = relations(inquiries, ({ one, many }) => ({
  user: one(users, {
    fields: [inquiries.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [inquiries.productId],
    references: [products.id],
  }),
  replies: many(inquiryReplies),
}));

export type Inquiry = typeof inquiries.$inferSelect;
// drizzle-zod가 UUID 컬럼을 올바르게 처리하지 못하므로 명시적으로 오버라이드
export const insertInquirySchema = createInsertSchema(inquiries, {
  userId: z.string().uuid(),
  productId: z.string().uuid().optional().nullable(),
}).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInquiry = z.infer<typeof insertInquirySchema>;

// 문의 생성 요청 스키마
export const createInquirySchema = z.object({
  productId: z.string().uuid().optional(), // 상품 문의인 경우
  type: z.enum(inquiryTypeEnum),
  title: z.string().min(1, "제목을 입력해주세요").max(200, "제목은 최대 200자입니다"),
  content: z.string().min(1, "내용을 입력해주세요"),
  isPrivate: z.boolean().optional(),
});
export type CreateInquiryInput = z.infer<typeof createInquirySchema>;

// ------------------------------------------------------------------
// Q&A 답변 테이블
// ------------------------------------------------------------------
export const inquiryReplies = pgTable(
  "inquiry_replies",
  {
    id: serial("id").primaryKey(),
    inquiryId: uuid("inquiry_id")
      .references(() => inquiries.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(), // 답변 작성자 (관리자)
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("IDX_inquiry_replies_inquiry_id").on(table.inquiryId)]
);

export const inquiryRepliesRelations = relations(inquiryReplies, ({ one }) => ({
  inquiry: one(inquiries, {
    fields: [inquiryReplies.inquiryId],
    references: [inquiries.id],
  }),
  user: one(users, {
    fields: [inquiryReplies.userId],
    references: [users.id],
  }),
}));

export type InquiryReply = typeof inquiryReplies.$inferSelect;
// drizzle-zod가 UUID 컬럼을 올바르게 처리하지 못하므로 명시적으로 오버라이드
export const insertInquiryReplySchema = createInsertSchema(inquiryReplies, {
  inquiryId: z.string().uuid(),
  userId: z.string().uuid(),
}).omit({
  id: true,
  createdAt: true,
});
export type InsertInquiryReply = z.infer<typeof insertInquiryReplySchema>;

// 답변 생성 요청 스키마
export const createInquiryReplySchema = z.object({
  content: z.string().min(1, "답변 내용을 입력해주세요"),
});
export type CreateInquiryReplyInput = z.infer<typeof createInquiryReplySchema>;

// ------------------------------------------------------------------
// 재고 선점 (Stock Reservation) 테이블
// ------------------------------------------------------------------
export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // 선점한 상품 목록 (JSONB)
    items: jsonb("items").$type<{
      productId: string;
      variantId?: string;
      quantity: number;
      productName: string;
    }[]>().notNull(),
    expiresAt: timestamp("expires_at").notNull(), // 만료 시간
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("IDX_stock_reservations_user_id").on(table.userId),
    index("IDX_stock_reservations_expires_at").on(table.expiresAt),
  ]
);

export type StockReservation = typeof stockReservations.$inferSelect;
export const insertStockReservationSchema = createInsertSchema(stockReservations, {
  userId: z.string().uuid(),
}).omit({
  id: true,
  createdAt: true,
});
export type InsertStockReservation = z.infer<typeof insertStockReservationSchema>;

// 재고 선점 요청 스키마
export const reserveStockItemSchema = z.object({
  productId: z.string().uuid("유효한 상품 ID가 아닙니다"),
  variantId: z.string().uuid("유효한 옵션 ID가 아닙니다").optional(),
  quantity: z.number().int().min(1, "최소 1개 이상"),
});
export type ReserveStockItem = z.infer<typeof reserveStockItemSchema>;

export const reserveStockRequestSchema = z.object({
  items: z.array(reserveStockItemSchema).min(1, "선점할 상품이 없습니다"),
  directPurchaseItem: directPurchaseItemSchema.optional(),
});
export type ReserveStockRequest = z.infer<typeof reserveStockRequestSchema>;
