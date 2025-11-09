<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useCartStore } from '@/stores/cart';
import { useOrdersStore } from '@/stores/orders';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();
const cartStore = useCartStore();
const ordersStore = useOrdersStore();

const shippingName = ref('');
const shippingPhone = ref('');
const shippingAddress = ref('');
const shippingPostalCode = ref('');

const isSubmitting = ref(false);
const formError = ref<string | null>(null);

const subtotal = computed(() => cartStore.totalPrice);

onMounted(async () => {
  await cartStore.fetchCart();
  
  if (cartStore.isEmpty) {
    router.push('/cart');
  }
});

async function handleSubmit() {
  formError.value = null;

  // 검증
  if (!shippingName.value.trim()) {
    formError.value = '받는 분 이름을 입력해주세요';
    return;
  }
  if (!shippingPhone.value.trim()) {
    formError.value = '연락처를 입력해주세요';
    return;
  }
  if (!shippingAddress.value.trim()) {
    formError.value = '주소를 입력해주세요';
    return;
  }

  isSubmitting.value = true;

  try {
    const order = await ordersStore.createOrder({
      totalAmount: subtotal.value.toString(),
      status: 'pending_payment',
      shippingName: shippingName.value,
      shippingPhone: shippingPhone.value,
      shippingAddress: shippingAddress.value,
      shippingPostalCode: shippingPostalCode.value || undefined,
    });

    if (order) {
      // 장바구니 비우기
      cartStore.clearCart();
      
      // 주문 완료 페이지로 이동
      alert(`주문이 완료되었습니다!\n주문번호: ${order.id}`);
      router.push('/orders');
    } else {
      formError.value = ordersStore.error || '주문 생성에 실패했습니다';
    }
  } catch (err: any) {
    formError.value = err.message;
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="mb-8 text-3xl font-bold" data-testid="text-page-title">주문하기</h1>

    <!-- 빈 장바구니 -->
    <EmptyState
      v-if="cartStore.isEmpty"
      title="장바구니가 비어있습니다"
      description="주문할 상품을 장바구니에 담아주세요."
      action-text="쇼핑하러 가기"
      action-to="/"
    />

    <!-- 주문 폼 -->
    <div v-else class="grid gap-8 lg:grid-cols-3">
      <!-- 배송 정보 입력 -->
      <div class="space-y-6 lg:col-span-2">
        <div class="rounded-lg border bg-card p-6">
          <h2 class="mb-4 text-xl font-bold">배송 정보</h2>

          <form @submit.prevent="handleSubmit" class="space-y-4">
            <div>
              <label class="mb-2 block text-sm font-medium" for="shipping-name">
                받는 분 이름 <span class="text-destructive">*</span>
              </label>
              <input
                id="shipping-name"
                v-model="shippingName"
                type="text"
                required
                class="w-full rounded-lg border border-input bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="input-shipping-name"
              />
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium" for="shipping-phone">
                연락처 <span class="text-destructive">*</span>
              </label>
              <input
                id="shipping-phone"
                v-model="shippingPhone"
                type="tel"
                required
                placeholder="010-0000-0000"
                class="w-full rounded-lg border border-input bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="input-shipping-phone"
              />
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium" for="shipping-address">
                주소 <span class="text-destructive">*</span>
              </label>
              <textarea
                id="shipping-address"
                v-model="shippingAddress"
                required
                rows="3"
                class="w-full rounded-lg border border-input bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="input-shipping-address"
              ></textarea>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium" for="shipping-postal">
                우편번호 (선택)
              </label>
              <input
                id="shipping-postal"
                v-model="shippingPostalCode"
                type="text"
                placeholder="12345"
                class="w-full rounded-lg border border-input bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="input-shipping-postal"
              />
            </div>

            <!-- 에러 메시지 -->
            <div v-if="formError" class="rounded-lg border border-destructive bg-destructive/10 p-3">
              <p class="text-sm text-destructive" data-testid="text-form-error">
                {{ formError }}
              </p>
            </div>
          </form>
        </div>

        <!-- 결제 안내 -->
        <div class="rounded-lg border bg-muted p-6">
          <h3 class="mb-2 font-semibold">💳 결제 안내</h3>
          <p class="text-sm text-muted-foreground">
            주문 생성 후 관리자가 결제를 확인합니다. 결제 확인 후 상품 준비가 시작됩니다.
          </p>
        </div>
      </div>

      <!-- 주문 요약 -->
      <div class="lg:col-span-1">
        <div class="sticky top-20 space-y-4 rounded-lg border bg-card p-6">
          <h2 class="text-xl font-bold">주문 요약</h2>

          <!-- 상품 목록 -->
          <div class="space-y-2 border-t pt-4">
            <div
              v-for="item in cartStore.items"
              :key="item.id"
              class="flex justify-between text-sm"
            >
              <span class="text-muted-foreground">
                {{ item.product.name }} × {{ item.quantity }}
              </span>
              <span>{{ (parseFloat(item.product.price) * item.quantity).toLocaleString() }}원</span>
            </div>
          </div>

          <div class="border-t pt-4">
            <div class="flex justify-between">
              <span class="font-semibold">총 금액</span>
              <span class="text-xl font-bold text-primary" data-testid="text-total">
                {{ subtotal.toLocaleString() }}원
              </span>
            </div>
          </div>

          <button
            @click="handleSubmit"
            :disabled="isSubmitting"
            class="w-full rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="button-submit-order"
          >
            {{ isSubmitting ? '주문 중...' : '주문 완료' }}
          </button>

          <router-link
            to="/cart"
            class="block text-center text-sm text-primary hover:underline"
            data-testid="link-back-to-cart"
          >
            장바구니로 돌아가기
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
