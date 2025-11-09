import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Order, OrderItem, InsertOrder } from '@shared/schema';
import { get, post } from '@/lib/api';

export interface OrderWithItems extends Order {
  orderItems: OrderItem[];
}

export const useOrdersStore = defineStore('orders', () => {
  const orders = ref<OrderWithItems[]>([]);
  const currentOrder = ref<OrderWithItems | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Actions
  async function fetchOrders() {
    loading.value = true;
    error.value = null;
    
    try {
      orders.value = await get<OrderWithItems[]>('/api/orders');
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to fetch orders:', err);
      orders.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function fetchOrder(id: string) {
    loading.value = true;
    error.value = null;
    
    try {
      currentOrder.value = await get<OrderWithItems>(`/api/orders/${id}`);
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to fetch order:', err);
      currentOrder.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function createOrder(orderData: Omit<InsertOrder, 'userId'>) {
    loading.value = true;
    error.value = null;
    
    try {
      const newOrder = await post<OrderWithItems>('/api/orders', orderData);
      orders.value.unshift(newOrder);
      return newOrder;
    } catch (err: any) {
      error.value = err.message;
      console.error('Failed to create order:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    // State
    orders,
    currentOrder,
    loading,
    error,
    
    // Actions
    fetchOrders,
    fetchOrder,
    createOrder,
  };
});
