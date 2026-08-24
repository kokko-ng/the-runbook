<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import FeedEntry from '@/components/FeedEntry.vue'
import type { LogEntry } from '@/engine'

const props = defineProps<{ entries: LogEntry[] }>()
const tail = ref<HTMLElement | null>(null)

watch(
  () => props.entries.length,
  async () => {
    await nextTick()
    tail.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  },
)
</script>

<template>
  <ol class="flex min-w-0 flex-col gap-4">
    <FeedEntry v-for="entry in entries" :key="entry.seq" :entry="entry" />
    <li ref="tail" aria-hidden="true" class="h-px" />
  </ol>
</template>
