<template>
  <div>
    <div class="bg-gradient-to-b from-primary/10 to-background border-b py-12 mb-12">
      <div class="container text-center">
        <h1 class="text-4xl font-bold mb-4">ShopHub에 오신 것을 환영합니다</h1>
        <p class="text-lg text-muted-foreground">최고의 상품들을 만나보세요</p>
      </div>
    </div>

    <div class="container py-12">
      <div>
        <h2 class="text-2xl font-bold mb-6">상품 목록</h2>
        <div v-if="productStore.products.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ProductCard v-for="product in productStore.products" :key="product.id" :product="product" />
        </div>
        <div v-else class="text-center py-12">
          <p class="text-muted-foreground">상품을 로드 중입니다...</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useProductsStore } from '@/stores/products';
import ProductCard from '@/components/ProductCard.vue';

const productStore = useProductsStore();

onMounted(() => {
  productStore.fetchProducts();
});
</script>
