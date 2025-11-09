<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOrdersStore } from '@/stores/orders';
import OrderStatusBadge from '@/components/OrderStatusBadge.vue';
import type { OrderStatus } from '@shared/schema';

const route = useRoute();
const router = useRouter();
const ordersStore = useOrdersStore();

const order = computed(() => ordersStore.currentOrder);

onMounted(async () => {
  const id = route.params.id as string;
  await ordersStore.fetchOrder(id);
});

function goBack() {
  router.push('/orders');
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- 로딩 -->
    <div v-if="ordersStore.loading" class="flex justify-center py-12">
      <div class="text-center">
        <div class="mb-2 text-4xl">⏳</div>
        <p class="text-muted-foreground">주문 정보를 불러오는 중...</p>
      </div>
    </div>

    <!-- 에러 -->
    <div v-else-if="ordersStore.error || !order" class="py-12">
      <div class="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p class="text-destructive mb-4" data-testid="text-error">
          {{ ordersStore.error || '주문을 찾을 수 없습니다' }}
        </p>
        <button
          @click="goBack"
          class="text-sm text-primary hover:underline"
          data-testid="button-go-back"
        >
          주문 내역으로 돌아가기
        </button>
      </div>
    </div>

    <!-- 주문 상세 -->
    <div v-else>
      <!-- 뒤로가기 -->
      <button
        @click="goBack"
        class="mb-6 text-sm text-muted-foreground hover:text-foreground"
        data-testid="button-back"
      >
        ← 주문 내역으로
      </button>

      <div class="mb-6 flex items-start justify-between">
        <div>
          <h1 class="text-3xl font-bold mb-2" data-testid="text-order-id">
            주문번호: {{ order.id }}
          </h1>
          <p class="text-muted-foreground" data-testid="text-order-date">
            주문일시: {{ formatDate(order.createdAt) }}
          </p>
        </div>
        <OrderStatusBadge :status="order.status as OrderStatus" />
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <!-- 주문 상품 -->
        <div class="space-y-4 lg:col-span-2">
          <div class="rounded-lg border bg-card p-6">
            <h2 class="mb-4 text-xl font-bold">주문 상품</h2>
            <div class="space-y-4">
              <div
                v-for="item in order.orderItems"
                :key="item.id"
                class="flex justify-between border-b pb-4 last:border-b-0"
                :data-testid="`order-item-${item.id}`"
              >
                <div>
                  <h3 class="font-medium" :data-testid="`text-item-name-${item.id}`">
                    {{ item.productName }}
                  </h3>
                  <p class="text-sm text-muted-foreground">
                    {{ parseFloat(item.productPrice).toLocaleString() }}원 × {{ item.quantity }}개
                  </p>
                </div>
                <div class="text-right">
                  <p class="font-semibold" :data-testid="`text-item-total-${item.id}`">
                    {{ (parseFloat(item.productPrice) * item.quantity).toLocaleString() }}원
                  </p>
                </div>
              </div>
            </div>
            
            <div class="mt-4 border-t pt-4 flex justify-between text-lg">
              <span class="font-bold">총 금액</span>
              <span class="font-bold text-primary" data-testid="text-total-amount">
                {{ parseFloat(order.totalAmount).toLocaleString() }}원
              </span>
            </div>
          </div>
        </div>

        <!-- 배송 정보 -->
        <div class="space-y-4 lg:col-span-1">
          <div class="rounded-lg border bg-card p-6">
            <h2 class="mb-4 text-xl font-bold">배송 정보</h2>
            <div class="space-y-3 text-sm">
              <div>
                <p class="text-muted-foreground mb-1">받는 분</p>
                <p class="font-medium" data-testid="text-shipping-name">{{ order.shippingName }}</p>
              </div>
              <div>
                <p class="text-muted-foreground mb-1">연락처</p>
                <p class="font-medium" data-testid="text-shipping-phone">{{ order.shippingPhone }}</p>
              </div>
              <div>
                <p class="text-muted-foreground mb-1">주소</p>
                <p class="font-medium" data-testid="text-shipping-address">
                  {{ order.shippingAddress }}
                </p>
                <p v-if="order.shippingPostalCode" class="text-muted-foreground mt-1">
                  우편번호: {{ order.shippingPostalCode }}
                </p>
              </div>
            </div>
          </div>

          <!-- 운송장 정보 -->
          <div v-if="order.trackingNumber" class="rounded-lg border bg-card p-6">
            <h2 class="mb-4 text-xl font-bold">배송 추적</h2>
            <div class="text-sm">
              <p class="text-muted-foreground mb-1">운송장 번호</p>
              <p class="font-medium text-lg" data-testid="text-tracking-number">
                {{ order.trackingNumber }}
              </p>
            </div>
          </div>

          <!-- 주문 상태 안내 -->
          <div class="rounded-lg bg-muted p-4 text-sm">
            <p class="font-semibold mb-2">주문 상태 안내</p>
            <ul class="space-y-1 text-muted-foreground">
              <li>• 결제 대기: 결제 확인 중</li>
              <li>• 결제 완료: 상품 준비 시작 전</li>
              <li>• 상품 준비 중: 포장 및 출고 준비</li>
              <li>• 배송 중: 택배사 배송 진행</li>
              <li>• 배송 완료: 수령 완료</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
