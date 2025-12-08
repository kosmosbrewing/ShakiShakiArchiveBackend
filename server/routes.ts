import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import {
  isAuthenticated,
  isAdmin,
  hashPassword,
  verifyPassword,
  populateUser,
} from "./auth";
import {
  insertProductSchema,
  insertCategorySchema,
  insertCartItemSchema,
  insertOrderSchema,
  insertProductVariantSchema,
  insertProductSizeMeasurementSchema,
  signupSchema,
  loginSchema,
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup session
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  app.set("trust proxy", 1);
  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production" &&
          process.env.SECURE_COOKIE !== "false",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        maxAge: sessionTtl,
      },
    })
  );

  // Populate user in all requests
  app.use(populateUser);

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const validatedData = signupSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "이미 사용 중인 이메일입니다" });
      }

      const passwordHash = await hashPassword(validatedData.password);

      // [수정] 변경된 스키마에 맞춰 데이터 전달
      const user = await storage.createUser({
        email: validatedData.email,
        passwordHash,
        userName: validatedData.userName, // [변경]
        // [추가] 선택 정보들
        zipCode: validatedData.zipCode,
        address: validatedData.address,
        detailAddress: validatedData.detailAddress,
        phone: validatedData.phone,
        emailOptIn: validatedData.emailOptIn ?? false,
      });

      req.session.userId = user.id;

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);

      // Find user by email
      const user = await storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res
          .status(401)
          .json({ message: "이메일 또는 비밀번호가 올바르지 않습니다" });
      }

      // Verify password
      const isValidPassword = await verifyPassword(
        validatedData.password,
        user.passwordHash
      );
      if (!isValidPassword) {
        return res
          .status(401)
          .json({ message: "이메일 또는 비밀번호가 올바르지 않습니다" });
      }

      // Create session
      req.session.userId = user.id;

      // Return user without password hash
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res
          .status(500)
          .json({ message: "로그아웃 중 오류가 발생했습니다" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "로그아웃되었습니다" });
    });
  });

  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }
      // Return user without password hash
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user:", error);
      res
        .status(500)
        .json({ message: "사용자 정보를 가져오는 데 실패했습니다" });
    }
  });

  // [추가] 내 정보 수정 API (필요할 경우)
  app.patch("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // 프론트엔드에서 보낸 데이터 받기
      const { userName, zipCode, address, detailAddress, phone, emailOptIn } =
        req.body;

      // 업데이트할 객체 구성
      const updateData: any = {};
      if (userName) updateData.userName = userName;
      if (phone !== undefined) updateData.phone = phone;
      if (zipCode !== undefined) updateData.zipCode = zipCode;
      if (address !== undefined) updateData.address = address;
      if (detailAddress !== undefined) updateData.detailAddress = detailAddress;
      if (emailOptIn !== undefined) updateData.emailOptIn = emailOptIn;

      // [핵심 변경] upsertUser 대신 updateUser 사용 (email 없어도 됨)
      const updatedUser = await storage.updateUser(userId, updateData);

      if (!updatedUser) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }

      res.json({ message: "정보가 수정되었습니다", user: updatedUser });
    } catch (error: any) {
      console.error("Update user error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // [신규] 비밀번호 변경 API
  app.put("/api/auth/password", isAuthenticated, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.session.userId!;

      // 1. 현재 유저 정보 가져오기 (해시된 비밀번호 확인용)
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }

      // 2. 현재 비밀번호 검증 (보안 필수)
      // Modify.vue에서 'password' 필드에 입력한 값을 currentPassword로 보냅니다.
      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res
          .status(401)
          .json({ message: "현재 비밀번호가 일치하지 않습니다" });
      }

      // 3. 새 비밀번호 해싱 및 업데이트
      // 사용자가 입력한 비밀번호로 새로 설정합니다.
      const newPasswordHash = await hashPassword(newPassword);

      await storage.updateUser(userId, { passwordHash: newPasswordHash });

      res.json({ message: "비밀번호가 변경되었습니다" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Public product routes
  app.get("/api/products", async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const categoryIdParam = req.query.categoryId as string | undefined;
      const categoryId = categoryIdParam ? Number(categoryIdParam) : undefined;
      const products = await storage.getProducts({ search, categoryId });
      res.json(products);
    } catch (error: any) {
      console.error("Error fetching products:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProduct(Number(req.params.id));
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Product variants route (public)
  app.get("/api/products/:id/variants", async (req, res) => {
    try {
      const variants = await storage.getProductVariants(Number(req.params.id));
      res.json(variants);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Product size measurements route (public)
  app.get("/api/variants/:id/measurements", async (req, res) => {
    try {
      const measurements = await storage.getProductSizeMeasurements(
        Number(req.params.id)
      );
      res.json(measurements);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Public category routes
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error: any) {
      console.error("Error fetching categories:", error);
      res
        .status(500)
        .json({ message: error.message || "Failed to fetch categories" });
    }
  });

  // Cart routes (protected)
  app.get("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const cartItems = await storage.getCartItems(userId);
      res.json(cartItems);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const validatedData = insertCartItemSchema.parse({
        ...req.body,
        userId,
      });
      const cartItem = await storage.addCartItem(validatedData);
      res.json(cartItem);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      const { quantity } = req.body;
      if (typeof quantity !== "number" || quantity < 1) {
        return res.status(400).json({ message: "Invalid quantity" });
      }
      const cartItem = await storage.updateCartItem(
        Number(req.params.id),
        quantity
      );
      if (!cartItem) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      res.json(cartItem);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteCartItem(Number(req.params.id));
      res.json({ message: "Cart item deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Order routes (protected)
  app.post("/api/orders", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // Get cart items
      const cartItems = await storage.getCartItems(userId);
      if (cartItems.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }

      // Calculate total amount
      const totalAmount = cartItems.reduce(
        (sum, item) => sum + parseFloat(item.product.price) * item.quantity,
        0
      );

      // Create order
      const orderData = insertOrderSchema.parse({
        userId,
        totalAmount: totalAmount.toString(),
        status: "pending_payment",
        shippingName: req.body.shippingName,
        shippingPhone: req.body.shippingPhone,
        shippingAddress: req.body.shippingAddress,
        shippingPostalCode: req.body.shippingPostalCode,
      });

      // Create order items
      const orderItemsData = cartItems.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        productPrice: item.product.price,
        quantity: item.quantity,
      }));

      const orderId = await storage.createOrder(orderData, orderItemsData);

      // Clear cart
      await storage.clearCart(userId);

      res.json({ orderId });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/orders", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const orders = await storage.getOrders(userId);
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/orders/:id", isAuthenticated, async (req, res) => {
    try {
      const order = await storage.getOrder(Number(req.params.id));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify user owns this order
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (order.userId !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin routes
  app.get("/api/admin/products", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/admin/products",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const validatedData = insertProductSchema.parse(req.body);
        const product = await storage.createProduct(validatedData);
        res.json(product);
      } catch (error: any) {
        res.status(400).json({ message: error.message });
      }
    }
  );

  app.patch(
    "/api/admin/products/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const product = await storage.updateProduct(
          Number(req.params.id),
          req.body
        );
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }
        res.json(product);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.delete(
    "/api/admin/products/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        await storage.deleteProduct(Number(req.params.id));
        res.json({ message: "Product deleted" });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get("/api/admin/orders", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch(
    "/api/admin/orders/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const { status, trackingNumber } = req.body;
        const order = await storage.updateOrderStatus(
          Number(req.params.id),
          status,
          trackingNumber
        );
        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }
        res.json(order);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/admin/categories",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const validatedData = insertCategorySchema.parse(req.body);
        const category = await storage.createCategory(validatedData);
        res.json(category);
      } catch (error: any) {
        res.status(400).json({ message: error.message });
      }
    }
  );

  app.patch(
    "/api/admin/categories/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const category = await storage.updateCategory(
          Number(req.params.id),
          req.body
        );
        if (!category) {
          return res.status(404).json({ message: "Category not found" });
        }
        res.json(category);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.delete(
    "/api/admin/categories/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        await storage.deleteCategory(Number(req.params.id));
        res.json({ message: "Category deleted" });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  // Admin product variant routes
  app.get(
    "/api/admin/products/:productId/variants",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const variants = await storage.getProductVariants(
          Number(req.params.productId)
        );
        res.json(variants);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/admin/products/:productId/variants",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const validatedData = insertProductVariantSchema.parse({
          ...req.body,
          productId: Number(req.params.productId),
        });
        const variant = await storage.createProductVariant(validatedData);
        res.json(variant);
      } catch (error: any) {
        res.status(400).json({ message: error.message });
      }
    }
  );

  app.patch(
    "/api/admin/products/:productId/variants/:variantId",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const variant = await storage.updateProductVariant(
          Number(req.params.variantId),
          req.body
        );
        if (!variant) {
          return res.status(404).json({ message: "Variant not found" });
        }
        res.json(variant);
      } catch (error: any) {
        res.status(400).json({ message: error.message });
      }
    }
  );

  app.delete(
    "/api/admin/products/:productId/variants/:variantId",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        await storage.deleteProductVariant(Number(req.params.variantId));
        res.json({ message: "Variant deleted" });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  // Admin product size measurements routes ✨ NEW
  app.get(
    "/api/admin/variants/:variantId/measurements",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const measurements = await storage.getProductSizeMeasurements(
          Number(req.params.variantId)
        );
        res.json(measurements);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/admin/variants/:variantId/measurements",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const validatedData = insertProductSizeMeasurementSchema.parse({
          ...req.body,
          productVariantId: Number(req.params.variantId),
        });
        const measurement = await storage.createProductSizeMeasurement(
          validatedData
        );
        res.status(201).json(measurement);
      } catch (error: any) {
        res.status(400).json({ message: error.message });
      }
    }
  );

  app.patch(
    "/api/admin/measurements/:measurementId",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const measurement = await storage.updateProductSizeMeasurement(
          Number(req.params.measurementId),
          req.body
        );
        if (!measurement) {
          return res.status(404).json({ message: "Measurement not found" });
        }
        res.json(measurement);
      } catch (error: any) {
        res.status(400).json({ message: error.message });
      }
    }
  );

  app.delete(
    "/api/admin/measurements/:measurementId",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        await storage.deleteProductSizeMeasurement(
          Number(req.params.measurementId)
        );
        res.json({ message: "Measurement deleted" });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}
