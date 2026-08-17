<script setup lang="ts">
import { computed } from 'vue'

import { parseProse } from './prose'

const props = defineProps<{ text: string }>()

const blocks = computed(() => parseProse(props.text))
</script>

<template>
  <div class="prose-beat">
    <template v-for="(block, index) in blocks" :key="index">
      <p v-if="block.kind === 'paragraph'">{{ block.text }}</p>

      <!-- Requirement bullets. In a design encounter these are the question. -->
      <ul v-else-if="block.kind === 'list'" class="my-3 space-y-1.5">
        <li v-for="(item, i) in block.items" :key="i" class="flex gap-2.5">
          <span
            class="mt-[0.62em] inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--ink-faint)]"
            aria-hidden="true"
          />
          <span class="min-w-0">{{ item }}</span>
        </li>
      </ul>

      <!-- Indentation and line breaks are the content here, so it scrolls in
           its own pane rather than reflowing. -->
      <div v-else class="terminal my-3">
        <pre>{{ block.text }}</pre>
      </div>
    </template>
  </div>
</template>
