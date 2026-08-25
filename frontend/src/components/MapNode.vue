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

/**
 * Every side of the box is both an exit and an entry, and the map picks the
 * pair of faces that point at each other. A box only ever had a right-hand
 * exit and a left-hand entry before, so anything wired to something on its
 * left came out of the wrong face and doubled back through the box, which read
 * as a line hanging in the gap attached to nothing.
 *
 * Exit and entry sit at different points along the same side on purpose: a
 * reciprocal pair, two vnets peered in both directions, then draws as two
 * lines you can tell apart rather than one line drawn twice.
 */
const PORTS = [
  { id: 'out-l', type: 'source', position: Position.Left, style: { top: '64%' } },
  { id: 'in-l', type: 'target', position: Position.Left, style: { top: '36%' } },
  { id: 'out-r', type: 'source', position: Position.Right, style: { top: '36%' } },
  { id: 'in-r', type: 'target', position: Position.Right, style: { top: '64%' } },
  { id: 'out-t', type: 'source', position: Position.Top, style: { left: '64%' } },
  { id: 'in-t', type: 'target', position: Position.Top, style: { left: '36%' } },
  { id: 'out-b', type: 'source', position: Position.Bottom, style: { left: '36%' } },
  { id: 'in-b', type: 'target', position: Position.Bottom, style: { left: '64%' } },
] as const
</script>

<template>
  <div
    class="w-52 rounded-lg border bg-white px-2.5 py-2 text-left shadow-sm dark:bg-ink-900"
    :class="RING[data.status]"
  >
    <Handle
      v-for="port in PORTS"
      :key="port.id"
      :id="port.id"
      :type="port.type"
      :position="port.position"
      :style="port.style"
      :connectable="false"
    />
    <div class="flex items-center gap-2">
      <MapGlyph :kind="data.kind" size="sm" />
      <span class="truncate text-[0.78rem] font-medium">{{ data.label }}</span>
    </div>
    <p v-if="data.detail" class="mt-1 truncate text-[0.68rem] text-ink-500 dark:text-ink-400">
      {{ data.detail }}
    </p>
  </div>
</template>
