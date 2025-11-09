<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProductsStore } from '@/stores/products';
import { useCartStore } from '@/stores/cart';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const productsStore = useProductsStore();
const cartStore = useCartStore();
const authStore = useAuthStore();

const product = computed(() => productsStore.currentProduct);
const price = computed(() => product.value ? parseFloat(product.value.price) : 0);
const originalPrice = computed(() => 
  product.value?.originalPrice ? parseFloat(product.value.originalPrice) : null
);
const discountPercent = computed(() => {
  if (!originalPrice.value || !product.value) return null;
  return Math.round(((originalPrice.value - price.value) / originalPrice.value) * 100);
});
const isOutOfStock = computed(() => 
  !product.value?.isAvailable || (product.value?.stockQuantity ?? 0) <= 0
);

onMounted(async () => {
  const id = route.params.id as string;
  await productsStore.fetchProduct(id);
});

async function handleAddToCart() {
  if (!product.value || isOutOfStock.value) return;
  
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  
  const success = await cartStore.addToCart(product.value.id, 1);
  if (success) {
    alert('장바구니에 추가되었습니다!');
  }
}

function goBack() {
  router.back();
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- 로딩 -->
    <div v-if="productsStore.loading" class="flex justify-center py-12">
      <div class="text-center">
        <div class="mb-2 text-4xl">⏳</div>
        <p class="text-muted-foreground">상품을 불러오는 중...</p>
      </div>
    </div>

    <!-- 에러 -->
    <div v-else-if="productsStore.error || !product" class="py-12">
      <div class="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p class="text-destructive mb-4" data-testid="text-error">
          {{ productsStore.error || '상품을 찾을 수 없습니다' }}
        </p>
        <button
          @click="goBack"
          class="text-sm text-primary hover:underline"
          data-testid="button-go-back"
        >
          돌아가기
        </button>
      </div>
    </div>

    <!-- 상품 상세 -->
    <div v-else>
      <!-- 뒤로가기 -->
      <button
        @click="goBack"
        class="mb-6 text-sm text-muted-foreground hover:text-foreground"
        data-testid="button-back"
      >
        ← 뒤로가기
      </button>

      <div class="grid gap-8 md:grid-cols-2">
        <!-- 이미지 -->
        <div class="space-y-4">
          <div class="relative aspect-square overflow-hidden rounded-lg bg-muted">
            <img 
              v-if="product.imageUrl"
              :src="product.imageUrl" 
              :alt="product.name"
              class="h-full w-full object-cover"
              data-testid="img-product"
            />
            <div 
              v-else
              class="flex h-full w-full items-center justify-center text-muted-foreground"
            >
              이미지 없음
            </div>

            <!-- 할인 배지 -->
            <div 
              v-if="discountPercent" 
              class="absolute right-4 top-4 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground"
              data-testid="badge-discount"
            >
              {{ discountPercent }}%
            </div>

            <!-- 품절 오버레이 -->
            <div 
              v-if="isOutOfStock"
              class="absolute inset-0 flex items-center justify-center bg-black/50 text-white font-bold text-xl"
            >
              품절
            </div>
          </div>

          <!-- 추가 이미지들 (있는 경우) -->
          <div v-if="product.images && product.images.length > 0" class="grid grid-cols-4 gap-2">
            <div 
              v-for="(image, index) in product.images" 
              :key="index"
              class="aspect-square overflow-hidden rounded-lg bg-muted"
            >
              <img :src="image" :alt="`${product.name} ${index + 1}`" class="h-full w-full object-cover" />
            </div>
          </div>
        </div>

        <!-- 상품 정보 -->
        <div class="space-y-6">
          <div>
            <h1 class="text-3xl font-bold mb-2" data-testid="text-product-name">
              {{ product.name }}
            </h1>
            <p v-if="product.description" class="text-muted-foreground" data-testid="text-product-description">
              {{ product.description }}
            </p>
          </div>

          <!-- 가격 -->
          <div class="space-y-1">
            <div class="flex items-center gap-3">
              <span class="text-3xl font-bold text-primary" data-testid="text-price">
                {{ price.toLocaleString() }}원
              </span>
              <span 
                v-if="originalPrice"
                class="text-lg text-muted-foreground line-through"
                data-testid="text-original-price"
              >
                {{ originalPrice.toLocaleString() }}원
              </span>
            </div>
            <p class="text-sm text-muted-foreground">
              재고: {{ product.stockQuantity }}개
            </p>
          </div>

          <!-- 장바구니 담기 -->
          <div class="space-y-3">
            <button
              @click="handleAddToCart"
              :disabled="isOutOfStock"
              class="w-full rounded-lg bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="button-add-to-cart"
            >
              {{ isOutOfStock ? '품절' : '장바구니 담기' }}
            </button>
            
            <p v-if="!authStore.isAuthenticated" class="text-sm text-muted-foreground text-center">
              장바구니에 담으려면 <router-link to="/login" class="text-primary hover:underline">로그인</router-link>이 필요합니다.
            </p>
          </div>

          <!-- 카테고리 정보 -->
          <div v-if="product.categoryId" class="rounded-lg bg-muted p-4">
            <p class="text-sm text-muted-foreground mb-1">카테고리</p>
            <p class="font-medium">카테고리 ID: {{ product.categoryId }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
