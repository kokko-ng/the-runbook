<script setup lang="ts">
import LivingMap from '@/components/LivingMap.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ui.mapSheetOpen"
      class="fixed inset-0 z-50 flex flex-col bg-ink-50 dark:bg-ink-950"
      role="dialog"
      aria-modal="true"
      aria-label="Veymark architecture"
    >
      <div class="flex items-center justify-between border-b border-ink-200 px-3 py-2 dark:border-ink-800">
        <h2 class="text-sm font-semibold">Veymark architecture</h2>
        <button class="btn-quiet px-3" type="button" @click="ui.mapSheetOpen = false">Close</button>
      </div>
      <div class="min-h-0 grow">
        <LivingMap />
      </div>
      <p class="border-t border-ink-200 px-3 py-2 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
        Pinch to zoom, drag to pan.
      </p>
    </div>
  </Teleport>
</template>
