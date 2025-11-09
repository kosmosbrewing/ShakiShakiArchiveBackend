import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CartItem, Product } from '@shared/schema';
import { get, post, patch, del } from '@/lib/api';

export interface CartItemWithProduct extends CartItem {
  product: Product;
}

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItemWithProduct[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Computed
  const totalItems = computed(() => 
    items.value.reduce((sum, item) => sum + item.quantity, 0)
  );

  const totalPrice = computed(() => 
    items.value.reduce((sum, item) => {
      const price = parseFloat(item.product.originalPrice || item.product.price);
      return sum + (price * item.quantity);
    }, 0)
  );

  const isEmpty = computed(() => items.value.length === 0);

  // Actions
  async function fetchCart() {
    loading.value = true;
    error.value = null;
    
    try {
      items.value = await get<CartItemWithProduct[]>('/api/cart');
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to fetch cart:', err);
      items.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function addToCart(productId: string, quantity: number = 1) {
    loading.value = true;
    error.value = null;
    
    try {
      const newItem = await post<CartItemWithProduct>('/api/cart', {
        productId,
        quantity,
      });
      
      // 기존 아이템 찾기
      const existingIndex = items.value.findIndex(
        item => item.productId === productId
      );
      
      if (existingIndex >= 0) {
        items.value[existingIndex] = newItem;
      } else {
        items.value.push(newItem);
      }
      
      return true;
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to add to cart:', err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function updateQuantity(itemId: string, quantity: number) {
    if (quantity < 1) return;
    
    loading.value = true;
    error.value = null;
    
    try {
      const updated = await patch<CartItemWithProduct>(`/api/cart/${itemId}`, {
        quantity,
      });
      
      const index = items.value.findIndex(item => item.id === itemId);
      if (index >= 0) {
        items.value[index] = updated;
      }
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to update quantity:', err);
    } finally {
      loading.value = false;
    }
  }

  async function removeItem(itemId: string) {
    loading.value = true;
    error.value = null;
    
    try {
      await del(`/api/cart/${itemId}`);
      items.value = items.value.filter(item => item.id !== itemId);
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to remove item:', err);
    } finally {
      loading.value = false;
    }
  }

  function clearCart() {
    items.value = [];
  }

  return {
    // State
    items,
    loading,
    error,
    
    // Computed
    totalItems,
    totalPrice,
    isEmpty,
    
    // Actions
    fetchCart,
    addToCart,
    updateQuantity,
    removeItem,
    clearCart,
  };
});
