<script setup lang="ts">
import { VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import { computed, nextTick, watch } from 'vue'

import MapNode from '@/components/MapNode.vue'
import type { DiagramSpec, NodeStatus } from '@/engine'
import { useContentStore } from '@/stores/content'
import { useGameStore } from '@/stores/game'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

/**
 * The world map is the company's Azure estate.
 *
 * Nodes appear as the story deploys them and turn red when an incident touches
 * them. Positions come from the content registry, but each column is compacted
 * at render time so the diagram stays tight while it is still half empty.
 */
const props = withDefaults(defineProps<{ act?: string; compact?: boolean }>(), {
  act: 'act1',
  compact: false,
})

const content = useContentStore()
const game = useGameStore()
const { fitView } = useVueFlow()

const spec = computed<DiagramSpec | undefined>(() => content.index?.diagrams?.[props.act])

const EDGE_TONE: Record<NodeStatus, string> = {
  healthy: 'var(--color-ink-400)',
  degraded: 'var(--color-degraded)',
  broken: 'var(--color-broken)',
  planned: 'var(--color-planned)',
}

const nodes = computed<Node[]>(() => {
  const diagram = game.save?.diagram
  if (!spec.value || !diagram) return []
  const byGroup = new Map<string, typeof spec.value.nodes>()
  for (const node of spec.value.nodes) {
    if (!diagram.nodes[node.id]?.present) continue
    const bucket = byGroup.get(node.group) ?? []
    bucket.push(node)
    byGroup.set(node.group, bucket)
  }

  const out: Node[] = []
  for (const [groupId, members] of byGroup) {
    const label = spec.value.groups.find((group) => group.id === groupId)?.label ?? groupId
    const column = members[0].x
    out.push({
      id: `group:${groupId}`,
      type: 'default',
      position: { x: column, y: -80 },
      draggable: false,
      selectable: false,
      connectable: false,
      data: { label },
      class:
        'rounded-md border-0 bg-transparent px-0 text-xs font-semibold uppercase tracking-wide text-ink-500',
      style: { width: '208px' },
    })
    members
      .slice()
      .sort((a, b) => a.y - b.y)
      .forEach((node, position) => {
        const state = diagram.nodes[node.id]
        out.push({
          id: node.id,
          type: 'resource',
          position: { x: column, y: position * 84 },
          draggable: false,
          selectable: false,
          connectable: false,
          data: {
            label: node.label,
            kind: node.kind,
            status: state.status,
            detail: props.compact ? undefined : (state.detail ?? node.detail),
          },
        })
      })
  }
  return out
})

const edges = computed<Edge[]>(() => {
  const diagram = game.save?.diagram
  if (!spec.value || !diagram) return []
  const visible = new Set(nodes.value.map((node) => node.id))
  return spec.value.edges
    .filter((edge) => diagram.edges[edge.id]?.present)
    .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
    .map((edge) => {
      const status = diagram.edges[edge.id].status
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: props.compact ? undefined : edge.label,
        animated: status === 'broken',
        style: { stroke: EDGE_TONE[status], strokeWidth: status === 'healthy' ? 1.5 : 2.5 },
        labelBgStyle: { fill: 'transparent' },
        labelStyle: { fontSize: '10px', fill: 'var(--color-ink-500)' },
      } satisfies Edge
    })
})

watch(
  () => nodes.value.length,
  async () => {
    await nextTick()
    fitView({ padding: 0.18, duration: 300 })
  },
)
</script>

<template>
  <div class="relative h-full w-full">
    <p
      v-if="!nodes.length"
      class="grid h-full place-items-center px-6 text-center text-sm text-ink-500 dark:text-ink-400"
    >
      Nothing is deployed yet. The map fills in as you build the estate.
    </p>
    <VueFlow
      v-else
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="false"
      :elements-selectable="false"
      :min-zoom="0.15"
      :max-zoom="1.6"
      :zoom-on-double-click="false"
      fit-view-on-init
      class="h-full w-full"
    >
      <template #node-resource="nodeProps">
        <MapNode :data="nodeProps.data" />
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
:deep(.vue-flow__node-default) {
  border: 0;
  background: transparent;
  box-shadow: none;
  font-size: 0.7rem;
}
:deep(.vue-flow__handle) {
  opacity: 0.35;
}
</style>
