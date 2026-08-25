/**
 * Feedback, and the state it came from.
 *
 * A report that says "this makes no sense" is worth very little on its own and
 * a great deal attached to the quest, the encounter, the attempt count and the
 * viewport it was written on. Nobody types that in, so the client collects it.
 *
 * The builder is a pure function over a snapshot so it can be tested without a
 * browser, and so it is obvious from one place exactly what leaves the device.
 */

import type { Encounter, Quest, SaveState } from '@/engine'

export const FEEDBACK_CATEGORIES = [
  { id: 'confusing', label: 'Confusing', hint: 'The scenario or the screen did not make sense.' },
  { id: 'wrong', label: 'Technically wrong', hint: 'The answer or the explanation is not correct.' },
  { id: 'bug', label: 'Broken', hint: 'Something did not work.' },
  { id: 'layout', label: 'Looks wrong', hint: 'It renders badly on this screen.' },
  { id: 'idea', label: 'Suggestion', hint: 'Something that would make this better.' },
  { id: 'praise', label: 'This worked', hint: 'Worth keeping. Genuinely useful to know.' },
] as const

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]['id']

export interface FeedbackSnapshot {
  route: { path: string; name?: string | null }
  save: SaveState | null
  quest: Quest | null
  encounter: Encounter | null | undefined
  contentVersion: string
  theme: string
  signedIn: boolean
  viewport: { width: number; height: number }
}

export type FeedbackContext = Record<string, unknown>

/** Everything the report carries with it. Nothing here identifies a person. */
export function buildFeedbackContext(snapshot: FeedbackSnapshot): FeedbackContext {
  const { save, quest, encounter, route } = snapshot
  const run = save?.active ?? null

  const context: FeedbackContext = {
    route: route.path,
    route_name: route.name ?? '',
    content_version: snapshot.contentVersion,
    theme: snapshot.theme,
    signed_in: snapshot.signedIn,
    viewport: snapshot.viewport,
  }

  if (save) {
    context.save_schema_version = save.schema_version
    context.rep = save.rep
    context.skill_points = save.skill_points
    context.perks = save.perks
    context.progress = {
      quests_completed: save.progress.quests_completed.length,
      objectives_cleared: save.progress.objectives.length,
      pips: save.stats.pips,
      correct: save.stats.correct,
      wrong: save.stats.wrong,
    }
    const nodes = Object.values(save.diagram?.nodes ?? {})
    context.diagram = {
      present: nodes.filter((node) => node.present).length,
      broken: nodes.filter((node) => node.present && node.status === 'broken').length,
    }
  }

  if (quest) {
    context.quest_id = quest.id
    context.quest_title = quest.title
    context.quest_variant = quest.variant ?? 'core'
    context.chapter = quest.chapter
  }

  if (encounter) {
    context.encounter_id = encounter.id
    context.encounter_type = encounter.type
    context.encounter_title = encounter.title
    context.encounter_index = save?.position?.encounter_index ?? null
    context.objectives = encounter.objectives ?? quest?.objectives ?? []
  }

  if (run) {
    context.run = {
      attempts: run.attempts,
      ruled_out: run.eliminated.length,
      revealed: run.revealed.length,
      commands_run: run.ran.length,
      time_left: run.time_left,
      time_budget: run.time_budget,
      resolved: run.resolved,
      outcome: run.outcome,
    }
  }

  return context
}

/** What the player sees when they ask what is being sent. */
export function describeContext(context: FeedbackContext): string {
  return JSON.stringify(context, null, 2)
}
