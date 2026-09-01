<script setup lang="ts">
import { ref } from 'vue'

import LivingMap from '@/components/LivingMap.vue'

const act = ref('act1')
const legend = [
  ['healthy', 'Running'],
  ['degraded', 'Degraded'],
  ['broken', 'Broken'],
  ['planned', 'Planned'],
] as const
</script>

<template>
  <div class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">Veymark architecture</h1>
        <p class="text-sm text-ink-600 dark:text-ink-300">
          The estate as it stands. It grows when you deploy something and turns red when something
          you own is on fire.
        </p>
      </div>
      <div class="flex gap-1 rounded-lg border border-ink-200 p-0.5 dark:border-ink-700">
        <button
          v-for="option in ['act1', 'act2']"
          :key="option"
          type="button"
          class="min-h-9 rounded-md px-3 text-sm"
          :class="act === option ? 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900' : ''"
          @click="act = option"
        >
          Act {{ option.slice(-1) }}
        </button>
      </div>
    </header>

    <div class="card h-[70vh] min-h-96 overflow-hidden">
      <LivingMap :act="act" />
    </div>

    <ul class="flex flex-wrap gap-4 text-xs text-ink-600 dark:text-ink-300">
      <li v-for="[status, label] in legend" :key="status" class="flex items-center gap-2">
        <span class="h-3 w-3 rounded" :style="{ background: `var(--color-${status})` }" />
        {{ label }}
      </li>
    </ul>
  </div>
</template>
