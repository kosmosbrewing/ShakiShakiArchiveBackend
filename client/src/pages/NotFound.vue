<template>
  <div class="min-h-screen flex items-center justify-center bg-background">
    <div class="text-center">
      <h1 class="text-6xl font-bold text-muted-foreground mb-4">404</h1>
      <p class="text-xl mb-8">페이지를 찾을 수 없습니다</p>
      <RouterLink
        to="/"
        data-testid="link-home"
        class="px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors inline-block"
      >
        홈으로 돌아가기
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>
