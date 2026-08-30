/**
 * The game engine.
 *
 * A pure state machine: (save state, content, action) in, (new state, events)
 * out. No Vue, no storage, no clock of its own -- the caller supplies `now`.
 * Every rule about reputation, time budgets, skill points and progression lives
 * here so that the components stay dumb and the whole thing stays testable.
 */

import { applyOps, initialDiagram } from './diagram'
import { selectActDrill, selectDueDrill } from './review'
import {
  DEFAULT_COMMAND_TIME_COST,
  PERKS,
  REP_AFTER_PIP,
  REP_FIRST_TRY_BONUS,
  REP_START,
  REP_UNDER_BUDGET_BONUS,
  REVIEW_FIRST_TRY_POINT,
  REVIEW_INTERVALS_DAYS,
  WRONG_FIX_TIME_COST,
  applyShield,
  clampRep,
  clawback,
  nextDue,
} from './rules'
import {
  SAVE_SCHEMA_VERSION,
  type Action,
  type Chapter,
  type ContentIndex,
  type Encounter,
  type EncounterRun,
  type EngineResult,
  type GameEvent,
  type LogEntryInput,
  type Option,
  type PerkId,
  type Quest,
  type QuestSummary,
  type SaveState,
} from './types'

export interface EngineContext {
  index: ContentIndex
  /** The quest the action applies to. Required for anything mid-quest. */
  quest?: Quest | null
  now: string
}

// --------------------------------------------------------------------------
// construction
// --------------------------------------------------------------------------

export function createSave(index: ContentIndex, now: string): SaveState {
  return {
    schema_version: SAVE_SCHEMA_VERSION,
    content_version: index.version,
    created_at: now,
    updated_at: now,
    rep: REP_START,
    skill_points: 0,
    perks: { hint: 0, overtime: 0, rep_shield: 0 },
    perks_bought: { hint: 0, overtime: 0, rep_shield: 0 },
    position: null,
    active: null,
    diagram: initialDiagram(index.diagrams),
    progress: {
      quests_completed: [],
      encounters_cleared: [],
      first_try: [],
      objectives: [],
      mastered: [],
      chapter_checkpoints: {},
      acts_opened: [],
    },
    review: {},
    review_session: null,
    history: [],
    stats: { pips: 0, correct: 0, wrong: 0, quests: 0, drills: 0 },
  }
}

/** The objectives each cleared encounter covers, looked up from the index alone. */
function summaryObjectives(index: ContentIndex, ref: string): string[] {
  const [questId, encounterId] = ref.split('/')
  for (const chapter of index.chapters) {
    const quest = chapter.quests.find((entry) => entry.id === questId)
    if (!quest) continue
    const encounter = (quest.encounters ?? []).find((entry) => entry.id === encounterId)
    return encounter?.objectives ?? quest.objectives
  }
  return []
}

/**
 * Bring a save forward to the current shapes.
 *
 * Old saves are the player's property: never throw one away, fill in what is
 * missing and carry on. New content nodes are folded in without disturbing the
 * status of anything the player has already touched.
 */
export function migrateSave(save: SaveState, index: ContentIndex, now: string): SaveState {
  const base = createSave(index, now)
  const merged: SaveState = {
    ...base,
    ...save,
    schema_version: SAVE_SCHEMA_VERSION,
    content_version: index.version,
    perks: { ...base.perks, ...(save.perks ?? {}) },
    perks_bought: { ...base.perks_bought, ...(save.perks_bought ?? {}) },
    progress: { ...base.progress, ...(save.progress ?? {}) },
    review: save.review ?? {},
    review_session: save.review_session ?? null,
    stats: { ...base.stats, ...(save.stats ?? {}) },
    diagram: {
      nodes: { ...base.diagram.nodes, ...(save.diagram?.nodes ?? {}) },
      edges: { ...base.diagram.edges, ...(save.diagram?.edges ?? {}) },
    },
  }

  // A save from before mastery was tracked has earned it retroactively: an
  // objective is solid if some first-try clear covered it.
  if (!save.progress?.mastered) {
    const lit = new Set(merged.progress.objectives)
    const solid = new Set<string>()
    for (const ref of merged.progress.first_try) {
      for (const objective of summaryObjectives(index, ref)) {
        if (lit.has(objective)) solid.add(objective)
      }
    }
    merged.progress.mastered = [...solid]
  }

  // Everything already lit joins the review ladder: solid objectives get the
  // longer first rest, shaky ones come due tomorrow.
  const mastered = new Set(merged.progress.mastered)
  for (const objective of merged.progress.objectives) {
    if (merged.review[objective]) continue
    const interval = mastered.has(objective) ? 1 : 0
    merged.review[objective] = { interval, due: nextDue(now, interval), last: now }
  }

  // A run captured mid-encounter on an older build resumes with the new
  // run-level fields defaulted rather than undefined.
  if (merged.active) {
    merged.active = {
      ...merged.active,
      review: merged.active.review ?? false,
      hint_used: merged.active.hint_used ?? false,
      post_mortem: merged.active.post_mortem ?? null,
    }
  }
  return merged
}

// --------------------------------------------------------------------------
// content lookups
// --------------------------------------------------------------------------

export function chapterOf(index: ContentIndex, questId: string): Chapter | undefined {
  return index.chapters.find((chapter) => chapter.quests.some((quest) => quest.id === questId))
}

export function questSummary(index: ContentIndex, questId: string): QuestSummary | undefined {
  for (const chapter of index.chapters) {
    const found = chapter.quests.find((quest) => quest.id === questId)
    if (found) return found
  }
  return undefined
}

function coreQuests(chapter: Chapter): QuestSummary[] {
  return chapter.quests.filter((quest) => quest.variant !== 'bonus')
}

export function chapterUnlocked(state: SaveState, index: ContentIndex, chapterId: string): boolean {
  const ordered = [...index.chapters].sort((a, b) => a.order - b.order)
  const position = ordered.findIndex((chapter) => chapter.id === chapterId)
  if (position <= 0) return true
  const chapter = ordered[position]
  // Normally every chapter ahead of this one has to be clear. An act the player
  // opened directly is exempt from the acts before it: inside that act the
  // chapters still run in order, so the AZ-305 material opens at its first
  // chapter rather than all at once.
  const opened = state.progress.acts_opened ?? []
  const earlier = ordered.slice(0, position)
  const required = opened.includes(chapter.act)
    ? earlier.filter((entry) => entry.act === chapter.act)
    : earlier
  return required.every((entry) =>
    coreQuests(entry).every((quest) => state.progress.quests_completed.includes(quest.id)),
  )
}

export interface Availability {
  unlocked: boolean
  reason?: string
}

export function questAvailability(
  state: SaveState,
  index: ContentIndex,
  questId: string,
): Availability {
  const chapter = chapterOf(index, questId)
  const quest = questSummary(index, questId)
  if (!chapter || !quest) return { unlocked: false, reason: 'That quest is not in this build.' }
  if (!chapterUnlocked(state, index, chapter.id)) {
    return { unlocked: false, reason: 'Finish the previous chapter first.' }
  }
  // Exam-hard variants are practice, and practice belongs to whoever wants it:
  // clearing the original ticket is the only key. Gating them on a high
  // reputation kept the extra reps away from exactly the players who needed
  // them most.
  if (quest.variant === 'bonus') {
    if (quest.bonus_of && !state.progress.quests_completed.includes(quest.bonus_of)) {
      return { unlocked: false, reason: 'Clear the original ticket before the hard variant.' }
    }
    return { unlocked: true }
  }
  const core = coreQuests(chapter)
  const position = core.findIndex((entry) => entry.id === questId)
  const blocking = core.slice(0, position).find(
    (entry) => !state.progress.quests_completed.includes(entry.id),
  )
  if (blocking) return { unlocked: false, reason: `"${blocking.title}" comes first.` }
  return { unlocked: true }
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function optionsOf(encounter: Encounter): Option[] {
  return encounter.type === 'troubleshoot' ? encounter.fixes : encounter.options
}

function encounterObjectives(encounter: Encounter, quest: Quest): string[] {
  return encounter.objectives?.length ? encounter.objectives : quest.objectives
}

function push(run: EncounterRun, entry: LogEntryInput): void {
  run.seq += 1
  run.log.push({ ...entry, seq: run.seq })
}

function beginRun(encounter: Encounter, quest: Quest, index: number, review = false): EncounterRun {
  const budget = encounter.type === 'troubleshoot' ? encounter.time_budget : 0
  const run: EncounterRun = {
    quest_id: quest.id,
    encounter_id: encounter.id,
    type: encounter.type,
    index,
    attempts: 0,
    eliminated: [],
    revealed: [],
    ran: [],
    time_left: budget,
    time_budget: budget,
    shield: false,
    resolved: false,
    outcome: null,
    review,
    hint_used: false,
    post_mortem: null,
    log: [],
    seq: 0,
  }
  if (review) {
    push(run, {
      kind: 'system',
      text: `Runbook drill: you pull the closed file on "${quest.title}" and walk it again.`,
    })
  }
  if (encounter.type === 'troubleshoot') {
    push(run, { kind: 'ticket', ticket: encounter.ticket })
  }
  push(run, {
    kind: 'intro',
    title: encounter.title,
    text: encounter.intro,
    ...(encounter.speaker ? { speaker: encounter.speaker } : {}),
  })
  if (encounter.sketch) push(run, { kind: 'sketch', sketch: encounter.sketch })
  return run
}

function copy<T>(value: T): T {
  return structuredClone(value)
}

function reject(state: SaveState, reason: string): EngineResult {
  return { state, events: [{ type: 'rejected', reason }] }
}

export function currentEncounter(quest: Quest, state: SaveState): Encounter | undefined {
  // The active run knows exactly which encounter it is. Review drills rely on
  // this: they run encounters from anywhere without moving the story position.
  if (state.active && state.active.quest_id === quest.id) {
    const active = state.active
    return quest.encounters.find((entry) => entry.id === active.encounter_id)
  }
  if (!state.position) return undefined
  return quest.encounters[state.position.encounter_index]
}

/**
 * The quest an in-run action applies to, or null when the caller's quest is
 * not the one the run belongs to. A drill can hold a run from any quest, so
 * every mid-run handler checks its context against the run rather than trust
 * the view that dispatched it.
 */
function runQuest(state: SaveState, ctx: EngineContext): Quest | null {
  const quest = ctx.quest
  if (!quest || !state.active || state.active.quest_id !== quest.id) return null
  return quest
}

// --------------------------------------------------------------------------
// the review ladder
// --------------------------------------------------------------------------

function seedReview(save: SaveState, objective: string, firstTry: boolean, now: string): void {
  if (save.review[objective]) {
    // Already on the ladder; a clean retrieval moves it up a rung.
    if (firstTry) bumpReview(save, objective, now)
    return
  }
  const interval = firstTry ? 1 : 0
  save.review[objective] = { interval, due: nextDue(now, interval), last: now }
}

function bumpReview(save: SaveState, objective: string, now: string): void {
  const current = save.review[objective]
  if (current && now < current.due) {
    // Recall before the date proves nothing about the longer gap: retrieving
    // something three times in one sitting is still massed practice. The
    // ladder holds and the date stands.
    save.review[objective] = { ...current, last: now }
    return
  }
  const interval = Math.min((current?.interval ?? 0) + 1, REVIEW_INTERVALS_DAYS.length - 1)
  save.review[objective] = { interval, due: nextDue(now, interval), last: now }
}

function lapseReview(save: SaveState, objective: string, now: string): void {
  if (!save.review[objective]) return
  save.review[objective] = { interval: 0, due: nextDue(now, 0), last: now }
}

/** Take shaken objectives out of mastered; returns the ones that fell. */
function demote(save: SaveState, objectives: string[]): string[] {
  const lapsed = objectives.filter((objective) => save.progress.mastered.includes(objective))
  if (lapsed.length) {
    save.progress.mastered = save.progress.mastered.filter(
      (objective) => !lapsed.includes(objective),
    )
  }
  return lapsed
}

// --------------------------------------------------------------------------
// the reducer
// --------------------------------------------------------------------------

export function reduce(state: SaveState, action: Action, ctx: EngineContext): EngineResult {
  switch (action.type) {
    case 'start_quest':
      return startQuest(state, action.quest_id, ctx)
    case 'investigate':
      return investigate(state, action.id, ctx)
    case 'command':
      return runCommand(state, action.id, ctx)
    case 'choose':
      return choose(state, action.option_id, ctx)
    case 'post_mortem':
      return answerPostMortem(state, action.option_id, ctx)
    case 'advance':
      return advance(state, ctx)
    case 'abandon':
      return abandon(state, ctx)
    case 'buy_perk':
      return buyPerk(state, action.perk, ctx)
    case 'use_perk':
      return usePerk(state, action.perk, ctx)
    case 'restart_checkpoint':
      return restartCheckpoint(state, ctx)
    case 'open_act':
      return openAct(state, action.act, ctx)
    case 'start_review':
      return startReview(state, action, ctx)
    case 'review_next':
      return reviewNext(state, ctx)
  }
}

/**
 * Start at an act instead of arriving at it.
 *
 * The two acts are two exams, and somebody sitting AZ-305 should not have to
 * play all of AZ-104 to reach it. Opening an act only lifts the gate between
 * acts: the chapters inside it still unlock one after another, and nothing
 * already completed is touched.
 */
function openAct(state: SaveState, actId: string, ctx: EngineContext): EngineResult {
  const act = ctx.index.acts.find((entry) => entry.id === actId)
  if (!act) return reject(state, 'That act is not in this build.')
  if ((state.progress.acts_opened ?? []).includes(actId)) {
    return reject(state, 'That act is already open.')
  }
  const next = copy(state)
  next.progress.acts_opened = [...(next.progress.acts_opened ?? []), actId]
  next.updated_at = ctx.now
  return { state: next, events: [{ type: 'act_opened', act_id: actId }] }
}

function startQuest(state: SaveState, questId: string, ctx: EngineContext): EngineResult {
  const quest = ctx.quest
  if (!quest || quest.id !== questId) return reject(state, 'That quest has not loaded yet.')
  const availability = questAvailability(state, ctx.index, questId)
  if (!availability.unlocked) return reject(state, availability.reason ?? 'Locked.')

  const next = copy(state)
  // Walking back to the queue closes any drill that was open. Nothing is lost:
  // objectives still due stay due.
  next.review_session = null
  next.position = { chapter_id: quest.chapter, quest_id: quest.id, encounter_index: 0 }
  // The checkpoint is the quest boundary you are standing on: a performance
  // improvement plan rewinds the chapter to here, never further back.
  next.progress.chapter_checkpoints[quest.chapter] = quest.id
  const encounter = quest.encounters[0]
  next.active = beginRun(encounter, quest, 0)
  next.diagram = applyOps(next.diagram, encounter.on_enter)
  next.updated_at = ctx.now
  return { state: next, events: [{ type: 'quest_start', quest_id: quest.id }] }
}

function investigate(state: SaveState, id: string, ctx: EngineContext): EngineResult {
  const quest = runQuest(state, ctx)
  if (!quest || !state.active || state.active.resolved) return reject(state, 'Nothing to investigate.')
  const encounter = currentEncounter(quest, state)
  if (!encounter || encounter.type !== 'troubleshoot') return reject(state, 'Not an incident.')
  const step = encounter.investigate.find((entry) => entry.id === id)
  if (!step) return reject(state, 'Unknown line of questioning.')
  if (state.active.revealed.includes(id)) return reject(state, 'You already asked that.')

  const next = copy(state)
  const run = next.active as EncounterRun
  run.revealed.push(id)
  const cost = step.time_cost ?? 0
  run.time_left -= cost
  push(run, {
    kind: 'reveal',
    id: step.id,
    action: step.action,
    reveals: step.reveals,
    ...(step.speaker ? { speaker: step.speaker } : {}),
  })
  next.updated_at = ctx.now
  return { state: next, events: [] }
}

function runCommand(state: SaveState, id: string, ctx: EngineContext): EngineResult {
  const quest = runQuest(state, ctx)
  if (!quest || !state.active || state.active.resolved) return reject(state, 'No console open.')
  const encounter = currentEncounter(quest, state)
  if (!encounter || encounter.type !== 'troubleshoot') return reject(state, 'Not an incident.')
  const command = encounter.commands.find((entry) => entry.id === id)
  if (!command) return reject(state, 'Unknown command.')
  if (state.active.ran.includes(id)) return reject(state, 'You already ran that.')
  const cost = command.time_cost ?? DEFAULT_COMMAND_TIME_COST
  if (state.active.time_left < cost) {
    return reject(state, 'Out of time. Call it and pick a fix.')
  }

  const next = copy(state)
  const run = next.active as EncounterRun
  run.ran.push(id)
  run.time_left -= cost
  push(run, {
    kind: 'command',
    id: command.id,
    cmd: command.cmd,
    output: command.output,
    cost,
    ...(command.note ? { note: command.note } : {}),
  })
  next.updated_at = ctx.now
  return { state: next, events: [] }
}

function choose(state: SaveState, optionId: string, ctx: EngineContext): EngineResult {
  const quest = runQuest(state, ctx)
  if (!quest || !state.active || state.active.resolved) return reject(state, 'Nothing to answer.')
  if (state.active.post_mortem?.pending) {
    return reject(state, 'Walk the post-mortem first, then have another go.')
  }
  const encounter = currentEncounter(quest, state)
  if (!encounter) return reject(state, 'Nothing to answer.')
  const option = optionsOf(encounter).find((entry) => entry.id === optionId)
  if (!option) return reject(state, 'Unknown option.')
  if (state.active.eliminated.includes(optionId)) return reject(state, 'That one is already out.')

  const next = copy(state)
  const run = next.active as EncounterRun
  const events: GameEvent[] = []
  const review = run.review
  const replay = !review && next.progress.quests_completed.includes(quest.id)
  const firstTry = run.attempts === 0
  const objectives = encounterObjectives(encounter, quest)

  run.attempts += 1
  push(run, { kind: 'choice', option_id: option.id, label: option.label, correct: option.correct })
  events.push({
    type: 'choice',
    quest_id: quest.id,
    encounter_id: encounter.id,
    option_id: option.id,
    correct: option.correct,
  })

  if (option.correct) {
    const underBudget = encounter.type === 'troubleshoot' && run.time_left > 0
    let delta = option.rep
    if (firstTry) delta += REP_FIRST_TRY_BONUS
    if (underBudget) delta += REP_UNDER_BUDGET_BONUS
    // Drills and replays are practice: the story already paid out once.
    if (replay || review) delta = 0

    next.rep = clampRep(next.rep + delta)
    next.stats.correct += 1
    run.resolved = true
    run.outcome = firstTry ? 'first_try' : 'recovered'
    // A drill replays a closed ticket; the estate does not change twice.
    if (!review) next.diagram = applyOps(next.diagram, option.diagram)

    push(run, {
      kind: 'feedback',
      correct: true,
      explain: option.explain,
      rep_delta: delta,
      ...(option.consequence ? { consequence: option.consequence } : {}),
    })
    if (encounter.resolution) push(run, { kind: 'resolution', text: encounter.resolution })
    // What the senior would have run, laid next to what the player did run.
    if (encounter.type === 'troubleshoot' && encounter.post_incident) {
      push(run, {
        kind: 'post_incident',
        text: encounter.post_incident.text,
        steps: encounter.post_incident.path.flatMap((id) => {
          const command = encounter.commands.find((entry) => entry.id === id)
          if (!command) return []
          return [
            {
              cmd: command.cmd,
              ...(command.label ? { label: command.label } : {}),
              ran: run.ran.includes(id),
            },
          ]
        }),
      })
    }

    if (review) {
      const session = next.review_session
      if (session) {
        if (firstTry) session.correct += 1
        else session.wrong += 1
      }
      if (firstTry) {
        // A clean recall: the ladder stretches, the objective firms up.
        next.skill_points += REVIEW_FIRST_TRY_POINT
        const promoted = objectives.filter(
          (objective) =>
            next.progress.objectives.includes(objective) &&
            !next.progress.mastered.includes(objective),
        )
        next.progress.mastered.push(...promoted)
        if (promoted.length) events.push({ type: 'mastered', ids: promoted })
        for (const objective of objectives) bumpReview(next, objective, ctx.now)
      }
      // A recovered drill already took its lapse on the wrong pick.
    } else if (!replay) {
      const earned = (firstTry ? 1 : 0) + (underBudget ? 1 : 0)
      next.skill_points += earned
      const ref = `${quest.id}/${encounter.id}`
      if (!next.progress.encounters_cleared.includes(ref)) next.progress.encounters_cleared.push(ref)
      if (firstTry && !next.progress.first_try.includes(ref)) next.progress.first_try.push(ref)
      const lit = objectives.filter((objective) => !next.progress.objectives.includes(objective))
      next.progress.objectives.push(...lit)
      if (lit.length) events.push({ type: 'objectives', ids: lit })
      if (firstTry) {
        const promoted = objectives.filter(
          (objective) => !next.progress.mastered.includes(objective),
        )
        next.progress.mastered.push(...promoted)
        // Freshly lit objectives are announced once, as objectives. Only an
        // already-covered one earning its way up is worth a second word.
        const relit = promoted.filter((objective) => !lit.includes(objective))
        if (relit.length) events.push({ type: 'mastered', ids: relit })
      }
      for (const objective of objectives) seedReview(next, objective, firstTry, ctx.now)
    }
    events.push({
      type: 'encounter_resolve',
      quest_id: quest.id,
      encounter_id: encounter.id,
      outcome: run.outcome,
    })
  } else {
    const delta = replay || review ? 0 : applyShield(option.rep, run.shield)
    if (run.shield) run.shield = false
    next.rep = clampRep(next.rep + delta)
    next.stats.wrong += 1
    run.eliminated.push(option.id)
    if (encounter.type === 'troubleshoot') {
      run.time_left = Math.max(0, run.time_left - WRONG_FIX_TIME_COST)
    }
    if (!review) next.diagram = applyOps(next.diagram, option.diagram)
    push(run, {
      kind: 'feedback',
      correct: false,
      explain: option.explain,
      rep_delta: delta,
      ...(option.consequence ? { consequence: option.consequence } : {}),
    })

    if (!replay) {
      // Wrong on a covering encounter is evidence, wherever it happens: an
      // objective that was mastered is not any more, and its review date
      // pulls back in.
      demote(next, objectives)
      for (const objective of objectives) lapseReview(next, objective, ctx.now)
    }
    // The first wrong turn in the story opens a post-mortem: say what actually
    // went wrong before going again, and earn back some standing.
    if (!replay && !review && firstTry && encounter.post_mortem && !run.post_mortem) {
      run.post_mortem = { pending: true, loss: delta }
      push(run, {
        kind: 'post_mortem_ask',
        question: encounter.post_mortem.question,
        ...(encounter.post_mortem.speaker ?? encounter.speaker
          ? { speaker: encounter.post_mortem.speaker ?? encounter.speaker }
          : {}),
      })
    }
  }

  next.history.push({
    at: ctx.now,
    quest_id: quest.id,
    encounter_id: encounter.id,
    option_id: option.id,
    correct: option.correct,
    rep_after: next.rep,
  })
  if (next.history.length > 500) next.history.splice(0, next.history.length - 500)
  next.updated_at = ctx.now

  if (next.rep <= 0) {
    return pip(next, ctx, events)
  }
  return { state: next, events }
}

/**
 * The post-mortem answer. Naming the real failure earns back half of what the
 * wrong turn cost; either way the explanation lands and the encounter reopens.
 */
function answerPostMortem(state: SaveState, optionId: string, ctx: EngineContext): EngineResult {
  const quest = runQuest(state, ctx)
  if (!quest || !state.active || state.active.resolved) return reject(state, 'No post-mortem open.')
  if (!state.active.post_mortem?.pending) return reject(state, 'No post-mortem open.')
  const encounter = currentEncounter(quest, state)
  if (!encounter?.post_mortem) return reject(state, 'No post-mortem open.')
  const option = encounter.post_mortem.options.find((entry) => entry.id === optionId)
  if (!option) return reject(state, 'Unknown option.')

  const next = copy(state)
  const run = next.active as EncounterRun
  const pending = run.post_mortem as { pending: boolean; loss: number }
  pending.pending = false
  const restored = option.correct ? clawback(pending.loss) : 0
  next.rep = clampRep(next.rep + restored)
  push(run, {
    kind: 'post_mortem',
    correct: option.correct,
    label: option.label,
    explain: option.explain,
    rep_delta: restored,
  })
  next.updated_at = ctx.now
  return {
    state: next,
    events: [
      {
        type: 'post_mortem',
        quest_id: quest.id,
        encounter_id: encounter.id,
        correct: option.correct,
      },
    ],
  }
}

/**
 * Reputation hit zero. Dana puts you on a performance improvement plan, the
 * chapter rewinds to its checkpoint, and you start again with enough standing
 * to work with.
 */
function pip(state: SaveState, ctx: EngineContext, events: GameEvent[]): EngineResult {
  const next = copy(state)
  const chapterId = next.position?.chapter_id ?? ''
  const checkpoint = next.progress.chapter_checkpoints[chapterId] ?? next.position?.quest_id ?? ''
  next.rep = REP_AFTER_PIP
  next.stats.pips += 1
  next.active = null
  next.position = checkpoint
    ? { chapter_id: chapterId, quest_id: checkpoint, encounter_index: 0 }
    : null
  next.updated_at = ctx.now
  return {
    state: next,
    events: [...events, { type: 'pip', chapter_id: chapterId, quest_id: checkpoint }],
  }
}

function advance(state: SaveState, ctx: EngineContext): EngineResult {
  const quest = runQuest(state, ctx)
  if (!quest || !state.active?.resolved) {
    return reject(state, 'Finish this one first.')
  }
  if (state.active.review) return advanceDrill(state, ctx)
  if (!state.position) return reject(state, 'Finish this one first.')
  const next = copy(state)
  const nextIndex = state.position.encounter_index + 1
  if (nextIndex < quest.encounters.length) {
    const encounter = quest.encounters[nextIndex]
    next.position = { ...state.position, encounter_index: nextIndex }
    next.active = beginRun(encounter, quest, nextIndex)
    next.diagram = applyOps(next.diagram, encounter.on_enter)
    next.updated_at = ctx.now
    return { state: next, events: [] }
  }

  if (!next.progress.quests_completed.includes(quest.id)) {
    next.progress.quests_completed.push(quest.id)
    next.stats.quests += 1
  }
  next.active = null
  next.position = { ...state.position, encounter_index: quest.encounters.length - 1 }
  next.updated_at = ctx.now
  return {
    state: next,
    events: [{ type: 'quest_complete', quest_id: quest.id, chapter_id: quest.chapter }],
  }
}

/** The drill moves to its next closed file, or hands in its numbers and ends. */
function advanceDrill(state: SaveState, ctx: EngineContext): EngineResult {
  const next = copy(state)
  const session = next.review_session
  next.active = null
  next.updated_at = ctx.now
  if (!session) return { state: next, events: [] }
  session.index += 1
  const upcoming = session.items[session.index]
  if (upcoming) {
    return { state: next, events: [{ type: 'review_advance', quest_id: upcoming.quest_id }] }
  }
  next.stats.drills += 1
  next.review_session = null
  return {
    state: next,
    events: [
      {
        type: 'review_complete',
        mode: session.mode,
        correct: session.correct,
        wrong: session.wrong,
      },
    ],
  }
}

function abandon(state: SaveState, ctx: EngineContext): EngineResult {
  const next = copy(state)
  // Walking out of a drill leaves the story exactly where it stood.
  const closingDrill = Boolean(state.review_session || state.active?.review)
  next.active = null
  next.review_session = null
  if (!closingDrill) next.position = null
  next.updated_at = ctx.now
  return { state: next, events: [] }
}

function buyPerk(state: SaveState, perk: PerkId, ctx: EngineContext): EngineResult {
  const definition = PERKS[perk]
  if (!definition) return reject(state, 'No such perk.')
  if (state.skill_points < definition.cost) return reject(state, 'Not enough skill points.')
  if (state.perks_bought[perk] >= definition.cap) return reject(state, 'You have all of those you can hold.')

  const next = copy(state)
  next.skill_points -= definition.cost
  next.perks[perk] += 1
  next.perks_bought[perk] += 1
  next.updated_at = ctx.now
  return { state: next, events: [{ type: 'perk_buy', perk }] }
}

function usePerk(state: SaveState, perk: PerkId, ctx: EngineContext): EngineResult {
  const quest = runQuest(state, ctx)
  if (!state.perks[perk]) return reject(state, 'You do not have that perk.')
  if (!quest || !state.active || state.active.resolved) return reject(state, 'Nothing to use it on.')
  const encounter = currentEncounter(quest, state)
  if (!encounter) return reject(state, 'Nothing to use it on.')

  const next = copy(state)
  const run = next.active as EncounterRun

  if (perk === 'hint') {
    // A hint points at the governing principle. It never crosses anything off:
    // telling the options apart is the work the encounter exists to exercise.
    if (!encounter.hint) return reject(state, 'Nobody has a hint for this one.')
    if (run.hint_used) return reject(state, 'You already got the nudge.')
    run.hint_used = true
    push(run, { kind: 'hint', text: encounter.hint })
  } else if (perk === 'overtime') {
    if (encounter.type !== 'troubleshoot') return reject(state, 'Overtime only helps on an incident.')
    run.time_left += 1
    run.time_budget += 1
    push(run, { kind: 'system', text: 'You buy yourself one more time unit.' })
  } else {
    if (run.review) return reject(state, 'Reputation never moves in a drill. Save it.')
    if (run.shield) return reject(state, 'A shield is already up.')
    run.shield = true
    push(run, { kind: 'system', text: 'Rep Shield armed: the next hit lands at half strength.' })
  }

  next.perks[perk] -= 1
  next.updated_at = ctx.now
  return { state: next, events: [{ type: 'perk_use', perk }] }
}

/**
 * Open a drill. Due mode works through the follow-up queue; act mode deals one
 * closed encounter per chapter of a finished act, domains shuffled together
 * the way the exam deals them.
 */
function startReview(
  state: SaveState,
  action: { mode: 'due' } | { mode: 'act'; act: string },
  ctx: EngineContext,
): EngineResult {
  // A live story ticket blocks a drill; a replay of a closed quest does not,
  // because a replay has nothing at stake and can be put down mid-scene.
  const busy =
    state.active &&
    !state.active.review &&
    !state.progress.quests_completed.includes(state.active.quest_id)
  if (busy) {
    return reject(state, 'Finish the ticket in front of you first.')
  }
  const items =
    action.mode === 'due'
      ? selectDueDrill(ctx.index, state, ctx.now)
      : selectActDrill(ctx.index, state, action.act)
  if (!items.length) {
    return reject(
      state,
      action.mode === 'due'
        ? 'Nothing on the follow-up list is due yet.'
        : 'The on-call rotation opens when the act is finished.',
    )
  }
  const next = copy(state)
  next.active = null
  next.review_session = {
    mode: action.mode,
    ...(action.mode === 'act' ? { act: action.act } : {}),
    items,
    index: 0,
    correct: 0,
    wrong: 0,
  }
  next.updated_at = ctx.now
  return {
    state: next,
    events: [{ type: 'review_start', mode: action.mode, quest_id: items[0].quest_id }],
  }
}

/** Begin the run for the drill's current item; the caller loads its quest first. */
function reviewNext(state: SaveState, ctx: EngineContext): EngineResult {
  const session = state.review_session
  if (!session) return reject(state, 'No drill open.')
  if (state.active && !state.active.resolved) return reject(state, 'Finish this one first.')
  const item = session.items[session.index]
  if (!item) return reject(state, 'The drill is over.')
  const quest = ctx.quest
  if (!quest || quest.id !== item.quest_id) return reject(state, 'That quest has not loaded yet.')
  const position = quest.encounters.findIndex((entry) => entry.id === item.encounter_id)
  if (position < 0) return reject(state, 'That encounter is not in this build.')

  const next = copy(state)
  next.active = beginRun(quest.encounters[position], quest, position, true)
  next.updated_at = ctx.now
  return { state: next, events: [] }
}

function restartCheckpoint(state: SaveState, ctx: EngineContext): EngineResult {
  const quest = ctx.quest
  if (!quest) return reject(state, 'Nothing to restart.')
  const next = copy(state)
  next.active = beginRun(quest.encounters[0], quest, 0)
  next.position = { chapter_id: quest.chapter, quest_id: quest.id, encounter_index: 0 }
  next.diagram = applyOps(next.diagram, quest.encounters[0].on_enter)
  next.updated_at = ctx.now
  return { state: next, events: [] }
}
