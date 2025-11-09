<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAdminStore } from '@/stores/admin';
import type { InsertProduct, InsertCategory, OrderStatus } from '@shared/schema';
import OrderStatusBadge from '@/components/OrderStatusBadge.vue';

const adminStore = useAdminStore();
const activeTab = ref<'products' | 'orders' | 'categories'>('products');

// 상품 폼
const showProductForm = ref(false);
const productForm = ref<Partial<InsertProduct>>({
  name: '',
  slug: '',
  description: '',
  price: '',
  categoryId: '',
  imageUrl: '',
  stockQuantity: 0,
  isAvailable: true,
});
const editingProductId = ref<string | null>(null);

// 카테고리 폼
const showCategoryForm = ref(false);
const categoryForm = ref<InsertCategory>({
  name: '',
  slug: '',
  description: '',
});
const editingCategoryId = ref<string | null>(null);

// 주문 상태 업데이트
const editingOrderId = ref<string | null>(null);
const orderStatusForm = ref({ status: '', trackingNumber: '' });

onMounted(async () => {
  await Promise.all([
    adminStore.fetchAllProducts(),
    adminStore.fetchAllCategories(),
    adminStore.fetchAllOrders(),
  ]);
});

// 상품 관리
function openProductForm(productId?: string) {
  if (productId) {
    const product = adminStore.products.find(p => p.id === productId);
    if (product) {
      productForm.value = { ...product };
      editingProductId.value = productId;
    }
  } else {
    productForm.value = {
      name: '',
      slug: '',
      description: '',
      price: '',
      categoryId: '',
      imageUrl: '',
      stockQuantity: 0,
      isAvailable: true,
    };
    editingProductId.value = null;
  }
  showProductForm.value = true;
}

async function saveProduct() {
  if (editingProductId.value) {
    await adminStore.updateProduct(editingProductId.value, productForm.value);
  } else {
    await adminStore.createProduct(productForm.value as InsertProduct);
  }
  showProductForm.value = false;
  productForm.value = {};
}

async function deleteProduct(id: string) {
  if (confirm('정말 이 상품을 삭제하시겠습니까?')) {
    await adminStore.deleteProduct(id);
  }
}

// 카테고리 관리
function openCategoryForm(categoryId?: string) {
  if (categoryId) {
    const category = adminStore.categories.find(c => c.id === categoryId);
    if (category) {
      categoryForm.value = { ...category };
      editingCategoryId.value = categoryId;
    }
  } else {
    categoryForm.value = { name: '', slug: '', description: '' };
    editingCategoryId.value = null;
  }
  showCategoryForm.value = true;
}

async function saveCategory() {
  if (editingCategoryId.value) {
    await adminStore.updateCategory(editingCategoryId.value, categoryForm.value);
  } else {
    await adminStore.createCategory(categoryForm.value);
  }
  showCategoryForm.value = false;
  categoryForm.value = { name: '', slug: '', description: '' };
}

async function deleteCategory(id: string) {
  if (confirm('정말 이 카테고리를 삭제하시겠습니까?')) {
    await adminStore.deleteCategory(id);
  }
}

// 주문 관리
function openOrderStatusForm(orderId: string) {
  const order = adminStore.orders.find(o => o.id === orderId);
  if (order) {
    editingOrderId.value = orderId;
    orderStatusForm.value = {
      status: order.status,
      trackingNumber: order.trackingNumber || '',
    };
  }
}

async function updateOrderStatus() {
  if (!editingOrderId.value) return;
  
  await adminStore.updateOrderStatus(
    editingOrderId.value,
    orderStatusForm.value.status,
    orderStatusForm.value.trackingNumber || undefined
  );
  editingOrderId.value = null;
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="mb-8 text-3xl font-bold" data-testid="text-page-title">관리자 페이지</h1>

    <!-- 탭 -->
    <div class="mb-6 flex gap-2 border-b">
      <button
        @click="activeTab = 'products'"
        :class="[
          'px-4 py-2 font-medium transition-colors',
          activeTab === 'products'
            ? 'border-b-2 border-primary text-primary'
            : 'text-muted-foreground hover:text-foreground'
        ]"
        data-testid="tab-products"
      >
        상품 관리
      </button>
      <button
        @click="activeTab = 'orders'"
        :class="[
          'px-4 py-2 font-medium transition-colors',
          activeTab === 'orders'
            ? 'border-b-2 border-primary text-primary'
            : 'text-muted-foreground hover:text-foreground'
        ]"
        data-testid="tab-orders"
      >
        주문 관리
      </button>
      <button
        @click="activeTab = 'categories'"
        :class="[
          'px-4 py-2 font-medium transition-colors',
          activeTab === 'categories'
            ? 'border-b-2 border-primary text-primary'
            : 'text-muted-foreground hover:text-foreground'
        ]"
        data-testid="tab-categories"
      >
        카테고리 관리
      </button>
    </div>

    <!-- 상품 관리 -->
    <div v-if="activeTab === 'products'" class="space-y-4">
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold">상품 목록</h2>
        <button
          @click="openProductForm()"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          data-testid="button-add-product"
        >
          + 상품 추가
        </button>
      </div>

      <div class="rounded-lg border bg-card overflow-hidden">
        <table class="w-full">
          <thead class="bg-muted">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium">상품명</th>
              <th class="px-4 py-3 text-left text-sm font-medium">가격</th>
              <th class="px-4 py-3 text-left text-sm font-medium">재고</th>
              <th class="px-4 py-3 text-left text-sm font-medium">상태</th>
              <th class="px-4 py-3 text-right text-sm font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="product in adminStore.products"
              :key="product.id"
              class="border-t hover:bg-muted/50"
              :data-testid="`product-row-${product.id}`"
            >
              <td class="px-4 py-3">{{ product.name }}</td>
              <td class="px-4 py-3">{{ parseFloat(product.price).toLocaleString() }}원</td>
              <td class="px-4 py-3">{{ product.stockQuantity }}</td>
              <td class="px-4 py-3">
                <span :class="product.isAvailable ? 'text-green-600' : 'text-red-600'">
                  {{ product.isAvailable ? '판매중' : '판매중지' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  @click="openProductForm(product.id)"
                  class="mr-2 text-sm text-primary hover:underline"
                  :data-testid="`button-edit-product-${product.id}`"
                >
                  수정
                </button>
                <button
                  @click="deleteProduct(product.id)"
                  class="text-sm text-destructive hover:underline"
                  :data-testid="`button-delete-product-${product.id}`"
                >
                  삭제
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 상품 폼 모달 -->
      <div v-if="showProductForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-6">
          <h3 class="mb-4 text-xl font-bold">
            {{ editingProductId ? '상품 수정' : '상품 추가' }}
          </h3>
          <form @submit.prevent="saveProduct" class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium">상품명</label>
              <input
                v-model="productForm.name"
                required
                class="w-full rounded-lg border px-3 py-2"
                data-testid="input-product-name"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">Slug</label>
              <input
                v-model="productForm.slug"
                required
                class="w-full rounded-lg border px-3 py-2"
                data-testid="input-product-slug"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">설명</label>
              <textarea
                v-model="productForm.description"
                rows="3"
                class="w-full rounded-lg border px-3 py-2"
                data-testid="input-product-description"
              ></textarea>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="mb-1 block text-sm font-medium">가격</label>
                <input
                  v-model="productForm.price"
                  type="number"
                  required
                  class="w-full rounded-lg border px-3 py-2"
                  data-testid="input-product-price"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium">재고</label>
                <input
                  v-model="productForm.stockQuantity"
                  type="number"
                  class="w-full rounded-lg border px-3 py-2"
                  data-testid="input-product-stock"
                />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">카테고리</label>
              <select
                v-model="productForm.categoryId"
                class="w-full rounded-lg border px-3 py-2"
                data-testid="select-product-category"
              >
                <option value="">선택 안함</option>
                <option v-for="cat in adminStore.categories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">이미지 URL</label>
              <input
                v-model="productForm.imageUrl"
                type="url"
                class="w-full rounded-lg border px-3 py-2"
                data-testid="input-product-image"
              />
            </div>
            <div class="flex items-center gap-2">
              <input
                v-model="productForm.isAvailable"
                type="checkbox"
                id="product-available"
                data-testid="checkbox-product-available"
              />
              <label for="product-available" class="text-sm font-medium">판매 가능</label>
            </div>
            <div class="flex gap-2 justify-end">
              <button
                type="button"
                @click="showProductForm = false"
                class="rounded-lg border px-4 py-2"
                data-testid="button-cancel-product"
              >
                취소
              </button>
              <button
                type="submit"
                class="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                data-testid="button-save-product"
              >
                저장
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- 주문 관리 -->
    <div v-else-if="activeTab === 'orders'" class="space-y-4">
      <h2 class="text-2xl font-bold">주문 목록</h2>

      <div class="rounded-lg border bg-card overflow-hidden">
        <table class="w-full">
          <thead class="bg-muted">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium">주문번호</th>
              <th class="px-4 py-3 text-left text-sm font-medium">받는 분</th>
              <th class="px-4 py-3 text-left text-sm font-medium">금액</th>
              <th class="px-4 py-3 text-left text-sm font-medium">상태</th>
              <th class="px-4 py-3 text-right text-sm font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="order in adminStore.orders"
              :key="order.id"
              class="border-t hover:bg-muted/50"
              :data-testid="`order-row-${order.id}`"
            >
              <td class="px-4 py-3">{{ order.id.substring(0, 8) }}</td>
              <td class="px-4 py-3">{{ order.shippingName }}</td>
              <td class="px-4 py-3">{{ parseFloat(order.totalAmount).toLocaleString() }}원</td>
              <td class="px-4 py-3">
                <OrderStatusBadge :status="order.status as OrderStatus" />
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  @click="openOrderStatusForm(order.id)"
                  class="text-sm text-primary hover:underline"
                  :data-testid="`button-edit-order-${order.id}`"
                >
                  상태 변경
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 주문 상태 변경 모달 -->
      <div v-if="editingOrderId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="w-full max-w-md rounded-lg bg-background p-6">
          <h3 class="mb-4 text-xl font-bold">주문 상태 변경</h3>
          <form @submit.prevent="updateOrderStatus" class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium">주문 상태</label>
              <select
                v-model="orderStatusForm.status"
                required
                class="w-full rounded-lg border px-3 py-2"
                data-testid="select-order-status"
              >
                <option value="pending_payment">결제 대기</option>
                <option value="payment_confirmed">결제 완료</option>
                <option value="preparing">상품 준비 중</option>
                <option value="shipped">배송 중</option>
                <option value="delivered">배송 완료</option>
                <option value="cancelled">취소됨</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">운송장 번호</label>
              <input
                v-model="orderStatusForm.trackingNumber"
                class="w-full rounded-lg border px-3 py-2"
                data-testid="input-tracking-number"
              />
            </div>
            <div class="flex gap-2 justify-end">
              <button
                type="button"
                @click="editingOrderId = null"
                class="rounded-lg border px-4 py-2"
                data-testid="button-cancel-order"
              >
                취소
              </button>
              <button
                type="submit"
                class="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                data-testid="button-save-order"
              >
                저장
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- 카테고리 관리 -->
    <div v-else-if="activeTab === 'categories'" class="space-y-4">
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold">카테고리 목록</h2>
        <button
          @click="openCategoryForm()"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          data-testid="button-add-category"
        >
          + 카테고리 추가
        </button>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="category in adminStore.categories"
          :key="category.id"
          class="rounded-lg border bg-card p-4"
          :data-testid="`category-card-${category.id}`"
        >
          <h3 class="mb-2 text-lg font-semibold">{{ category.name }}</h3>
          <p class="mb-4 text-sm text-muted-foreground">{{ category.description || '설명 없음' }}</p>
          <div class="flex gap-2">
            <button
              @click="openCategoryForm(category.id)"
              class="text-sm text-primary hover:underline"
              :data-testid="`button-edit-category-${category.id}`"
            >
              수정
            </button>
            <button
              @click="deleteCategory(category.id)"
              class="text-sm text-destructive hover:underline"
              :data-testid="`button-delete-category-${category.id}`"
            >
              삭제
            </button>
          </div>
        </div>
      </div>

      <!-- 카테고리 폼 모달 -->
      <div v-if="showCategoryForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="w-full max-w-md rounded-lg bg-background p-6">
          <h3 class="mb-4 text-xl font-bold">
            {{ editingCategoryId ? '카테고리 수정' : '카테고리 추가' }}
          </h3>
          <form @submit.prevent="saveCategory" class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium">카테고리명</label>
              <input
                v-model="categoryForm.name"
                required
                class="w-full rounded-lg border px-3 py-2"
                data-testid="input-category-name"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">Slug</label>
              <input
                v-model="categoryForm.slug"
                required
                class="w-full rounded-lg border px-3 py-2"
                data-testid="input-category-slug"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">설명</label>
              <textarea
                v-model="categoryForm.description"
                rows="3"
                class="w-full rounded-lg border px-3 py-2"
                data-testid="input-category-description"
              ></textarea>
            </div>
            <div class="flex gap-2 justify-end">
              <button
                type="button"
                @click="showCategoryForm = false"
                class="rounded-lg border px-4 py-2"
                data-testid="button-cancel-category"
              >
                취소
              </button>
              <button
                type="submit"
                class="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                data-testid="button-save-category"
              >
                저장
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
