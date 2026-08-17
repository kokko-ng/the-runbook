<script setup lang="ts">
import type { Ticket } from '@/engine/types'

defineProps<{ ticket: Ticket }>()

const PRIORITY_TONE: Record<string, string> = {
  P1: 'text-[var(--color-broken)] border-[var(--color-broken)]',
  P2: 'text-[var(--color-hivis-600)] border-[var(--color-hivis-600)]',
  P3: 'text-[var(--ink-muted)] border-[var(--rule-strong)]',
  P4: 'text-[var(--ink-muted)] border-[var(--rule-strong)]',
}
</script>

<template>
  <article class="panel overflow-hidden">
    <header
      class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--rule)] bg-[var(--surface-sunken)] px-3 py-2"
    >
      <span class="readout text-[0.8125rem] font-medium">{{ ticket.id }}</span>
      <span
        class="border px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wider"
        :class="PRIORITY_TONE[ticket.priority] ?? PRIORITY_TONE.P3"
      >
        {{ ticket.priority }}
      </span>
      <span class="eyebrow ml-auto">
        {{ ticket.reporter }}<template v-if="ticket.opened"> · {{ ticket.opened }}</template>
      </span>
    </header>
    <div class="px-3 py-2.5">
      <p class="whitespace-pre-line font-serif text-[0.9375rem] leading-relaxed">
        {{ ticket.body }}
      </p>
    </div>
  </article>
</template>
