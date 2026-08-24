<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

import MapGlyph from '@/components/MapGlyph.vue'
import type { NodeStatus } from '@/engine'

defineProps<{
  data: { label: string; kind: string; status: NodeStatus; detail?: string }
}>()

const RING: Record<NodeStatus, string> = {
  healthy: 'border-ink-200 dark:border-ink-700',
  degraded: 'border-degraded shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-degraded)_25%,transparent)]',
  broken: 'border-broken shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-broken)_28%,transparent)]',
  planned: 'border-dashed border-ink-300 opacity-70 dark:border-ink-600',
}
</script>

<template>
  <div
    class="w-52 rounded-lg border bg-white px-2.5 py-2 text-left shadow-sm dark:bg-ink-900"
    :class="RING[data.status]"
  >
    <Handle type="target" :position="Position.Left" class="!h-1.5 !w-1.5 !border-0 !bg-ink-300" />
    <div class="flex items-center gap-2">
      <MapGlyph :kind="data.kind" size="sm" />
      <span class="truncate text-[0.78rem] font-medium">{{ data.label }}</span>
    </div>
    <p v-if="data.detail" class="mt-1 truncate text-[0.68rem] text-ink-500 dark:text-ink-400">
      {{ data.detail }}
    </p>
    <Handle type="source" :position="Position.Right" class="!h-1.5 !w-1.5 !border-0 !bg-ink-300" />
  </div>
</template>
