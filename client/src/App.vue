<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import Navbar from '@/components/Navbar.vue';

const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();

onMounted(async () => {
  // 앱 시작 시 인증 상태 확인
  await authStore.checkAuth();
  
  // 로그인 상태면 장바구니 로드
  if (authStore.isAuthenticated) {
    await cartStore.fetchCart();
  }
});
</script>

<template>
  <div class="min-h-screen bg-background">
    <Navbar />
    <main>
      <router-view />
    </main>
  </div>
</template>
