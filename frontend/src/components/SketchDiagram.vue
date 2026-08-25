<script setup lang="ts">
import { computed } from 'vue'

import type { Sketch } from '@/engine'

/**
 * An inline diagram for the topology under discussion.
 *
 * Authored as data on the encounter, laid out on a small grid and drawn as an
 * SVG with a viewBox, so it scales to whatever width the feed gives it and
 * stays readable on a 320 px phone. This is the "diagram beyond the world map"
 * case: a proposal being argued about, not the live estate.
 *
 * Lines stop at the box edges rather than running under them, and a link that
 * would pass straight through another box is bowed underneath, which is what
 * makes a claim like "these two are not actually connected" legible.
 */
const props = defineProps<{ sketch: Sketch }>()

const CELL_W = 196
const CELL_H = 112
const BOX_W = 140
const BOX_H = 54
const PAD = 12

const cols = computed(() => Math.max(...props.sketch.nodes.map((node) => node.col)) + 1)
const rows = computed(() => Math.max(...props.sketch.nodes.map((node) => node.row)) + 1)
const width = computed(() => cols.value * CELL_W)
const height = computed(() => rows.value * CELL_H + PAD)

interface Placed {
  id: string
  label: string
  note?: string
  tone: string
  col: number
  row: number
  x: number
  y: number
  cx: number
  cy: number
}

const placed = computed<Placed[]>(() =>
  props.sketch.nodes.map((node) => {
    const x = node.col * CELL_W + (CELL_W - BOX_W) / 2
    const y = node.row * CELL_H + (CELL_H - BOX_H) / 2
    return {
      id: node.id,
      label: node.label,
      note: node.note,
      tone: node.tone ?? 'normal',
      col: node.col,
      row: node.row,
      x,
      y,
      cx: x + BOX_W / 2,
      cy: y + BOX_H / 2,
    }
  }),
)

const byId = computed(() => Object.fromEntries(placed.value.map((node) => [node.id, node])))

/** Where a line from one box towards another leaves the first box. */
function exitPoint(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx
  const dy = to.cy - from.cy
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : (BOX_W / 2 + 4) / Math.abs(dx)
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : (BOX_H / 2 + 4) / Math.abs(dy)
  const scale = Math.min(scaleX, scaleY)
  return { x: from.cx + dx * scale, y: from.cy + dy * scale }
}

const links = computed(() =>
  (props.sketch.edges ?? []).flatMap((edge) => {
    const from = byId.value[edge.source]
    const to = byId.value[edge.target]
    if (!from || !to) return []

    const key = `${edge.source}-${edge.target}-${edge.label ?? ''}`
    const tone = edge.tone ?? 'normal'
    // Two boxes in the same row with something between them would be joined by a
    // line straight through that box, so bow this one underneath instead.
    const skipsABox = from.row === to.row && Math.abs(from.col - to.col) > 1

    if (skipsABox) {
      const base = Math.max(from.y, to.y) + BOX_H
      const apex = base + 26
      return [
        {
          key,
          d: `M ${from.cx} ${from.y + BOX_H} Q ${(from.cx + to.cx) / 2} ${apex + 14} ${to.cx} ${to.y + BOX_H}`,
          label: edge.label,
          lx: (from.cx + to.cx) / 2,
          ly: apex + 12,
          tone,
        },
      ]
    }

    const start = exitPoint(from, to)
    const end = exitPoint(to, from)
    return [
      {
        key,
        d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
        label: edge.label,
        lx: (start.x + end.x) / 2,
        ly: (start.y + end.y) / 2 - 5,
        tone,
      },
    ]
  }),
)

const STROKE: Record<string, string> = {
  normal: 'var(--color-ink-400)',
  proposed: 'var(--color-signal-500)',
  problem: 'var(--color-broken)',
}
</script>

<template>
  <figure class="min-w-0">
    <div
      class="overflow-x-auto rounded-lg border border-ink-200 bg-white p-2 dark:border-ink-800
      dark:bg-ink-900"
    >
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        :style="{ minWidth: `${Math.min(width, 300)}px` }"
        class="h-auto w-full"
        role="img"
        :aria-label="sketch.caption"
      >
        <g fill="none">
          <path
            v-for="link in links"
            :key="link.key"
            :d="link.d"
            :stroke="STROKE[link.tone]"
            stroke-width="2"
            :stroke-dasharray="link.tone === 'proposed' ? '6 4' : undefined"
          />
        </g>
        <g v-for="node in placed" :key="node.id">
          <rect
            :x="node.x"
            :y="node.y"
            :width="BOX_W"
            :height="BOX_H"
            rx="8"
            fill="var(--color-ink-50)"
            class="dark:fill-ink-950"
            :stroke="STROKE[node.tone]"
            :stroke-width="node.tone === 'normal' ? 1.5 : 2"
            :stroke-dasharray="node.tone === 'proposed' ? '6 4' : undefined"
          />
          <text
            :x="node.cx"
            :y="node.note ? node.cy - 1 : node.cy + 5"
            text-anchor="middle"
            font-size="13"
            font-weight="500"
            fill="currentColor"
          >
            {{ node.label }}
          </text>
          <text
            v-if="node.note"
            :x="node.cx"
            :y="node.cy + 15"
            text-anchor="middle"
            font-size="11"
            fill="var(--color-ink-500)"
          >
            {{ node.note }}
          </text>
        </g>
        <!-- Labels last, so a line never draws across the words. -->
        <g>
          <text
            v-for="link in links"
            :key="`label-${link.key}`"
            :x="link.lx"
            :y="link.ly"
            text-anchor="middle"
            font-size="11"
            fill="var(--color-ink-500)"
            paint-order="stroke"
            stroke="var(--color-ink-50)"
            stroke-width="4"
            class="dark:[stroke:var(--color-ink-900)]"
          >
            {{ link.label }}
          </text>
        </g>
      </svg>
    </div>
    <figcaption class="mt-1.5 text-xs text-ink-500 dark:text-ink-400">
      {{ sketch.caption }}
    </figcaption>
  </figure>
</template>
