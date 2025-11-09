<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCartStore } from '@/stores/cart';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();
const cartStore = useCartStore();

const subtotal = computed(() => cartStore.totalPrice);

onMounted(async () => {
  await cartStore.fetchCart();
});

async function handleQuantityChange(itemId: string, newQuantity: number) {
  if (newQuantity < 1) return;
  await cartStore.updateQuantity(itemId, newQuantity);
}

async function handleRemoveItem(itemId: string) {
  if (confirm('이 상품을 장바구니에서 제거하시겠습니까?')) {
    await cartStore.removeItem(itemId);
  }
}

function goToCheckout() {
  router.push('/checkout');
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="mb-8 text-3xl font-bold" data-testid="text-page-title">장바구니</h1>

    <!-- 로딩 -->
    <div v-if="cartStore.loading" class="flex justify-center py-12">
      <div class="text-center">
        <div class="mb-2 text-4xl">⏳</div>
        <p class="text-muted-foreground">장바구니를 불러오는 중...</p>
      </div>
    </div>

    <!-- 빈 장바구니 -->
    <EmptyState
      v-else-if="cartStore.isEmpty"
      title="장바구니가 비어있습니다"
      description="상품을 장바구니에 담아보세요."
      action-text="쇼핑 계속하기"
      action-to="/"
    />

    <!-- 장바구니 아이템 -->
    <div v-else class="grid gap-8 lg:grid-cols-3">
      <!-- 아이템 목록 -->
      <div class="space-y-4 lg:col-span-2">
        <div
          v-for="item in cartStore.items"
          :key="item.id"
          class="flex gap-4 rounded-lg border bg-card p-4"
          :data-testid="`cart-item-${item.id}`"
        >
          <!-- 상품 이미지 -->
          <div class="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            <img
              v-if="item.product.imageUrl"
              :src="item.product.imageUrl"
              :alt="item.product.name"
              class="h-full w-full object-cover"
            />
            <div v-else class="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
              이미지 없음
            </div>
          </div>

          <!-- 상품 정보 -->
          <div class="flex flex-1 flex-col justify-between">
            <div>
              <h3 class="font-medium" :data-testid="`text-item-name-${item.id}`">
                {{ item.product.name }}
              </h3>
              <p class="mt-1 text-sm text-primary font-semibold" :data-testid="`text-item-price-${item.id}`">
                {{ parseFloat(item.product.price).toLocaleString() }}원
              </p>
            </div>

            <!-- 수량 조절 및 삭제 -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <button
                  @click="handleQuantityChange(item.id, item.quantity - 1)"
                  :disabled="item.quantity <= 1"
                  class="h-8 w-8 rounded-md border bg-background text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  :data-testid="`button-decrease-${item.id}`"
                >
                  -
                </button>
                <span class="w-12 text-center" :data-testid="`text-quantity-${item.id}`">
                  {{ item.quantity }}
                </span>
                <button
                  @click="handleQuantityChange(item.id, item.quantity + 1)"
                  class="h-8 w-8 rounded-md border bg-background text-foreground hover:bg-muted"
                  :data-testid="`button-increase-${item.id}`"
                >
                  +
                </button>
              </div>

              <button
                @click="handleRemoveItem(item.id)"
                class="text-sm text-destructive hover:underline"
                :data-testid="`button-remove-${item.id}`"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 주문 요약 -->
      <div class="lg:col-span-1">
        <div class="sticky top-20 rounded-lg border bg-card p-6 space-y-4">
          <h2 class="text-xl font-bold">주문 요약</h2>

          <div class="space-y-2 border-t pt-4">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">상품 개수</span>
              <span data-testid="text-total-items">{{ cartStore.totalItems }}개</span>
            </div>
            <div class="flex justify-between">
              <span class="font-semibold">총 금액</span>
              <span class="text-xl font-bold text-primary" data-testid="text-subtotal">
                {{ subtotal.toLocaleString() }}원
              </span>
            </div>
          </div>

          <button
            @click="goToCheckout"
            class="w-full rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            data-testid="button-checkout"
          >
            주문하기
          </button>

          <router-link
            to="/"
            class="block text-center text-sm text-primary hover:underline"
            data-testid="link-continue-shopping"
          >
            쇼핑 계속하기
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
