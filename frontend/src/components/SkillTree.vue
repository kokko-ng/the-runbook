<script setup lang="ts">
import type { SkillTree } from '@/engine'

defineProps<{ tree: SkillTree }>()

const STATE = {
  dark: 'border-ink-200 dark:border-ink-800 opacity-70',
  partial: 'border-signal-500/60',
  lit: 'border-healthy',
}
</script>

<template>
  <section class="card p-4">
    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-sm font-semibold">{{ tree.title }}</h3>
      <p class="font-mono text-xs text-ink-500 dark:text-ink-400">
        {{ tree.exam }} &middot; {{ tree.weight }} &middot; {{ tree.covered }}/{{ tree.total }}
      </p>
    </header>
    <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
      <div
        class="h-full rounded-full bg-signal-500 transition-[width] duration-500"
        :style="{ width: `${tree.total ? (tree.covered / tree.total) * 100 : 0}%` }"
      />
    </div>
    <ul class="mt-4 space-y-3">
      <li
        v-for="node in tree.nodes"
        :key="node.id"
        class="rounded-lg border-l-4 pl-3"
        :class="STATE[node.state]"
      >
        <p class="text-sm font-medium">
          {{ node.title }}
          <span class="ml-1 font-mono text-xs text-ink-500 dark:text-ink-400">
            {{ node.covered }}/{{ node.total }}
          </span>
        </p>
        <ul class="mt-1 space-y-0.5">
          <li
            v-for="objective in node.objectives"
            :key="objective.id"
            class="flex gap-2 text-xs"
            :class="objective.lit ? 'text-ink-700 dark:text-ink-200' : 'text-ink-400 dark:text-ink-500'"
          >
            <span aria-hidden="true">{{ objective.lit ? '+' : '-' }}</span>
            <span>{{ objective.text }}</span>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
