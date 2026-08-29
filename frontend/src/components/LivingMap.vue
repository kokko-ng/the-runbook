<script setup lang="ts">
import { MarkerType, VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import { computed, nextTick, watch } from 'vue'

import MapNode from '@/components/MapNode.vue'
import MapWire from '@/components/MapWire.vue'
import type { DiagramSpec, NodeStatus } from '@/engine'
import { useContentStore } from '@/stores/content'
import { useGameStore } from '@/stores/game'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

/**
 * The world map is the company's Azure estate.
 *
 * Nodes appear as the story deploys them and turn red when an incident touches
 * them.
 *
 * The layout is computed here rather than taken from the registry. The registry
 * decides which group a node belongs to and the order within it; this decides
 * where the columns go. That means two groups can never collide because someone
 * gave them the same x, and empty columns close up while the estate is still
 * half built.
 *
 * Because this file knows where every box ends up, it also picks which face of
 * a box each link leaves from and arrives at. A link to something on the left
 * leaves by the left, a link to something in the same column leaves by the
 * bottom, and nothing doubles back through the box it started in.
 */
const props = withDefaults(defineProps<{ act?: string; compact?: boolean }>(), {
  act: 'act1',
  compact: false,
})

const content = useContentStore()
const game = useGameStore()
const { fitView, onNodesInitialized } = useVueFlow()

const spec = computed<DiagramSpec | undefined>(() => content.index?.diagrams?.[props.act])

const EDGE_TONE: Record<NodeStatus, string> = {
  healthy: 'var(--color-ink-400)',
  degraded: 'var(--color-degraded)',
  broken: 'var(--color-broken)',
  planned: 'var(--color-planned)',
}

const NODE_WIDTH = 208
/** Room between two columns for a link and the words describing it. */
const GUTTER = 132
const COLUMN_WIDTH = NODE_WIDTH + GUTTER
const ROW_HEIGHT = 96
const HEADER_OFFSET = 96

/** Where a box ended up, so a link can work out which faces to join. */
interface Cell {
  column: number
  row: number
}

interface Layout {
  nodes: Node[]
  placement: Map<string, Cell>
}

const layout = computed<Layout>(() => {
  const placement = new Map<string, Cell>()
  const diagram = game.save?.diagram
  if (!spec.value || !diagram) return { nodes: [], placement }

  const byGroup = new Map<string, typeof spec.value.nodes>()
  for (const node of spec.value.nodes) {
    if (!diagram.nodes[node.id]?.present) continue
    const bucket = byGroup.get(node.group) ?? []
    bucket.push(node)
    byGroup.set(node.group, bucket)
  }

  // Columns follow the order the groups are declared in, skipping any group
  // with nothing deployed in it yet.
  const order = (spec.value.groups ?? []).map((group) => group.id)
  const visible = [...byGroup.keys()].sort(
    (a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999),
  )

  const out: Node[] = []
  visible.forEach((groupId, columnIndex) => {
    const members = byGroup.get(groupId) ?? []
    const label = spec.value?.groups.find((group) => group.id === groupId)?.label ?? groupId
    const column = columnIndex * COLUMN_WIDTH
    out.push({
      id: `group:${groupId}`,
      type: 'default',
      position: { x: column, y: -HEADER_OFFSET },
      draggable: false,
      selectable: false,
      connectable: false,
      data: { label },
      class:
        'map-group rounded-md border-0 bg-transparent px-0 text-xs font-semibold uppercase tracking-wide',
      style: { width: `${NODE_WIDTH}px` },
    })
    members
      .slice()
      .sort((a, b) => a.y - b.y)
      .forEach((node, position) => {
        const state = diagram.nodes[node.id]
        placement.set(node.id, { column: columnIndex, row: position })
        out.push({
          id: node.id,
          type: 'resource',
          position: { x: column, y: position * ROW_HEIGHT },
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
  })
  return { nodes: out, placement }
})

const nodes = computed<Node[]>(() => layout.value.nodes)

/**
 * The pair of faces to join two boxes by: top to bottom within a column,
 * otherwise the two sides that already point at each other.
 */
function ports(from: Cell, to: Cell): { sourceHandle: string; targetHandle: string } {
  if (from.column === to.column) {
    return to.row > from.row
      ? { sourceHandle: 'out-b', targetHandle: 'in-t' }
      : { sourceHandle: 'out-t', targetHandle: 'in-b' }
  }
  return to.column > from.column
    ? { sourceHandle: 'out-r', targetHandle: 'in-l' }
    : { sourceHandle: 'out-l', targetHandle: 'in-r' }
}

const edges = computed<Edge[]>(() => {
  const diagram = game.save?.diagram
  const placement = layout.value.placement
  if (!spec.value || !diagram) return []

  // A peering is authored as two links, one each way, and both say the same
  // thing. Print that once; the arrowheads carry the direction.
  const spoken = new Set<string>()

  return spec.value.edges
    .filter((edge) => diagram.edges[edge.id]?.present)
    .filter((edge) => placement.has(edge.source) && placement.has(edge.target))
    .map((edge) => {
      const status = diagram.edges[edge.id].status
      const tone = EDGE_TONE[status]
      const pair = [edge.source, edge.target].sort().join(' ') + ' ' + (edge.label ?? '')
      const alreadySaid = Boolean(edge.label) && spoken.has(pair)
      if (edge.label) spoken.add(pair)

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...ports(placement.get(edge.source)!, placement.get(edge.target)!),
        type: 'wire',
        label: props.compact || alreadySaid ? undefined : edge.label,
        animated: status === 'broken',
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: tone },
        style: { stroke: tone, strokeWidth: status === 'healthy' ? 1.5 : 2.5 },
      } satisfies Edge
    })
})

/**
 * Frame the whole act.
 *
 * This waits for Vue Flow to have measured the boxes rather than for Vue to
 * have rendered them. A box has no width until it has been through a layout
 * pass, and fitting to boxes that still measure zero lands on a zoom that has
 * nothing to do with the diagram: switching to Act 2 used to settle at 0.86
 * with eight of its eighteen boxes off the edge of the pane. onNodesInitialized
 * fires once every box has real dimensions, which is the moment the bounds are
 * worth reading.
 *
 * The act was also only refitted when the number of boxes changed, so two acts
 * with the same count would have kept the previous act's framing. It watches
 * which boxes are on screen instead.
 */
function frameAct(): void {
  fitView({ padding: 0.18, duration: 300 })
}

onNodesInitialized(frameAct)

watch(
  () => nodes.value.map((node) => node.id).join(','),
  async () => {
    await nextTick()
    frameAct()
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
      <template #edge-wire="edgeProps">
        <MapWire v-bind="edgeProps" :grid="{ columnWidth: COLUMN_WIDTH, nodeWidth: NODE_WIDTH }" />
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
/* Boxes are joined edge to edge, so the ports themselves are never drawn.
   There are eight per box now and dotting all of them would be clutter. */
:deep(.vue-flow__handle) {
  opacity: 0;
  height: 1px;
  width: 1px;
  min-width: 0;
  min-height: 0;
  border: 0;
}
:deep(.map-group) {
  color: var(--color-map-label);
}
/* Link labels ride above the boxes rather than under them, which is what stops
   the box beside a label from slicing the words in half. */
:deep(.vue-flow__edge-labels) {
  z-index: 10;
}
</style>
