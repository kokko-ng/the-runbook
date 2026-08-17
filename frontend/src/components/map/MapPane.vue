<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'

import type { DiagramState } from '@/engine/types'

// vue-flow is the largest dependency in the bundle and a phone may never open
// the map, so it loads on demand.
const ArchitectureMap = defineAsyncComponent(() => import('./ArchitectureMap.vue'))

const props = defineProps<{ diagram: DiagramState }>()

const trouble = computed(() =>
  props.diagram.nodes.filter(
    (node) => node.status === 'broken' || node.status === 'warning' || node.status === 'degraded',
  ),
)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex items-center justify-between gap-2 border-b border-[var(--rule)] px-3 py-2">
      <div>
        <p class="eyebrow">Meridian estate</p>
        <p class="text-[0.75rem] text-[var(--ink-muted)]">
          {{ diagram.nodes.length }} resources
          <template v-if="trouble.length">
            &middot;
            <span class="text-[var(--color-broken)]">{{ trouble.length }} needing attention</span>
          </template>
        </p>
      </div>
      <slot name="actions" />
    </header>

    <div class="min-h-0 flex-1">
      <ArchitectureMap :diagram="diagram" />
    </div>

    <footer
      v-if="trouble.length"
      class="max-h-28 overflow-y-auto border-t border-[var(--rule)] px-3 py-2"
    >
      <ul class="space-y-1">
        <li
          v-for="node in trouble"
          :key="node.id"
          class="flex items-baseline gap-2 text-[0.75rem]"
        >
          <span
            class="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            :class="
              node.status === 'broken'
                ? 'bg-[var(--color-broken)]'
                : node.status === 'warning'
                  ? 'bg-[var(--color-hivis-500)]'
                  : 'bg-[var(--color-degraded)]'
            "
          />
          <span class="min-w-0 flex-1 truncate">{{ node.label }}</span>
          <span class="eyebrow shrink-0">{{ node.status }}</span>
        </li>
      </ul>
    </footer>
  </div>
</template>
