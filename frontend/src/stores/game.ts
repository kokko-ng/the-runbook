/**
 * The engine-to-UI boundary. This store is the only place `applyAction` is
 * called and the only place saves are written; components dispatch actions and
 * render state plus the feed. No game rules live here.
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { loadQuest, manifest, nextQuest } from '@/content'
import { applyAction, createInitialState, remainingOptions } from '@/engine/engine'
import { REP_BONUS_THRESHOLD } from '@/engine/constants'
import type {
  Encounter,
  EngineAction,
  EngineEvent,
  GameState,
  Quest,
} from '@/engine/types'
import * as localSave from '@/persistence/localSave'
import { recordEvent } from '@/api/analytics'

/** One rendered line in the narrative feed. */
export interface FeedEntry {
  key: number
  event: EngineEvent
}

export const useGameStore = defineStore('game', () => {
  const state = ref<GameState>(createInitialState(manifest))
  const quest = shallowRef<Quest | null>(null)
  const feed = ref<FeedEntry[]>([])
  const loading = ref(false)
  const notice = ref<string | null>(null)
  const started = ref(false)

  let feedKey = 0

  // ------------------------------------------------------------ derived

  const encounter = computed<Encounter | null>(() => {
    if (!quest.value) return null
    return quest.value.encounters.find((item) => item.id === state.value.encounterId) ?? null
  })

  const options = computed(() =>
    encounter.value ? remainingOptions(encounter.value, state.value) : [],
  )

  const eliminated = computed(() => state.value.encounter.eliminatedOptionIds)

  const timeRemaining = computed(() => state.value.encounter.timeRemaining)

  const bonusUnlocked = computed(
    () => state.value.bonusUnlocked || state.value.rep >= REP_BONUS_THRESHOLD,
  )

  const canAdvance = computed(() => state.value.phase === 'resolved')

  const isPip = computed(() => state.value.phase === 'pip')

  const questComplete = computed(() => state.value.phase === 'quest_complete')

  // ------------------------------------------------------------ actions

  function push(events: EngineEvent[]) {
    for (const event of events) {
      // Rejections are guard rails, not story; surface them transiently.
      if (event.type === 'rejected') {
        notice.value = event.reason
        continue
      }
      feed.value.push({ key: feedKey++, event })
    }
  }

  function dispatch(action: EngineAction) {
    if (!quest.value) return
    notice.value = null

    const result = applyAction(state.value, { manifest, quest: quest.value }, action)
    state.value = result.state
    push(result.events)

    for (const event of result.events) {
      if (event.type === 'encounter_cleared') {
        recordEvent({
          type: 'encounter_cleared',
          encounter_id: `${state.value.questId}:${event.encounterId}`,
          outcome: event.firstTry ? 'first_try' : 'recovered',
        })
      }
      if (event.type === 'quest_completed') {
        recordEvent({ type: 'quest_completed', encounter_id: event.questId, outcome: 'complete' })
      }
    }

    // Autosave after every resolution, so a closed tab costs at most one choice.
    save()
  }

  async function startQuest(questId: string) {
    loading.value = true
    notice.value = null
    try {
      quest.value = await loadQuest(questId)
      feed.value = []
      dispatch({ type: 'START_QUEST', questId })
    } catch (error) {
      notice.value = error instanceof Error ? error.message : 'That quest could not be loaded.'
    } finally {
      loading.value = false
    }
  }

  /** Begin a fresh career, discarding any existing save. */
  async function newGame() {
    state.value = createInitialState(manifest)
    feed.value = []
    started.value = true
    const first = manifest.chapters[0]
    const target = first ? nextQuest(first.id, []) : undefined
    if (target) await startQuest(target.id)
  }

  /** Resume from local storage. Returns false when there is nothing to resume. */
  async function resume(): Promise<boolean> {
    const outcome = localSave.read()
    if (outcome.status === 'unreadable') {
      notice.value = outcome.reason
      return false
    }
    if (outcome.status === 'empty') return false

    state.value = outcome.state
    started.value = true
    if (!state.value.questId) return true

    loading.value = true
    try {
      quest.value = await loadQuest(state.value.questId)
      feed.value = []
      // The feed is a transcript of this session, so a resumed game opens on the
      // current encounter rather than replaying everything that led here.
      if (encounter.value) {
        push([
          {
            type: 'encounter_entered',
            encounterId: encounter.value.id,
            encounterType: encounter.value.type,
          },
        ])
      }
      return true
    } catch (error) {
      notice.value = error instanceof Error ? error.message : 'That save could not be restored.'
      return false
    } finally {
      loading.value = false
    }
  }

  /** Advance to the next quest in the chapter, or report the chapter is done. */
  async function continueToNextQuest(): Promise<boolean> {
    const current = quest.value
    if (!current) return false

    const target = nextQuest(current.chapter, state.value.completedQuestIds)
    if (!target) return false

    await startQuest(target.id)
    return true
  }

  function save() {
    localSave.write(state.value, new Date().toISOString())
  }

  function wipe() {
    localSave.clear()
    state.value = createInitialState(manifest)
    quest.value = null
    feed.value = []
    started.value = false
    notice.value = null
  }

  function dismissNotice() {
    notice.value = null
  }

  return {
    state,
    quest,
    feed,
    loading,
    notice,
    started,
    encounter,
    options,
    eliminated,
    timeRemaining,
    bonusUnlocked,
    canAdvance,
    isPip,
    questComplete,
    dispatch,
    startQuest,
    newGame,
    resume,
    continueToNextQuest,
    save,
    wipe,
    dismissNotice,
  }
})
