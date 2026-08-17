<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { FeedEntry as Entry } from '@/stores/game'

import FeedEntry from './FeedEntry.vue'
import { isRenderable } from './renderable'

const props = defineProps<{ entries: Entry[] }>()

const anchor = ref<HTMLElement | null>(null)

const visible = computed(() => props.entries.filter((entry) => isRenderable(entry.event)))

// Keep the newest entry in view as the transcript grows.
watch(
  () => visible.value.length,
  async () => {
    await nextTick()
    anchor.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  },
)
</script>

<template>
  <div>
    <FeedEntry v-for="entry in visible" :key="entry.key" :event="entry.event" />
    <div ref="anchor" aria-hidden="true" />
  </div>
</template>
