/**
 * The review queue.
 *
 * Clearing an encounter lights an objective once; keeping it lit is a memory
 * problem, and memory decays on a schedule. Every lit objective carries a due
 * date. When it comes due, a drill re-runs a closed encounter that covers it:
 * a clean recall pushes the date further out, a lapse pulls it back in and
 * takes the objective's "mastered" standing with it.
 *
 * Everything here is a pure read: selection returns encounter references, and
 * the engine reducer does the mutating.
 */

import { REVIEW_SESSION_CAP } from './rules'
import type { ContentIndex, QuestSummary, SaveState } from './types'

export interface EncounterRef {
  quest_id: string
  encounter_id: string
}

function summaries(index: ContentIndex): QuestSummary[] {
  return index.chapters.flatMap((chapter) => chapter.quests)
}

/** Every cleared encounter that covers each objective, in content order. */
export function coverage(index: ContentIndex, state: SaveState): Map<string, EncounterRef[]> {
  const cleared = new Set(state.progress.encounters_cleared)
  const map = new Map<string, EncounterRef[]>()
  for (const quest of summaries(index)) {
    for (const encounter of quest.encounters ?? []) {
      if (!cleared.has(`${quest.id}/${encounter.id}`)) continue
      for (const objective of encounter.objectives) {
        const refs = map.get(objective) ?? []
        refs.push({ quest_id: quest.id, encounter_id: encounter.id })
        map.set(objective, refs)
      }
    }
  }
  return map
}

/** Objectives whose review date has passed, most overdue first. */
export function dueObjectives(index: ContentIndex, state: SaveState, now: string): string[] {
  const covered = coverage(index, state)
  return Object.entries(state.review)
    .filter(([id, item]) => item.due <= now && covered.has(id))
    .sort((a, b) => a[1].due.localeCompare(b[1].due))
    .map(([id]) => id)
}

/**
 * Pick the encounters for a due-queue drill: walk the overdue objectives and
 * take one covering encounter each, skipping objectives an already-picked
 * encounter happens to cover too. The pick rotates with the objective's
 * interval so a long-lived objective is not drilled on the same scene forever.
 */
export function selectDueDrill(index: ContentIndex, state: SaveState, now: string): EncounterRef[] {
  const covered = coverage(index, state)
  const picked: EncounterRef[] = []
  const handled = new Set<string>()
  const used = new Set<string>()
  for (const objective of dueObjectives(index, state, now)) {
    if (picked.length >= REVIEW_SESSION_CAP) break
    if (handled.has(objective)) continue
    const refs = covered.get(objective) ?? []
    if (!refs.length) continue
    const start = (state.review[objective]?.interval ?? 0) % refs.length
    const ref = refs
      .slice(start)
      .concat(refs.slice(0, start))
      .find((candidate) => !used.has(`${candidate.quest_id}/${candidate.encounter_id}`))
    if (!ref) continue
    used.add(`${ref.quest_id}/${ref.encounter_id}`)
    picked.push(ref)
    // Everything the picked encounter covers is now being drilled anyway.
    const quest = summaries(index).find((entry) => entry.id === ref.quest_id)
    const encounter = (quest?.encounters ?? []).find((entry) => entry.id === ref.encounter_id)
    for (const other of encounter?.objectives ?? []) handled.add(other)
  }
  return picked
}

/** Whether every core quest in the act is closed, which is what earns the drill. */
export function actDrillReady(index: ContentIndex, state: SaveState, actId: string): boolean {
  const done = new Set(state.progress.quests_completed)
  const chapters = index.chapters.filter((chapter) => chapter.act === actId)
  if (!chapters.length) return false
  return chapters.every((chapter) =>
    chapter.quests
      .filter((quest) => quest.variant !== 'bonus')
      .every((quest) => done.has(quest.id)),
  )
}

/**
 * An end-of-act drill: one cleared encounter per chapter, so the domains land
 * shuffled together the way the exam deals them. Encounters covering an
 * objective that is not yet mastered go first; the rotation moves with the
 * number of drills run so repeat sittings see different scenes.
 */
export function selectActDrill(index: ContentIndex, state: SaveState, actId: string): EncounterRef[] {
  if (!actDrillReady(index, state, actId)) return []
  const cleared = new Set(state.progress.encounters_cleared)
  const mastered = new Set(state.progress.mastered)
  const picked: EncounterRef[] = []
  for (const chapter of index.chapters.filter((entry) => entry.act === actId)) {
    const candidates: { ref: EncounterRef; shaky: boolean }[] = []
    for (const quest of chapter.quests) {
      for (const encounter of quest.encounters ?? []) {
        if (!cleared.has(`${quest.id}/${encounter.id}`)) continue
        candidates.push({
          ref: { quest_id: quest.id, encounter_id: encounter.id },
          shaky: encounter.objectives.some((objective) => !mastered.has(objective)),
        })
      }
    }
    if (!candidates.length) continue
    const pool = candidates.some((entry) => entry.shaky)
      ? candidates.filter((entry) => entry.shaky)
      : candidates
    picked.push(pool[state.stats.drills % pool.length].ref)
  }
  return picked
}
