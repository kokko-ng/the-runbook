<script setup lang="ts">
import { computed } from 'vue'

import { REP_BONUS_THRESHOLD } from '@/engine/constants'

const props = defineProps<{ rep: number; compact?: boolean }>()

const SEGMENTS = 10

/**
 * Reputation is professional standing, so it reads as a review rating rather
 * than a health bar: a segmented gauge plus what your standing is called.
 */
const standing = computed(() => {
  if (props.rep >= REP_BONUS_THRESHOLD) return 'Relied on'
  if (props.rep >= 60) return 'Trusted'
  if (props.rep >= 40) return 'Solid'
  if (props.rep >= 20) return 'Watched'
  return 'On thin ice'
})

const filled = computed(() => Math.round((props.rep / 100) * SEGMENTS))

const tone = computed(() => {
  if (props.rep >= 60) return 'bg-[var(--color-healthy)]'
  if (props.rep >= 25) return 'bg-[var(--color-hivis-500)]'
  return 'bg-[var(--color-broken)]'
})
</script>

<template>
  <div
    class="flex items-center gap-2"
    role="img"
    :aria-label="`Standing ${rep} of 100, ${standing}`"
  >
    <div class="flex gap-[3px]">
      <span
        v-for="index in SEGMENTS"
        :key="index"
        class="h-3.5 w-1.5 rounded-[1px]"
        :class="index <= filled ? tone : 'bg-[var(--rule)]'"
      />
    </div>
    <span class="readout text-[0.8125rem] font-medium">{{ rep }}</span>
    <span v-if="!compact" class="eyebrow">{{ standing }}</span>
  </div>
</template>
