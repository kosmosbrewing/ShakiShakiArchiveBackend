<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useProductsStore } from '@/stores/products';
import ProductCard from '@/components/ProductCard.vue';
import EmptyState from '@/components/EmptyState.vue';

const productsStore = useProductsStore();

const hasFilters = computed(() => 
  productsStore.searchQuery || productsStore.selectedCategoryId
);

onMounted(async () => {
  await Promise.all([
    productsStore.fetchProducts(),
    productsStore.fetchCategories(),
  ]);
});

async function handleSearch(e: Event) {
  const target = e.target as HTMLInputElement;
  productsStore.setSearchQuery(target.value);
  await productsStore.fetchProducts();
}

async function handleCategoryChange(categoryId: string | null) {
  productsStore.setSelectedCategory(categoryId);
  await productsStore.fetchProducts();
}

async function handleClearFilters() {
  productsStore.clearFilters();
  await productsStore.fetchProducts();
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- 검색 및 필터 -->
    <div class="mb-8 space-y-4">
      <h1 class="text-3xl font-bold" data-testid="text-page-title">상품 목록</h1>
      
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <!-- 검색 -->
        <input
          type="text"
          :value="productsStore.searchQuery"
          @input="handleSearch"
          placeholder="상품 검색..."
          class="w-full rounded-lg border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary md:w-80"
          data-testid="input-search"
        />

        <!-- 카테고리 필터 -->
        <div class="flex flex-wrap items-center gap-2">
          <button
            @click="handleCategoryChange(null)"
            :class="[
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              !productsStore.selectedCategoryId
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            ]"
            data-testid="button-category-all"
          >
            전체
          </button>
          <button
            v-for="category in productsStore.categories"
            :key="category.id"
            @click="handleCategoryChange(category.id)"
            :class="[
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              productsStore.selectedCategoryId === category.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            ]"
            :data-testid="`button-category-${category.id}`"
          >
            {{ category.name }}
          </button>
        </div>
      </div>

      <!-- 필터 초기화 -->
      <div v-if="hasFilters" class="flex items-center gap-2">
        <span class="text-sm text-muted-foreground">
          {{ productsStore.filteredProducts.length }}개 상품
        </span>
        <button
          @click="handleClearFilters"
          class="text-sm text-primary hover:underline"
          data-testid="button-clear-filters"
        >
          필터 초기화
        </button>
      </div>
    </div>

    <!-- 로딩 -->
    <div v-if="productsStore.loading" class="flex justify-center py-12">
      <div class="text-center">
        <div class="mb-2 text-4xl">⏳</div>
        <p class="text-muted-foreground">상품을 불러오는 중...</p>
      </div>
    </div>

    <!-- 에러 -->
    <div v-else-if="productsStore.error" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <p class="text-destructive" data-testid="text-error">
        {{ productsStore.error }}
      </p>
    </div>

    <!-- 상품 목록 -->
    <div v-else-if="productsStore.filteredProducts.length > 0">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <ProductCard 
          v-for="product in productsStore.filteredProducts" 
          :key="product.id" 
          :product="product" 
        />
      </div>
    </div>

    <!-- 빈 상태 -->
    <EmptyState
      v-else
      title="상품이 없습니다"
      description="검색 조건을 변경하거나 필터를 초기화해보세요."
      :action-text="hasFilters ? '필터 초기화' : undefined"
      @action="handleClearFilters"
    />
  </div>
</template>
