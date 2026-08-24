<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { renderMarkdown } from '@/lib/markdown'

const props = defineProps<{ page: string }>()
const source = ref('')
const failed = ref(false)

async function load(): Promise<void> {
  failed.value = false
  try {
    const response = await fetch(`/content/legal/${props.page}.md`, { cache: 'no-cache' })
    if (!response.ok) throw new Error(String(response.status))
    source.value = await response.text()
  } catch {
    failed.value = true
  }
}

const html = computed(() => renderMarkdown(source.value))

onMounted(load)
watch(() => props.page, load)
</script>

<template>
  <article class="mx-auto max-w-2xl space-y-4 pb-8">
    <p v-if="failed" class="card p-4 text-sm">
      This page could not be loaded. The plain text version is at
      <a class="text-signal-600 underline" :href="`/legal/${page}.txt`">/legal/{{ page }}.txt</a>.
    </p>
    <div v-else class="space-y-4 text-sm leading-relaxed [&_h1]:mt-6 [&_h2]:mt-6 [&_h3]:mt-4" v-html="html" />
  </article>
</template>
