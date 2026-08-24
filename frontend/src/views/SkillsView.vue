<script setup lang="ts">
import PerkShop from '@/components/PerkShop.vue'
import SkillTree from '@/components/SkillTree.vue'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">Skills</h1>
      <p class="text-sm text-ink-600 dark:text-ink-300">
        One tree per exam domain. Nodes light up on their own as you clear the encounters that
        cover them, so what is still dark is what you have not been tested on.
      </p>
    </header>

    <section class="card p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm font-semibold">
          {{ game.examReadiness.covered }} of {{ game.examReadiness.total }} objectives cleared
        </p>
        <ul class="flex flex-wrap gap-4 text-xs text-ink-500 dark:text-ink-400">
          <li v-for="exam in game.examReadiness.byExam" :key="exam.exam">
            {{ exam.exam }} {{ exam.covered }}/{{ exam.total }} ({{ exam.percent }}%)
          </li>
        </ul>
      </div>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
        <div
          class="h-full rounded-full bg-signal-500 transition-[width] duration-500"
          :style="{ width: `${game.examReadiness.percent}%` }"
        />
      </div>
    </section>

    <PerkShop />

    <div class="grid gap-4 lg:grid-cols-2">
      <SkillTree v-for="tree in game.trees" :key="tree.id" :tree="tree" />
    </div>
  </div>
</template>
