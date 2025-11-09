<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useOrdersStore } from '@/stores/orders';
import OrderStatusBadge from '@/components/OrderStatusBadge.vue';
import EmptyState from '@/components/EmptyState.vue';
import type { OrderStatus } from '@shared/schema';

const router = useRouter();
const ordersStore = useOrdersStore();

onMounted(async () => {
  await ordersStore.fetchOrders();
});

function viewOrder(orderId: string) {
  router.push(`/orders/${orderId}`);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="mb-8 text-3xl font-bold" data-testid="text-page-title">주문 내역</h1>

    <!-- 로딩 -->
    <div v-if="ordersStore.loading" class="flex justify-center py-12">
      <div class="text-center">
        <div class="mb-2 text-4xl">⏳</div>
        <p class="text-muted-foreground">주문 내역을 불러오는 중...</p>
      </div>
    </div>

    <!-- 에러 -->
    <div v-else-if="ordersStore.error" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <p class="text-destructive" data-testid="text-error">
        {{ ordersStore.error }}
      </p>
    </div>

    <!-- 빈 상태 -->
    <EmptyState
      v-else-if="ordersStore.orders.length === 0"
      title="주문 내역이 없습니다"
      description="첫 주문을 해보세요!"
      action-text="쇼핑하러 가기"
      action-to="/"
    />

    <!-- 주문 목록 -->
    <div v-else class="space-y-4">
      <div
        v-for="order in ordersStore.orders"
        :key="order.id"
        class="cursor-pointer rounded-lg border bg-card p-6 transition-shadow hover:shadow-lg"
        :data-testid="`order-card-${order.id}`"
        @click="viewOrder(order.id)"
      >
        <div class="mb-4 flex items-start justify-between">
          <div>
            <h3 class="text-lg font-semibold mb-1" :data-testid="`text-order-id-${order.id}`">
              주문번호: {{ order.id.substring(0, 8) }}
            </h3>
            <p class="text-sm text-muted-foreground" :data-testid="`text-order-date-${order.id}`">
              {{ formatDate(order.createdAt) }}
            </p>
          </div>
          <OrderStatusBadge :status="order.status as OrderStatus" />
        </div>

        <div class="space-y-2 border-t pt-4">
          <!-- 주문 상품 요약 -->
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">상품 {{ order.orderItems.length }}개</span>
            <span class="font-semibold text-primary" :data-testid="`text-order-total-${order.id}`">
              {{ parseFloat(order.totalAmount).toLocaleString() }}원
            </span>
          </div>

          <!-- 배송 정보 -->
          <div class="text-sm">
            <p class="text-muted-foreground">받는 분: {{ order.shippingName }}</p>
            <p class="text-muted-foreground">연락처: {{ order.shippingPhone }}</p>
          </div>

          <!-- 운송장 번호 (있는 경우) -->
          <div v-if="order.trackingNumber" class="rounded-lg bg-muted p-3 text-sm">
            <p class="text-muted-foreground mb-1">운송장 번호</p>
            <p class="font-medium" :data-testid="`text-tracking-${order.id}`">
              {{ order.trackingNumber }}
            </p>
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <button
            class="text-sm text-primary hover:underline"
            :data-testid="`button-view-order-${order.id}`"
          >
            상세 보기 →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
