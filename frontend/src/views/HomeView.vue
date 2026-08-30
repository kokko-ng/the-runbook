<script setup lang="ts">
import { computed } from 'vue'

import { useContentStore } from '@/stores/content'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const content = useContentStore()

const resumeTarget = computed(() => game.save?.position?.quest_id ?? null)
const totals = computed(() => {
  const chapters = content.chapters
  const quests = chapters.reduce((sum, chapter) => sum + chapter.quests.length, 0)
  const objectives = content.index?.exams.reduce(
    (sum, exam) =>
      sum + exam.domains.reduce((inner, domain) =>
        inner + domain.groups.reduce((count, group) => count + group.objectives.length, 0), 0),
    0,
  )
  return { chapters: chapters.length, quests, objectives: objectives ?? 0 }
})
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 py-4 sm:py-10">
    <section class="space-y-4">
      <p class="text-xs uppercase tracking-[0.2em] text-signal-600 dark:text-signal-400">
        An Azure career RPG
      </p>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">The Runbook</h1>
      <p class="prose-beat text-ink-700 dark:text-ink-200">
        You have just joined Meridian Logistics as a junior cloud admin. There is a ticket queue,
        an estate nobody documented, and an auditor arriving in a fortnight. Survive the tickets,
        make the calls, and work your way up to solutions architect.
      </p>
      <p class="prose-beat text-ink-600 dark:text-ink-300">
        Every objective on the current AZ-104 and AZ-305 study guides is covered by a scenario you
        actually play. Nothing is typed: you pick, and you live with it.
      </p>
      <div class="flex flex-wrap gap-3">
        <RouterLink v-if="resumeTarget" :to="`/play/${resumeTarget}`" class="btn-primary">
          Back to work
        </RouterLink>
        <RouterLink to="/career" class="btn-primary" v-else>Start the first shift</RouterLink>
        <RouterLink to="/career" v-if="resumeTarget" class="btn-quiet">The queue</RouterLink>
        <RouterLink to="/about" class="btn-quiet">What this is</RouterLink>
      </div>
      <p class="text-sm text-ink-500 dark:text-ink-400">
        Free, both acts, no account needed. Progress is saved in this browser; an account only
        exists so you can pick it up on another device.
      </p>
    </section>

    <section class="grid gap-3 sm:grid-cols-3">
      <div class="card p-4">
        <p class="font-mono text-2xl">{{ totals.objectives }}</p>
        <p class="text-sm text-ink-500 dark:text-ink-400">exam objectives mapped</p>
      </div>
      <div class="card p-4">
        <p class="font-mono text-2xl">{{ totals.chapters }}</p>
        <p class="text-sm text-ink-500 dark:text-ink-400">chapters, two acts</p>
      </div>
      <div class="card p-4">
        <p class="font-mono text-2xl">{{ totals.quests }}</p>
        <p class="text-sm text-ink-500 dark:text-ink-400">quests in the queue</p>
      </div>
    </section>

    <section v-if="game.save && game.hasProgress" class="card p-4">
      <h2 class="text-sm font-semibold">Where you are</h2>
      <dl class="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt class="text-ink-500 dark:text-ink-400">Rank</dt><dd>{{ game.rank }}</dd></div>
        <div><dt class="text-ink-500 dark:text-ink-400">Reputation</dt><dd>{{ game.save.rep }}</dd></div>
        <div>
          <dt class="text-ink-500 dark:text-ink-400">Quests closed</dt>
          <dd>{{ game.save.progress.quests_completed.length }}</dd>
        </div>
        <div>
          <dt class="text-ink-500 dark:text-ink-400">Objectives</dt>
          <dd>
            {{ game.examReadiness.mastered }} solid /
            {{ game.examReadiness.covered }} of {{ game.examReadiness.total }}
          </dd>
        </div>
      </dl>
      <div v-if="game.reviewDue().length" class="mt-4 flex flex-wrap items-center gap-3">
        <RouterLink to="/review" class="btn-quiet">
          Follow-ups due: {{ game.reviewDue().length }}
        </RouterLink>
        <p class="text-xs text-ink-500 dark:text-ink-400">
          Cleared objectives come due for a drill; recall them before they fade.
        </p>
      </div>
    </section>
  </div>
</template>
