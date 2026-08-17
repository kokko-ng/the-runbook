<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ remaining: number; budget: number }>()

const ticks = computed(() => Array.from({ length: props.budget }, (_, index) => index))
const over = computed(() => props.remaining <= 0)
</script>

<template>
  <div class="flex items-center gap-2">
    <span class="eyebrow">Time</span>
    <div class="flex gap-[3px]" role="img" :aria-label="`${remaining} of ${budget} time units left`">
      <span
        v-for="tick in ticks"
        :key="tick"
        class="h-3.5 w-1.5 rounded-[1px]"
        :class="
          tick < remaining
            ? 'bg-[var(--color-hivis-500)]'
            : 'bg-[var(--rule)]'
        "
      />
    </div>
    <span
      class="readout text-[0.8125rem]"
      :class="over ? 'text-[var(--color-broken)]' : 'text-[var(--ink-muted)]'"
    >
      {{ remaining }}<span class="text-[var(--ink-faint)]">/{{ budget }}</span>
    </span>
  </div>
</template>
