/**
 * The bridge between the pure engine and everything that is not pure: the
 * browser clock, localStorage, telemetry and the optional server save.
 *
 * No game rule lives here. If you are about to add an `if` about reputation or
 * time budgets, it belongs in the engine.
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import {
  actDrillReady,
  buildTrees,
  chapterUnlocked,
  createSave,
  currentEncounter,
  dueObjectives,
  migrateSave,
  questAvailability,
  readiness,
  reduce,
  type Action,
  type Encounter,
  type GameEvent,
  type Quest,
  type SaveState,
} from '@/engine'
import { track } from '@/lib/analytics'
import { clearSave, loadSave, persistSave } from '@/lib/storage'
import { useContentStore } from './content'
import { useUiStore } from './ui'

export const useGameStore = defineStore('game', () => {
  const content = useContentStore()
  const ui = useUiStore()

  // Both hold immutable-by-convention data that the engine replaces wholesale.
  // Shallow refs keep Vue's proxies out of the save, which matters because the
  // engine clones state with structuredClone and proxies do not survive that.
  const save = shallowRef<SaveState | null>(null)
  const activeQuest = shallowRef<Quest | null>(null)
  const storageBlocked = ref(false)
  const lastEvents = ref<GameEvent[]>([])
  const dirty = ref(false)

  function now(): string {
    return new Date().toISOString()
  }

  /** Load the local save, or start a new career. Safe to call repeatedly. */
  async function boot(): Promise<void> {
    const index = await content.load()
    if (!index) return
    if (save.value) return
    const stored = loadSave()
    save.value = stored ? migrateSave(stored, index, now()) : createSave(index, now())
    // A run in flight names its own quest; a drill's may differ from position.
    const standing = save.value.active?.quest_id ?? save.value.position?.quest_id
    if (standing) {
      activeQuest.value = await content.loadQuest(standing)
    }
  }

  function persist(): void {
    if (!save.value) return
    const ok = persistSave(save.value)
    storageBlocked.value = !ok
    dirty.value = true
  }

  function restart(): void {
    if (!content.index) return
    save.value = createSave(content.index, now())
    activeQuest.value = null
    clearSave()
    persist()
  }

  function adopt(incoming: SaveState): void {
    if (!content.index) return
    save.value = migrateSave(incoming, content.index, now())
    persist()
  }

  function dispatch(action: Action): void {
    if (!save.value || !content.index) return
    const result = reduce(save.value, action, {
      index: content.index,
      quest: activeQuest.value,
      now: now(),
    })
    save.value = result.state
    lastEvents.value = result.events
    for (const event of result.events) announce(event)
    persist()
  }

  function announce(event: GameEvent): void {
    switch (event.type) {
      case 'rejected':
        ui.toast(event.reason, 'bad')
        break
      case 'pip':
        ui.toast('Dana puts you on a performance improvement plan.', 'bad')
        track('pip', { quest_id: event.quest_id })
        break
      case 'quest_start':
        track('quest_start', { quest_id: event.quest_id })
        break
      case 'quest_complete':
        ui.toast('Ticket closed.', 'good')
        track('quest_complete', { quest_id: event.quest_id })
        break
      case 'encounter_resolve':
        track('encounter_resolve', {
          quest_id: event.quest_id,
          encounter_id: event.encounter_id,
          outcome: event.outcome,
        })
        break
      case 'choice':
        track('choice', {
          quest_id: event.quest_id,
          encounter_id: event.encounter_id,
          outcome: event.correct ? 'correct' : 'wrong',
          meta: { option_id: event.option_id },
        })
        break
      case 'perk_buy':
        track('perk_buy', { outcome: event.perk })
        break
      case 'act_opened':
        ui.toast('Act 2 is open. The AZ-305 chapters start from the first one.', 'good')
        track('act_opened', { outcome: event.act_id })
        break
      case 'objectives':
        ui.toast(
          event.ids.length === 1
            ? 'Skill tree updated: 1 objective cleared.'
            : `Skill tree updated: ${event.ids.length} objectives cleared.`,
          'good',
        )
        break
      case 'mastered':
        ui.toast(
          event.ids.length === 1
            ? 'Skill tree updated: 1 objective marked solid.'
            : `Skill tree updated: ${event.ids.length} objectives marked solid.`,
          'good',
        )
        break
      case 'post_mortem':
        track('post_mortem', {
          quest_id: event.quest_id,
          encounter_id: event.encounter_id,
          outcome: event.correct ? 'correct' : 'wrong',
        })
        break
      case 'review_start':
        track('review_start', { outcome: event.mode })
        void continueReview(event.quest_id)
        break
      case 'review_advance':
        void continueReview(event.quest_id)
        break
      case 'review_complete':
        ui.toast(
          event.wrong === 0
            ? 'Drill closed: everything held.'
            : `Drill closed: ${event.correct} held, ${event.wrong} wobbled.`,
          event.wrong === 0 ? 'good' : 'bad',
        )
        track('review_complete', {
          outcome: event.mode,
          meta: { correct: event.correct, wrong: event.wrong },
        })
        break
      default:
        break
    }
  }

  /** Drills hop between quests; load the next file and open its encounter. */
  async function continueReview(questId: string): Promise<void> {
    const quest = await content.loadQuest(questId)
    if (!quest) return
    activeQuest.value = quest
    dispatch({ type: 'review_next' })
  }

  /**
   * Reopen a drill that was mid-flight when the page reloaded: the session
   * remembers where it stood, the run just needs its quest back in memory.
   */
  async function resumeReview(): Promise<void> {
    await boot()
    if (!save.value?.review_session) return
    if (save.value.active) return
    const item = save.value.review_session.items[save.value.review_session.index]
    if (item) await continueReview(item.quest_id)
  }

  /** Objectives due for a drill right now. Recomputed on every call. */
  function reviewDue(): string[] {
    if (!save.value || !content.index) return []
    return dueObjectives(content.index, save.value, now())
  }

  /** Acts whose on-call rotation drill is open. */
  function drillReady(actId: string): boolean {
    if (!save.value || !content.index) return false
    return actDrillReady(content.index, save.value, actId)
  }

  async function startQuest(questId: string): Promise<boolean> {
    await boot()
    const quest = await content.loadQuest(questId)
    if (!quest) return false
    activeQuest.value = quest
    dispatch({ type: 'start_quest', quest_id: questId })
    return Boolean(save.value?.active)
  }

  /** Reopen a quest the player is already standing in, after a reload. */
  async function resume(questId: string): Promise<Quest | null> {
    await boot()
    const quest = await content.loadQuest(questId)
    activeQuest.value = quest
    return quest
  }

  const encounter = computed<Encounter | undefined>(() =>
    save.value && activeQuest.value ? currentEncounter(activeQuest.value, save.value) : undefined,
  )

  const run = computed(() => save.value?.active ?? null)

  const trees = computed(() =>
    save.value && content.index ? buildTrees(content.index, save.value) : [],
  )

  const examReadiness = computed(() =>
    save.value && content.index
      ? readiness(content.index, save.value)
      : { covered: 0, mastered: 0, total: 0, percent: 0, solid_percent: 0, byExam: [] },
  )

  const rank = computed(() => {
    if (!save.value || !content.index) return ''
    const chapters = [...content.index.chapters].sort((a, b) => a.order - b.order)
    const done = new Set(save.value.progress.quests_completed)
    let current = chapters[0]
    for (const chapter of chapters) {
      const core = chapter.quests.filter((quest) => quest.variant !== 'bonus')
      if (core.some((quest) => !done.has(quest.id))) {
        current = chapter
        break
      }
      current = chapter
    }
    return content.rankTitle(current?.rank ?? '')
  })

  function availability(questId: string) {
    if (!save.value || !content.index) return { unlocked: false, reason: 'Loading.' }
    return questAvailability(save.value, content.index, questId)
  }

  /** Whether a chapter can be entered at all, ignoring quest order inside it. */
  function chapterOpen(chapterId: string): boolean {
    if (!save.value || !content.index) return false
    return chapterUnlocked(save.value, content.index, chapterId)
  }

  const hasProgress = computed(
    () =>
      Boolean(save.value) &&
      (save.value!.progress.quests_completed.length > 0 || save.value!.position !== null),
  )

  return {
    save,
    activeQuest,
    encounter,
    run,
    trees,
    examReadiness,
    rank,
    storageBlocked,
    lastEvents,
    dirty,
    hasProgress,
    boot,
    chapterOpen,
    dispatch,
    startQuest,
    resume,
    resumeReview,
    reviewDue,
    drillReady,
    restart,
    adopt,
    persist,
    availability,
  }
})
