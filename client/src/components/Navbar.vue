<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useRouter } from 'vue-router';

const authStore = useAuthStore();
const cartStore = useCartStore();
const router = useRouter();

const cartItemCount = computed(() => cartStore.totalItems);

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}
</script>

<template>
  <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div class="container mx-auto px-4">
      <div class="flex h-16 items-center justify-between">
        <!-- 로고 -->
        <router-link 
          to="/" 
          class="flex items-center gap-2 text-xl font-bold text-primary hover:opacity-80 transition-opacity"
          data-testid="link-home"
        >
          ShopHub
        </router-link>

        <!-- 네비게이션 -->
        <nav class="flex items-center gap-6">
          <router-link 
            to="/" 
            class="text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
            data-testid="link-products"
          >
            상품
          </router-link>

          <template v-if="authStore.isAuthenticated">
            <!-- 로그인된 경우 -->
            <router-link 
              to="/orders" 
              class="text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
              data-testid="link-orders"
            >
              주문내역
            </router-link>

            <router-link 
              v-if="authStore.isAdmin" 
              to="/admin" 
              class="text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
              data-testid="link-admin"
            >
              관리자
            </router-link>

            <router-link 
              to="/cart" 
              class="relative text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
              data-testid="link-cart"
            >
              장바구니
              <span 
                v-if="cartItemCount > 0" 
                class="absolute -top-2 -right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
                data-testid="text-cart-count"
              >
                {{ cartItemCount }}
              </span>
            </router-link>

            <div class="flex items-center gap-2">
              <span class="text-sm text-foreground/60" data-testid="text-user-name">
                {{ authStore.user?.firstName }} {{ authStore.user?.lastName }}
              </span>
              <button
                @click="handleLogout"
                class="text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
                data-testid="button-logout"
              >
                로그아웃
              </button>
            </div>
          </template>

          <template v-else>
            <!-- 로그인 안된 경우 -->
            <router-link 
              to="/login" 
              class="text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
              data-testid="link-login"
            >
              로그인
            </router-link>
            <router-link 
              to="/signup" 
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              data-testid="link-signup"
            >
              회원가입
            </router-link>
          </template>
        </nav>
      </div>
    </div>
  </header>
</template>
