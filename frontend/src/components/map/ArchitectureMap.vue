<script setup lang="ts">
import { computed } from 'vue'
import { Background } from '@vue-flow/background'
import { VueFlow } from '@vue-flow/core'
import type { Edge, Node } from '@vue-flow/core'

import type { DiagramState, NodeStatus } from '@/engine/types'

import '@vue-flow/core/dist/style.css'
import MapNode from './MapNode.vue'

const props = defineProps<{ diagram: DiagramState }>()

/**
 * Authored positions are hints; anything without one falls into a grid so the
 * map is never a pile in the corner.
 */
const nodes = computed<Node[]>(() =>
  props.diagram.nodes.map((node, index) => ({
    id: node.id,
    type: 'resource',
    position: node.position ?? { x: (index % 4) * 220 - 240, y: Math.floor(index / 4) * 130 },
    data: node,
    draggable: false,
    selectable: false,
    connectable: false,
  })),
)

const EDGE_TONE: Record<NodeStatus, string> = {
  healthy: 'var(--rule-strong)',
  warning: 'var(--color-hivis-500)',
  broken: 'var(--color-broken)',
  degraded: 'var(--color-degraded)',
  planned: 'var(--rule)',
}

const edges = computed<Edge[]>(() =>
  props.diagram.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.status === 'broken',
    style: {
      stroke: EDGE_TONE[edge.status],
      strokeWidth: edge.status === 'healthy' ? 1.5 : 2,
      strokeDasharray: edge.status === 'planned' ? '4 3' : undefined,
    },
    labelBgStyle: { fill: 'var(--surface)' },
    labelStyle: { fill: 'var(--ink-muted)', fontSize: 10 },
    selectable: false,
    focusable: false,
  })),
)
</script>

<template>
  <VueFlow
    :nodes="nodes"
    :edges="edges"
    :fit-view-on-init="true"
    :fit-view-options="{ padding: 0.12, maxZoom: 1 }"
    :min-zoom="0.2"
    :max-zoom="1.8"
    :nodes-draggable="false"
    :elements-selectable="false"
    :pan-on-scroll="true"
    class="h-full w-full"
  >
    <template #node-resource="nodeProps">
      <MapNode :data="nodeProps.data" />
    </template>
    <Background :gap="18" :size="1" pattern-color="var(--rule)" />
  </VueFlow>
</template>

<style>
/* vue-flow paints its own surface; hand it ours so the theme carries through. */
.vue-flow__pane {
  background: var(--surface-sunken);
}
.vue-flow__edge-text {
  font-family: var(--font-sans);
}
</style>
