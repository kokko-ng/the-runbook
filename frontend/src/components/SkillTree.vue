<script setup lang="ts">
import type { SkillTree } from '@/engine'

defineProps<{ tree: SkillTree }>()

const STATE = {
  dark: 'border-ink-200 dark:border-ink-800 opacity-70',
  partial: 'border-signal-500/60',
  covered: 'border-degraded',
  mastered: 'border-healthy',
}

const OBJECTIVE = {
  dark: 'text-ink-400 dark:text-ink-500',
  covered: 'text-degraded',
  mastered: 'text-ink-700 dark:text-ink-200',
}

/* Covered is "you have seen it and wobbled"; mastered is "it held". */
const MARK = { dark: '-', covered: '~', mastered: '+' }
</script>

<template>
  <section class="card p-4">
    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-sm font-semibold">{{ tree.title }}</h3>
      <p class="font-mono text-xs text-ink-500 dark:text-ink-400">
        {{ tree.exam }} &middot; {{ tree.weight }} &middot; {{ tree.mastered }} solid /
        {{ tree.covered }} of {{ tree.total }}
      </p>
    </header>
    <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
      <div class="flex h-full">
        <div
          class="h-full bg-healthy transition-[width] duration-500"
          :style="{ width: `${tree.total ? (tree.mastered / tree.total) * 100 : 0}%` }"
        />
        <div
          class="h-full bg-degraded transition-[width] duration-500"
          :style="{ width: `${tree.total ? ((tree.covered - tree.mastered) / tree.total) * 100 : 0}%` }"
        />
      </div>
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
            {{ node.mastered }}/{{ node.covered }}/{{ node.total }}
          </span>
        </p>
        <ul class="mt-1 space-y-0.5">
          <li
            v-for="objective in node.objectives"
            :key="objective.id"
            class="flex gap-2 text-xs"
            :class="OBJECTIVE[objective.state]"
          >
            <span aria-hidden="true">{{ MARK[objective.state] }}</span>
            <span>{{ objective.text }}</span>
            <span v-if="objective.state === 'covered'" class="sr-only">needs another pass</span>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
