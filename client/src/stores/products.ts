import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Product, Category } from '@shared/schema';
import { get } from '@/lib/api';

export const useProductsStore = defineStore('products', () => {
  const products = ref<Product[]>([]);
  const categories = ref<Category[]>([]);
  const currentProduct = ref<Product | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  
  // 필터 상태
  const searchQuery = ref('');
  const selectedCategoryId = ref<string | null>(null);

  // Computed
  const filteredProducts = computed(() => {
    let result = products.value;

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
      );
    }

    if (selectedCategoryId.value) {
      result = result.filter(p => p.categoryId === selectedCategoryId.value);
    }

    return result;
  });

  const availableProducts = computed(() => 
    filteredProducts.value.filter(p => p.isAvailable && (p.stockQuantity ?? 0) > 0)
  );

  // Actions
  async function fetchProducts() {
    loading.value = true;
    error.value = null;
    
    try {
      const params = new URLSearchParams();
      if (searchQuery.value) params.append('search', searchQuery.value);
      if (selectedCategoryId.value) params.append('categoryId', selectedCategoryId.value);
      
      const url = `/api/products${params.toString() ? `?${params.toString()}` : ''}`;
      products.value = await get<Product[]>(url);
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to fetch products:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchProduct(id: string) {
    loading.value = true;
    error.value = null;
    
    try {
      currentProduct.value = await get<Product>(`/api/products/${id}`);
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to fetch product:', err);
      currentProduct.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function fetchCategories() {
    try {
      categories.value = await get<Category[]>('/api/categories');
    } catch (err: any) {
      console.error('Failed to fetch categories:', err);
    }
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query;
  }

  function setSelectedCategory(categoryId: string | null) {
    selectedCategoryId.value = categoryId;
  }

  function clearFilters() {
    searchQuery.value = '';
    selectedCategoryId.value = null;
  }

  return {
    // State
    products,
    categories,
    currentProduct,
    loading,
    error,
    searchQuery,
    selectedCategoryId,
    
    // Computed
    filteredProducts,
    availableProducts,
    
    // Actions
    fetchProducts,
    fetchProduct,
    fetchCategories,
    setSearchQuery,
    setSelectedCategory,
    clearFilters,
  };
});
