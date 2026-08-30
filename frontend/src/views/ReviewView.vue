<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import ChoiceList from '@/components/ChoiceList.vue'
import IncidentPanel from '@/components/IncidentPanel.vue'
import NarrativeFeed from '@/components/NarrativeFeed.vue'
import type { GameEvent } from '@/engine'
import { useContentStore } from '@/stores/content'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const content = useContentStore()
const loading = ref(true)

const save = computed(() => game.save)
const session = computed(() => save.value?.review_session ?? null)
const run = computed(() => game.run)
const encounter = computed(() => game.encounter)
const due = computed(() => game.reviewDue())

const acts = computed(() =>
  content.acts.map((act) => ({ ...act, ready: game.drillReady(act.id) })),
)

/** True while a live story ticket is open; a replay of a closed quest is not one. */
const storyBusy = computed(() =>
  Boolean(
    run.value &&
      !run.value.review &&
      !save.value?.progress.quests_completed.includes(run.value.quest_id),
  ),
)

const progressLabel = computed(() => {
  if (!session.value) return ''
  return `File ${session.value.index + 1} of ${session.value.items.length}`
})

/** Hold on to the drill's closing numbers after the engine drops the session. */
const summary = ref<{ correct: number; wrong: number } | null>(null)
watch(
  () => game.lastEvents,
  (events: GameEvent[]) => {
    for (const event of events) {
      if (event.type === 'review_complete') {
        summary.value = { correct: event.correct, wrong: event.wrong }
      }
      if (event.type === 'review_start') summary.value = null
    }
  },
)

onMounted(async () => {
  await game.resumeReview()
  loading.value = false
})
</script>

<template>
  <div v-if="loading" class="card p-6 text-sm text-ink-500">Opening the runbook...</div>

  <div v-else-if="session && run" class="space-y-4">
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p class="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
          {{ session.mode === 'act' ? 'On-call rotation' : 'Follow-ups' }}
        </p>
        <h1 class="text-lg font-semibold tracking-tight sm:text-xl">Runbook drill</h1>
      </div>
      <span class="text-xs text-ink-500 dark:text-ink-400">{{ progressLabel }}</span>
    </header>

    <section class="card min-w-0 p-3 sm:p-5" aria-label="Drill">
      <NarrativeFeed :entries="run.log" />
    </section>

    <section v-if="!run.resolved && encounter" class="min-w-0 space-y-3">
      <IncidentPanel
        v-if="encounter.type === 'troubleshoot'"
        :encounter="encounter"
        :run="run"
        @investigate="(id) => game.dispatch({ type: 'investigate', id })"
        @command="(id) => game.dispatch({ type: 'command', id })"
        @choose="(id) => game.dispatch({ type: 'choose', option_id: id })"
      />
      <div v-else class="card p-3 sm:p-4">
        <ChoiceList
          :options="encounter.options"
          :eliminated="run.eliminated"
          :disabled="run.resolved"
          :prompt="encounter.type === 'design' ? encounter.prompt : encounter.question"
          @choose="(id) => game.dispatch({ type: 'choose', option_id: id })"
        />
      </div>
    </section>

    <section v-else-if="run.resolved" class="flex flex-wrap gap-2">
      <button class="btn-primary" type="button" @click="game.dispatch({ type: 'advance' })">
        Next file
      </button>
      <button class="btn-quiet" type="button" @click="game.dispatch({ type: 'abandon' })">
        Put the runbook down
      </button>
    </section>
  </div>

  <div v-else class="space-y-6">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">Review</h1>
      <p class="text-sm text-ink-600 dark:text-ink-300">
        Closed tickets do not stay learned on their own. The runbook keeps a follow-up date for
        every objective you have cleared: recall it cleanly and the date moves further out, wobble
        and it comes back tomorrow. Nothing here touches your reputation.
      </p>
    </header>

    <section v-if="summary" class="card border-l-4 p-4 sm:p-5"
      :class="summary.wrong === 0 ? 'border-l-healthy' : 'border-l-degraded'">
      <h2 class="text-base font-semibold">Drill closed</h2>
      <p class="prose-beat mt-1">
        {{
          summary.wrong === 0
            ? 'Everything held. The follow-up dates move out.'
            : `${summary.correct} held, ${summary.wrong} wobbled. What wobbled is due again tomorrow, and the skill tree shows it.`
        }}
      </p>
    </section>

    <section class="card space-y-3 p-4 sm:p-5">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-base font-semibold">Follow-ups</h2>
        <span class="font-mono text-xs text-ink-500 dark:text-ink-400">{{ due.length }} due</span>
      </div>
      <p class="text-sm text-ink-600 dark:text-ink-300">
        {{
          due.length
            ? 'Objectives whose follow-up date has arrived. A drill re-runs closed tickets that cover them.'
            : 'Nothing is due. Clear more encounters, or come back when the dates arrive.'
        }}
      </p>
      <button
        v-if="due.length"
        class="btn-primary"
        type="button"
        :disabled="storyBusy"
        @click="game.dispatch({ type: 'start_review', mode: 'due' })"
      >
        Run the follow-ups
      </button>
      <p v-if="storyBusy" class="text-xs text-ink-500 dark:text-ink-400">
        Finish the ticket in front of you first.
      </p>
    </section>

    <section
      v-for="act in acts"
      :key="act.id"
      class="card space-y-3 p-4 sm:p-5"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-base font-semibold">On-call rotation &middot; Act {{ act.number }}</h2>
        <span class="font-mono text-xs text-ink-500 dark:text-ink-400">{{ act.exam }}</span>
      </div>
      <p class="text-sm text-ink-600 dark:text-ink-300">
        {{
          act.ready
            ? 'One closed file from every chapter, dealt together the way the exam deals them. No telling which domain walks in next.'
            : 'Opens when every core quest in the act is closed.'
        }}
      </p>
      <button
        v-if="act.ready"
        class="btn-primary"
        type="button"
        :disabled="storyBusy"
        @click="game.dispatch({ type: 'start_review', mode: 'act', act: act.id })"
      >
        Take the rotation
      </button>
    </section>
  </div>
</template>
