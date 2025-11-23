<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-4">
    <div class="w-full max-w-md">
      <div class="bg-card p-8 rounded-lg border border-border shadow-sm">
        <h1 class="text-2xl font-bold text-center mb-6">ShopHub 로그인</h1>
        
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium mb-2">
              이메일
            </label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              required
              data-testid="input-email"
              class="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="example@email.com"
            />
          </div>
          
          <div>
            <label for="password" class="block text-sm font-medium mb-2">
              비밀번호
            </label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              required
              data-testid="input-password"
              class="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="비밀번호를 입력하세요"
            />
          </div>
          
          <div v-if="authStore.error" class="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p class="text-sm text-destructive" data-testid="text-error">
              {{ authStore.error }}
            </p>
          </div>
          
          <button
            type="submit"
            :disabled="authStore.loading"
            data-testid="button-login"
            class="w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ authStore.loading ? '로그인 중...' : '로그인' }}
          </button>
        </form>
        
        <p class="mt-6 text-center text-sm text-muted-foreground">
          계정이 없으신가요?
          <RouterLink
            to="/signup"
            data-testid="link-signup"
            class="text-primary hover:underline font-medium"
          >
            회원가입
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const form = ref({
  email: '',
  password: '',
});

async function handleSubmit() {
  const success = await authStore.login(form.value);
  
  if (success) {
    const redirect = router.currentRoute.value.query.redirect as string;
    router.push(redirect || '/');
  }
}
</script>
