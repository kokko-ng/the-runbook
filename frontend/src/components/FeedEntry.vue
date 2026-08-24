<script setup lang="ts">
import type { LogEntry } from '@/engine'

defineProps<{ entry: LogEntry }>()
</script>

<template>
  <li class="min-w-0">
    <!-- The opening beat of an encounter. -->
    <div v-if="entry.kind === 'intro'" class="space-y-2">
      <h2 class="text-base font-semibold tracking-tight sm:text-lg">{{ entry.title }}</h2>
      <p v-if="entry.speaker" class="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
        {{ entry.speaker }}
      </p>
      <p class="prose-beat whitespace-pre-line text-ink-800 dark:text-ink-200">{{ entry.text }}</p>
    </div>

    <!-- The ticket that started it. -->
    <div
      v-else-if="entry.kind === 'ticket'"
      class="card border-l-4 border-l-degraded p-3 sm:p-4"
    >
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-500 dark:text-ink-400">
        <span class="font-semibold text-ink-700 dark:text-ink-200">{{ entry.ticket.ref }}</span>
        <span>opened {{ entry.ticket.opened }}</span>
        <span>{{ entry.ticket.reporter }}</span>
        <span v-if="entry.ticket.severity" class="uppercase">{{ entry.ticket.severity }}</span>
      </p>
      <p class="mt-1.5 text-sm">{{ entry.ticket.summary }}</p>
    </div>

    <!-- Something a person told you. -->
    <div v-else-if="entry.kind === 'reveal'" class="border-l-2 border-signal-500/60 pl-3">
      <p class="text-xs text-ink-500 dark:text-ink-400">
        {{ entry.speaker ? entry.speaker : 'You ask' }} &middot; {{ entry.action }}
      </p>
      <p class="prose-beat mt-1 whitespace-pre-line">{{ entry.reveals }}</p>
    </div>

    <!-- Command output. Monospace lives here and nowhere else. -->
    <div v-else-if="entry.kind === 'command'" class="space-y-1.5">
      <div class="console">
        <pre class="text-signal-400">$ {{ entry.cmd }}</pre>
        <pre class="mt-1 text-ink-200">{{ entry.output }}</pre>
      </div>
      <p v-if="entry.note" class="text-xs text-ink-500 dark:text-ink-400">{{ entry.note }}</p>
    </div>

    <div v-else-if="entry.kind === 'choice'" class="text-sm">
      <span class="text-ink-500 dark:text-ink-400">You went with: </span>
      <span class="ml-1 font-medium">{{ entry.label }}</span>
    </div>

    <!-- What happened, then why. -->
    <div
      v-else-if="entry.kind === 'feedback'"
      class="card border-l-4 p-3 sm:p-4"
      :class="entry.correct ? 'border-l-healthy' : 'border-l-broken'"
    >
      <p class="flex items-center gap-2 text-sm font-semibold">
        <span :class="entry.correct ? 'text-healthy' : 'text-broken'">
          {{ entry.correct ? 'That holds up.' : 'That did not hold up.' }}
        </span>
        <span
          v-if="entry.rep_delta"
          class="font-mono text-xs"
          :class="entry.rep_delta > 0 ? 'text-healthy' : 'text-broken'"
        >
          {{ entry.rep_delta > 0 ? '+' : '' }}{{ entry.rep_delta }} rep
        </span>
      </p>
      <p v-if="entry.consequence" class="prose-beat mt-2 italic text-ink-700 dark:text-ink-300">
        {{ entry.consequence }}
      </p>
      <p class="prose-beat mt-2">{{ entry.explain }}</p>
    </div>

    <p v-else-if="entry.kind === 'resolution'" class="prose-beat text-ink-700 dark:text-ink-300">
      {{ entry.text }}
    </p>

    <p v-else class="text-xs uppercase tracking-wide text-signal-500">{{ entry.text }}</p>
  </li>
</template>
