<script setup lang="ts">
import { computed } from 'vue';
import type { Product } from '@shared/schema';
import { useRouter } from 'vue-router';
import { useCartStore } from '@/stores/cart';

const props = defineProps<{
  product: Product;
}>();

const router = useRouter();
const cartStore = useCartStore();

const price = computed(() => parseFloat(props.product.price));
const originalPrice = computed(() => 
  props.product.originalPrice ? parseFloat(props.product.originalPrice) : null
);

const discountPercent = computed(() => {
  if (!originalPrice.value) return null;
  return Math.round(((originalPrice.value - price.value) / originalPrice.value) * 100);
});

const isOutOfStock = computed(() => !props.product.isAvailable || (props.product.stockQuantity ?? 0) <= 0);

function goToDetail() {
  router.push(`/products/${props.product.id}`);
}

async function handleAddToCart(e: Event) {
  e.stopPropagation();
  if (isOutOfStock.value) return;
  
  await cartStore.addToCart(props.product.id, 1);
}
</script>

<template>
  <div 
    class="group cursor-pointer rounded-lg border bg-card p-4 transition-shadow hover:shadow-lg"
    :data-testid="`card-product-${product.id}`"
    @click="goToDetail"
  >
    <!-- 이미지 -->
    <div class="relative mb-4 aspect-square overflow-hidden rounded-lg bg-muted">
      <img 
        v-if="product.imageUrl"
        :src="product.imageUrl" 
        :alt="product.name"
        class="h-full w-full object-cover transition-transform group-hover:scale-105"
        :data-testid="`img-product-${product.id}`"
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
        class="absolute right-2 top-2 rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground"
        :data-testid="`badge-discount-${product.id}`"
      >
        {{ discountPercent }}%
      </div>

      <!-- 품절 오버레이 -->
      <div 
        v-if="isOutOfStock"
        class="absolute inset-0 flex items-center justify-center bg-black/50 text-white font-bold"
      >
        품절
      </div>
    </div>

    <!-- 상품 정보 -->
    <div class="space-y-2">
      <h3 
        class="line-clamp-2 text-base font-medium"
        :data-testid="`text-product-name-${product.id}`"
      >
        {{ product.name }}
      </h3>

      <!-- 가격 -->
      <div class="flex items-center gap-2">
        <span 
          class="text-lg font-bold text-primary"
          :data-testid="`text-price-${product.id}`"
        >
          {{ price.toLocaleString() }}원
        </span>
        <span 
          v-if="originalPrice"
          class="text-sm text-muted-foreground line-through"
          :data-testid="`text-original-price-${product.id}`"
        >
          {{ originalPrice.toLocaleString() }}원
        </span>
      </div>

      <!-- 장바구니 담기 버튼 -->
      <button
        @click="handleAddToCart"
        :disabled="isOutOfStock"
        class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        :data-testid="`button-add-to-cart-${product.id}`"
      >
        {{ isOutOfStock ? '품절' : '장바구니 담기' }}
      </button>
    </div>
  </div>
</template>
