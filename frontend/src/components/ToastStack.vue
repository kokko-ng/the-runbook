<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const tones = {
  info: 'border-ink-300 dark:border-ink-700',
  good: 'border-healthy/60',
  bad: 'border-broken/60',
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 p-3"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <p
        v-for="toast in ui.toasts"
        :key="toast.id"
        class="card max-w-md border px-4 py-2.5 text-sm shadow-lg"
        :class="tones[toast.tone]"
      >
        {{ toast.text }}
      </p>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
