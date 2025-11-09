<template>
  <div class="min-h-screen">
    <nav class="border-b border-border bg-background">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <RouterLink to="/" class="text-2xl font-bold text-primary">
            ShopHub
          </RouterLink>
          
          <div class="flex items-center gap-4">
            <template v-if="authStore.isAuthenticated">
              <RouterLink
                to="/cart"
                data-testid="link-cart"
                class="text-sm font-medium hover:text-primary transition-colors"
              >
                장바구니
              </RouterLink>
              <RouterLink
                to="/orders"
                data-testid="link-orders"
                class="text-sm font-medium hover:text-primary transition-colors"
              >
                주문내역
              </RouterLink>
              <RouterLink
                v-if="authStore.isAdmin"
                to="/admin"
                data-testid="link-admin"
                class="text-sm font-medium hover:text-primary transition-colors"
              >
                관리자
              </RouterLink>
              <button
                @click="handleLogout"
                data-testid="button-logout"
                class="text-sm font-medium hover:text-primary transition-colors"
              >
                로그아웃
              </button>
            </template>
            <template v-else>
              <RouterLink
                to="/login"
                data-testid="link-login"
                class="text-sm font-medium hover:text-primary transition-colors"
              >
                로그인
              </RouterLink>
              <RouterLink
                to="/signup"
                data-testid="link-signup"
                class="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                회원가입
              </RouterLink>
            </template>
          </div>
        </div>
      </div>
    </nav>
    
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div class="text-center">
        <h1 class="text-4xl font-bold mb-4">ShopHub에 오신 것을 환영합니다</h1>
        <p class="text-lg text-muted-foreground mb-8">
          Vue 3로 전환된 한국 전자상거래 플랫폼
        </p>
        
        <div v-if="authStore.isAuthenticated" class="max-w-md mx-auto p-6 bg-card rounded-lg border border-border">
          <p class="text-sm text-muted-foreground mb-2">로그인 사용자</p>
          <p class="font-medium" data-testid="text-username">
            {{ authStore.user?.firstName }} {{ authStore.user?.lastName }}
          </p>
          <p class="text-sm text-muted-foreground" data-testid="text-email">
            {{ authStore.user?.email }}
          </p>
          <p v-if="authStore.isAdmin" class="mt-2 text-sm font-medium text-primary">
            관리자 계정
          </p>
        </div>
        
        <p class="mt-8 text-sm text-muted-foreground">
          🚧 상품 목록 및 기타 페이지는 현재 구현 중입니다.
        </p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

onMounted(() => {
  authStore.checkAuth();
});

async function handleLogout() {
  await authStore.logout();
  router.push('/');
}
</script>
