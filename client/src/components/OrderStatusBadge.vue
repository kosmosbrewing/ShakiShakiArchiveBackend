<script setup lang="ts">
import { computed } from 'vue';
import type { OrderStatus } from '@shared/schema';

const props = defineProps<{
  status: OrderStatus;
}>();

const statusConfig = computed(() => {
  const configs: Record<OrderStatus, { label: string; class: string }> = {
    pending_payment: {
      label: '결제 대기',
      class: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    },
    payment_confirmed: {
      label: '결제 완료',
      class: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    preparing: {
      label: '상품 준비 중',
      class: 'bg-purple-100 text-purple-800 border-purple-300',
    },
    shipped: {
      label: '배송 중',
      class: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    },
    delivered: {
      label: '배송 완료',
      class: 'bg-green-100 text-green-800 border-green-300',
    },
    cancelled: {
      label: '취소됨',
      class: 'bg-red-100 text-red-800 border-red-300',
    },
  };
  
  return configs[props.status] || configs.pending_payment;
});
</script>

<template>
  <span 
    class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
    :class="statusConfig.class"
    :data-testid="`badge-order-status-${status}`"
  >
    {{ statusConfig.label }}
  </span>
</template>
