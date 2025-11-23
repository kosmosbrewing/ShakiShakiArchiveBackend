<template>
  <div class="container max-w-md py-10">
    <div class="bg-card p-8 rounded-lg border border-border shadow-sm">
      <h1 class="text-primary text-center text-2xl font-bold mb-8">로그인</h1>

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
            placeholder="your@email.com"
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
            placeholder="비밀번호"
          />
        </div>

        <button
          type="submit"
          data-testid="button-submit"
          class="w-full py-2 bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90"
        >
          로그인
        </button>
      </form>

      <div class="mt-6 text-center">
        <p class="text-sm text-muted-foreground">
          계정이 없으신가요?
          <router-link to="/signup" class="text-primary hover:underline">
            회원가입
          </router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
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
    router.push('/');
  }
}
</script>
