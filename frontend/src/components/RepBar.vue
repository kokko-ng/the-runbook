<script setup lang="ts">
import { computed } from 'vue'

import { REP_BAR_STRONG } from '@/engine'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const rep = computed(() => game.save?.rep ?? 0)
const tone = computed(() =>
  rep.value >= REP_BAR_STRONG ? 'bg-healthy' : rep.value >= 35 ? 'bg-signal-500' : 'bg-broken',
)
</script>

<template>
  <div v-if="game.save" class="flex items-center gap-3 text-xs">
    <span class="shrink-0 font-medium text-ink-600 dark:text-ink-300">Reputation</span>
    <div
      class="h-2 min-w-0 grow overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800"
      role="meter"
      :aria-valuenow="rep"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label="Reputation"
    >
      <div
        class="h-full rounded-full transition-[width] duration-500"
        :class="tone"
        :style="{ width: `${rep}%` }"
      />
    </div>
    <span class="w-8 shrink-0 text-right font-mono tabular-nums">{{ rep }}</span>
    <span class="hidden shrink-0 text-ink-500 sm:inline dark:text-ink-400">
      {{ game.rank }}
    </span>
    <span class="shrink-0 rounded-full border border-ink-300 px-2 py-0.5 dark:border-ink-700">
      {{ game.save.skill_points }} SP
    </span>
  </div>
</template>
