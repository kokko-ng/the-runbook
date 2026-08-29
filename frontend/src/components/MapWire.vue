<script setup lang="ts">
import { BaseEdge, EdgeLabelRenderer, Position } from '@vue-flow/core'
import { computed, type CSSProperties } from 'vue'

/**
 * A link on the living map, and the words describing it.
 *
 * Two things here are the map's own rather than Vue Flow's defaults.
 *
 * The label is drawn into the overlay above the boxes, not into the same SVG
 * as the wires underneath them, so a box can no longer slice a label in half.
 *
 * And it is not parked at the middle of the curve. The middle of a curve that
 * spans three columns is somewhere over the column in between, so the label
 * would cover a box instead of being covered by one, which is no better. It is
 * parked in the nearest empty lane instead: the gap between two columns for a
 * link that runs across, and the gap between two rows for one that runs down a
 * column.
 *
 * A label in a row gap is held clear of the box the wire leaves by, and it is
 * the label's own near edge that is held clear, not its centre. Holding the
 * centre a fixed distance away only ever moves the first line: a label that
 * wraps to two puts the second line back inside the box, which is what
 * "password hash sync" did to Entra Connect. Anchoring the edge and shifting by
 * the label's own height leaves it clear whether it runs to one line or four.
 *
 * It stays anchored to the box the wire leaves by rather than sitting midway
 * between the two ends, because the two ends are not always one row apart. A
 * link down a column can skip a row, and the midpoint of that one is over the
 * box in between: that is "site-to-site VPN" landing on AD. The lane the wire
 * leaves into is empty by construction, so that is where the words go.
 */
const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  /** Column pitch and box width, so a label can find the gap between two columns. */
  grid: { columnWidth: number; nodeWidth: number }
  /** Vue Flow types this loosely; the map only ever authors plain text. */
  label?: unknown
  markerEnd?: string
  style?: CSSProperties
}>()

const text = computed(() => (typeof props.label === 'string' ? props.label : ''))

/** The same curve Vue Flow's bezier edge draws, kept here so it can be sampled. */
const curve = computed(() => {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = props
  const pull = (span: number) => (span >= 0 ? 0.5 * span : 0.25 * 25 * Math.sqrt(-span))
  const control = (pos: Position, x1: number, y1: number, x2: number, y2: number) => {
    switch (pos) {
      case Position.Left:
        return { x: x1 - pull(x1 - x2), y: y1 }
      case Position.Right:
        return { x: x1 + pull(x2 - x1), y: y1 }
      case Position.Top:
        return { x: x1, y: y1 - pull(y1 - y2) }
      default:
        return { x: x1, y: y1 + pull(y2 - y1) }
    }
  }
  const a = control(props.sourcePosition, sx, sy, tx, ty)
  const b = control(props.targetPosition, tx, ty, sx, sy)
  return { a, b, path: `M${sx},${sy} C${a.x},${a.y} ${b.x},${b.y} ${tx},${ty}` }
})

function at(t: number): { x: number; y: number } {
  const { a, b } = curve.value
  const u = 1 - t
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
  return {
    x: w[0] * props.sourceX + w[1] * a.x + w[2] * b.x + w[3] * props.targetX,
    y: w[0] * props.sourceY + w[1] * a.y + w[2] * b.y + w[3] * props.targetY,
  }
}

/** Kept off the boxes either side of a column gutter. */
const LANE_INSET = 16

/** True when the wire runs between columns rather than down one. */
const acrossColumns = computed(
  () => props.sourcePosition === Position.Left || props.sourcePosition === Position.Right,
)

/**
 * How wide the words may run before they wrap. A label between two columns has
 * only the gutter, and reaching past it would touch the box alongside. A label
 * in a row gap has a whole box width of empty space, so it gets that: wider
 * means fewer lines, and fewer lines is what keeps it inside the gap.
 */
const labelWidth = computed(() =>
  acrossColumns.value
    ? props.grid.columnWidth - props.grid.nodeWidth - LANE_INSET
    : props.grid.nodeWidth,
)

/** How far the near edge of a label sits from the box the wire leaves by. */
const ROW_CLEARANCE = 8

const anchor = computed<{ x: number; y: number; shift: string }>(() => {
  if (!acrossColumns.value) {
    // Down or up a column: the lane the wire leaves into, which is empty
    // whether or not the far end is the very next row. `shift` puts the
    // label's near edge on the anchor, so extra lines grow away from the box.
    const heading = props.sourcePosition === Position.Bottom ? 1 : -1
    return {
      x: (props.sourceX + props.targetX) / 2,
      y: props.sourceY + heading * ROW_CLEARANCE,
      shift: heading === 1 ? '0' : '-100%',
    }
  }

  // Across: the middle of whichever gap between two columns the wire crosses
  // closest to its own halfway point.
  const { columnWidth, nodeWidth } = props.grid
  const gap = columnWidth - nodeWidth
  const low = Math.min(props.sourceX, props.targetX)
  const high = Math.max(props.sourceX, props.targetX)

  let best: { x: number; y: number; shift: string } | null = null
  let bestDistanceFromMiddle = Number.POSITIVE_INFINITY
  for (let column = Math.floor(low / columnWidth); column <= Math.ceil(high / columnWidth); column++) {
    const lane = column * columnWidth + nodeWidth + gap / 2
    if (lane < low || lane > high) continue
    // The t whose point sits furthest into this lane.
    let closest = 0.5
    let offLane = Number.POSITIVE_INFINITY
    for (let step = 1; step < 200; step++) {
      const t = step / 200
      const away = Math.abs(at(t).x - lane)
      if (away < offLane) {
        offLane = away
        closest = t
      }
    }
    const distanceFromMiddle = Math.abs(closest - 0.5)
    if (distanceFromMiddle < bestDistanceFromMiddle) {
      bestDistanceFromMiddle = distanceFromMiddle
      best = { x: lane, y: at(closest).y, shift: '-50%' }
    }
  }
  return best ?? { ...at(0.5), shift: '-50%' }
})
</script>

<template>
  <BaseEdge :id="id" :path="curve.path" :marker-end="markerEnd" :style="style" />
  <EdgeLabelRenderer v-if="text">
    <div
      class="map-wire-label"
      :style="{
        transform: `translate(-50%, ${anchor.shift}) translate(${anchor.x}px, ${anchor.y}px)`,
        maxWidth: `${labelWidth}px`,
      }"
    >
      {{ text }}
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.map-wire-label {
  position: absolute;
  border-radius: 4px;
  padding: 1px 5px;
  background: var(--color-map-halo);
  color: var(--color-map-label);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.25;
  text-align: center;
  text-wrap: balance;
  overflow-wrap: anywhere;
  pointer-events: none;
}
</style>
