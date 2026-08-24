<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ left: number; budget: number }>()
const pips = computed(() => Array.from({ length: props.budget }, (_, i) => i < props.left))
</script>

<template>
  <div class="flex items-center gap-2 text-xs">
    <span class="text-ink-500 dark:text-ink-400">Time</span>
    <div class="flex flex-wrap gap-1" role="meter" :aria-valuenow="left" :aria-valuemax="budget"
         aria-label="Time units left on this incident">
      <span
        v-for="(full, i) in pips"
        :key="i"
        class="h-2.5 w-4 rounded-sm"
        :class="full ? 'bg-signal-500' : 'bg-ink-200 dark:bg-ink-800'"
      />
    </div>
    <span class="font-mono tabular-nums">{{ left }}/{{ budget }}</span>
  </div>
</template>
