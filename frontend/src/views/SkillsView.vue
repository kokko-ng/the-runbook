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
        One tree per exam domain, and it tells the truth in two shades. An objective cleared
        without a wrong turn is solid; one you recovered on a later attempt is only covered, and
        covered means it deserves another pass. Dark is what you have not been tested on. The
        <RouterLink to="/review" class="text-signal-600 underline dark:text-signal-400"
          >review queue</RouterLink
        >
        is how covered becomes solid.
      </p>
    </header>

    <section class="card p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm font-semibold">
          {{ game.examReadiness.mastered }} solid, {{ game.examReadiness.covered }} of
          {{ game.examReadiness.total }} covered
        </p>
        <ul class="flex flex-wrap gap-4 text-xs text-ink-500 dark:text-ink-400">
          <li v-for="exam in game.examReadiness.byExam" :key="exam.exam">
            {{ exam.exam }} {{ exam.mastered }} solid / {{ exam.covered }}/{{ exam.total }}
            ({{ exam.solid_percent }}%)
          </li>
        </ul>
      </div>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
        <div class="flex h-full">
          <div
            class="h-full bg-healthy transition-[width] duration-500"
            :style="{ width: `${game.examReadiness.solid_percent}%` }"
          />
          <div
            class="h-full bg-degraded transition-[width] duration-500"
            :style="{ width: `${game.examReadiness.percent - game.examReadiness.solid_percent}%` }"
          />
        </div>
      </div>
    </section>

    <PerkShop />

    <div class="grid gap-4 lg:grid-cols-2">
      <SkillTree v-for="tree in game.trees" :key="tree.id" :tree="tree" />
    </div>
  </div>
</template>
