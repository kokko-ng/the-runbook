/**
 * The game engine.
 *
 * A pure state machine: (save state, content, action) in, (new state, events)
 * out. No Vue, no storage, no clock of its own -- the caller supplies `now`.
 * Every rule about reputation, time budgets, skill points and progression lives
 * here so that the components stay dumb and the whole thing stays testable.
 */

import { applyOps, initialDiagram } from './diagram'
import {
  DEFAULT_COMMAND_TIME_COST,
  PERKS,
  REP_AFTER_PIP,
  REP_BONUS_UNLOCK,
  REP_FIRST_TRY_BONUS,
  REP_START,
  REP_UNDER_BUDGET_BONUS,
  WRONG_FIX_TIME_COST,
  applyShield,
  clampRep,
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
      chapter_checkpoints: {},
    },
    history: [],
    stats: { pips: 0, correct: 0, wrong: 0, quests: 0 },
  }
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
    stats: { ...base.stats, ...(save.stats ?? {}) },
    diagram: {
      nodes: { ...base.diagram.nodes, ...(save.diagram?.nodes ?? {}) },
      edges: { ...base.diagram.edges, ...(save.diagram?.edges ?? {}) },
    },
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
  return ordered
    .slice(0, position)
    .every((chapter) =>
      coreQuests(chapter).every((quest) => state.progress.quests_completed.includes(quest.id)),
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
  if (quest.variant === 'bonus') {
    if (state.rep < REP_BONUS_UNLOCK) {
      return {
        unlocked: false,
        reason: `Exam-hard scenarios open up at ${REP_BONUS_UNLOCK} reputation.`,
      }
    }
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

function beginRun(encounter: Encounter, quest: Quest, index: number): EncounterRun {
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
    log: [],
    seq: 0,
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
  if (!state.position) return undefined
  return quest.encounters[state.position.encounter_index]
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
  }
}

function startQuest(state: SaveState, questId: string, ctx: EngineContext): EngineResult {
  const quest = ctx.quest
  if (!quest || quest.id !== questId) return reject(state, 'That quest has not loaded yet.')
  const availability = questAvailability(state, ctx.index, questId)
  if (!availability.unlocked) return reject(state, availability.reason ?? 'Locked.')

  const next = copy(state)
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
  const quest = ctx.quest
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
  const quest = ctx.quest
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
  const quest = ctx.quest
  if (!quest || !state.active || state.active.resolved) return reject(state, 'Nothing to answer.')
  const encounter = currentEncounter(quest, state)
  if (!encounter) return reject(state, 'Nothing to answer.')
  const option = optionsOf(encounter).find((entry) => entry.id === optionId)
  if (!option) return reject(state, 'Unknown option.')
  if (state.active.eliminated.includes(optionId)) return reject(state, 'That one is already out.')

  const next = copy(state)
  const run = next.active as EncounterRun
  const events: GameEvent[] = []
  const replay = next.progress.quests_completed.includes(quest.id)
  const firstTry = run.attempts === 0

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
    if (replay) delta = 0

    next.rep = clampRep(next.rep + delta)
    next.stats.correct += 1
    run.resolved = true
    run.outcome = firstTry ? 'first_try' : 'recovered'
    next.diagram = applyOps(next.diagram, option.diagram)

    push(run, {
      kind: 'feedback',
      correct: true,
      explain: option.explain,
      rep_delta: delta,
      ...(option.consequence ? { consequence: option.consequence } : {}),
    })
    if (encounter.resolution) push(run, { kind: 'resolution', text: encounter.resolution })

    if (!replay) {
      const earned = (firstTry ? 1 : 0) + (underBudget ? 1 : 0)
      next.skill_points += earned
      const ref = `${quest.id}/${encounter.id}`
      if (!next.progress.encounters_cleared.includes(ref)) next.progress.encounters_cleared.push(ref)
      if (firstTry && !next.progress.first_try.includes(ref)) next.progress.first_try.push(ref)
      const lit = encounterObjectives(encounter, quest).filter(
        (objective) => !next.progress.objectives.includes(objective),
      )
      next.progress.objectives.push(...lit)
      if (lit.length) events.push({ type: 'objectives', ids: lit })
    }
    events.push({
      type: 'encounter_resolve',
      quest_id: quest.id,
      encounter_id: encounter.id,
      outcome: run.outcome,
    })
  } else {
    const delta = replay ? 0 : applyShield(option.rep, run.shield)
    if (run.shield) run.shield = false
    next.rep = clampRep(next.rep + delta)
    next.stats.wrong += 1
    run.eliminated.push(option.id)
    if (encounter.type === 'troubleshoot') {
      run.time_left = Math.max(0, run.time_left - WRONG_FIX_TIME_COST)
    }
    next.diagram = applyOps(next.diagram, option.diagram)
    push(run, {
      kind: 'feedback',
      correct: false,
      explain: option.explain,
      rep_delta: delta,
      ...(option.consequence ? { consequence: option.consequence } : {}),
    })
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
  const quest = ctx.quest
  if (!quest || !state.active?.resolved || !state.position) {
    return reject(state, 'Finish this one first.')
  }
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

function abandon(state: SaveState, ctx: EngineContext): EngineResult {
  const next = copy(state)
  next.active = null
  next.position = null
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
  const quest = ctx.quest
  if (!state.perks[perk]) return reject(state, 'You do not have that perk.')
  if (!quest || !state.active || state.active.resolved) return reject(state, 'Nothing to use it on.')
  const encounter = currentEncounter(quest, state)
  if (!encounter) return reject(state, 'Nothing to use it on.')

  const next = copy(state)
  const run = next.active as EncounterRun

  if (perk === 'hint') {
    const target = optionsOf(encounter).find(
      (option) => !option.correct && !run.eliminated.includes(option.id),
    )
    if (!target) return reject(state, 'There is nothing left to rule out.')
    run.eliminated.push(target.id)
    push(run, { kind: 'system', text: `Ruled out: ${target.label}` })
  } else if (perk === 'overtime') {
    if (encounter.type !== 'troubleshoot') return reject(state, 'Overtime only helps on an incident.')
    run.time_left += 1
    run.time_budget += 1
    push(run, { kind: 'system', text: 'You buy yourself one more time unit.' })
  } else {
    if (run.shield) return reject(state, 'A shield is already up.')
    run.shield = true
    push(run, { kind: 'system', text: 'Rep Shield armed: the next hit lands at half strength.' })
  }

  next.perks[perk] -= 1
  next.updated_at = ctx.now
  return { state: next, events: [{ type: 'perk_use', perk }] }
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
