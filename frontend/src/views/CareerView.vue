<script setup lang="ts">
import { computed } from 'vue'

import QuestCard from '@/components/QuestCard.vue'
import { useContentStore } from '@/stores/content'
import { useGameStore } from '@/stores/game'

const content = useContentStore()
const game = useGameStore()

function chapterDone(chapterId: string): boolean {
  const chapter = content.chapterById(chapterId)
  if (!chapter || !game.save) return false
  return chapter.quests
    .filter((quest) => quest.variant !== 'bonus')
    .every((quest) => game.save!.progress.quests_completed.includes(quest.id))
}

const empty = computed(() => !content.chapters.some((chapter) => chapter.quests.length))

/**
 * Whether to offer to open an act rather than make the player earn it.
 *
 * The two acts are two exams. Somebody who already administers Azure and only
 * wants AZ-305 should not have to play the whole of AZ-104 first, so an act
 * whose first chapter is still shut offers a way in. The offer disappears once
 * the act is reachable, whether it was opened or simply reached.
 */
function firstChapterOf(actId: string): string | undefined {
  return content.acts.find((act) => act.id === actId)?.chapterList[0]?.id
}

function canOpen(actId: string): boolean {
  const first = firstChapterOf(actId)
  if (!first || !game.save) return false
  return !game.chapterOpen(first)
}

function openAct(actId: string): void {
  game.dispatch({ type: 'open_act', act: actId })
}
</script>

<template>
  <div class="space-y-10">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">The queue</h1>
      <p class="text-sm text-ink-600 dark:text-ink-300">
        Two acts. Act 1 is the administrator's job, Act 2 is the architect's. Both are free.
      </p>
    </header>

    <p v-if="empty" class="card p-4 text-sm">
      No chapters have been authored into this build yet.
    </p>

    <section v-for="act in content.acts" :key="act.id" class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-3 border-l-4 border-signal-600 pl-3">
        <div>
          <h2 class="text-lg font-semibold tracking-tight">
            Act {{ act.number }} &middot; {{ act.title }}
          </h2>
          <p class="text-sm text-ink-500 dark:text-ink-400">{{ act.tagline }} ({{ act.exam }})</p>
        </div>
        <button
          v-if="canOpen(act.id)"
          class="btn-quiet shrink-0"
          type="button"
          @click="openAct(act.id)"
        >
          Start here instead
        </button>
      </div>
      <p v-if="canOpen(act.id)" class="max-w-2xl pl-3 text-sm text-ink-500 dark:text-ink-400">
        {{ act.exam }} is a separate exam. Start here and its chapters open from the first one;
        Act {{ act.number - 1 }} stays exactly where you left it.
      </p>

      <section
        v-for="chapter in act.chapterList"
        :key="chapter.id"
        class="space-y-3"
        :id="chapter.id"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-base font-semibold">
            {{ chapter.order }}. {{ chapter.title }}
            <span v-if="chapterDone(chapter.id)" class="ml-2 text-xs font-normal text-healthy">
              complete
            </span>
          </h3>
          <p class="text-xs text-ink-500 dark:text-ink-400">
            {{ content.rankTitle(chapter.rank) }}
          </p>
        </div>
        <p class="max-w-2xl text-sm text-ink-600 dark:text-ink-300">{{ chapter.blurb }}</p>
        <ul v-if="chapter.quests.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuestCard v-for="quest in chapter.quests" :key="quest.id" :quest="quest" />
        </ul>
        <p v-else class="text-sm text-ink-500 dark:text-ink-400">Not written yet.</p>
      </section>
    </section>
  </div>
</template>
