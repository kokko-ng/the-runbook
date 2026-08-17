<script setup lang="ts">
import AppFooter from '@/components/AppFooter.vue'
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <main class="mx-auto w-full max-w-2xl flex-1 px-4 py-20">
      <p class="eyebrow mb-2">404</p>
      <h1 class="mb-3 text-2xl font-semibold">There is no page here.</h1>
      <p class="prose-beat mb-6">
        The link is wrong, or the page has moved. Nothing has happened to your saved game.
      </p>
      <RouterLink to="/" class="btn btn-primary">Back to the start</RouterLink>
    </main>
    <AppFooter />
  </div>
</template>
