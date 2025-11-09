import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Product, Category, InsertProduct, InsertCategory } from '@shared/schema';
import type { OrderWithItems } from './orders';
import { get, post, patch, del } from '@/lib/api';

export const useAdminStore = defineStore('admin', () => {
  const products = ref<Product[]>([]);
  const categories = ref<Category[]>([]);
  const orders = ref<OrderWithItems[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Products
  async function fetchAllProducts() {
    loading.value = true;
    error.value = null;
    
    try {
      products.value = await get<Product[]>('/api/admin/products');
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to fetch admin products:', err);
    } finally {
      loading.value = false;
    }
  }

  async function createProduct(productData: InsertProduct) {
    loading.value = true;
    error.value = null;
    
    try {
      const newProduct = await post<Product>('/api/admin/products', productData);
      products.value.push(newProduct);
      return newProduct;
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to create product:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function updateProduct(id: string, productData: Partial<InsertProduct>) {
    loading.value = true;
    error.value = null;
    
    try {
      const updated = await patch<Product>(`/api/admin/products/${id}`, productData);
      const index = products.value.findIndex(p => p.id === id);
      if (index >= 0) {
        products.value[index] = updated;
      }
      return updated;
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to update product:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function deleteProduct(id: string) {
    loading.value = true;
    error.value = null;
    
    try {
      await del(`/api/admin/products/${id}`);
      products.value = products.value.filter(p => p.id !== id);
      return true;
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to delete product:', err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  // Categories
  async function fetchAllCategories() {
    try {
      categories.value = await get<Category[]>('/api/categories');
    } catch (err: any) {
      console.error('Failed to fetch categories:', err);
    }
  }

  async function createCategory(categoryData: InsertCategory) {
    loading.value = true;
    error.value = null;
    
    try {
      const newCategory = await post<Category>('/api/admin/categories', categoryData);
      categories.value.push(newCategory);
      return newCategory;
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to create category:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function updateCategory(id: string, categoryData: Partial<InsertCategory>) {
    loading.value = true;
    error.value = null;
    
    try {
      const updated = await patch<Category>(`/api/admin/categories/${id}`, categoryData);
      const index = categories.value.findIndex(c => c.id === id);
      if (index >= 0) {
        categories.value[index] = updated;
      }
      return updated;
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to update category:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function deleteCategory(id: string) {
    loading.value = true;
    error.value = null;
    
    try {
      await del(`/api/admin/categories/${id}`);
      categories.value = categories.value.filter(c => c.id !== id);
      return true;
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to delete category:', err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  // Orders
  async function fetchAllOrders() {
    loading.value = true;
    error.value = null;
    
    try {
      orders.value = await get<OrderWithItems[]>('/api/admin/orders');
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to fetch admin orders:', err);
    } finally {
      loading.value = false;
    }
  }

  async function updateOrderStatus(
    id: string,
    status: string,
    trackingNumber?: string
  ) {
    loading.value = true;
    error.value = null;
    
    try {
      const updated = await patch<OrderWithItems>(`/api/admin/orders/${id}`, {
        status,
        trackingNumber,
      });
      const index = orders.value.findIndex(o => o.id === id);
      if (index >= 0) {
        orders.value[index] = updated;
      }
      return updated;
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to update order:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    // State
    products,
    categories,
    orders,
    loading,
    error,
    
    // Products
    fetchAllProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    
    // Categories
    fetchAllCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    
    // Orders
    fetchAllOrders,
    updateOrderStatus,
  };
});
