/**
 * The game engine: `(state, content, action) -> {state, events}`, pure.
 *
 * No Vue, no storage, no clock, no randomness. Every branch is reachable from a
 * unit test, and the UI is a function of the state and events this returns.
 */

import {
  DEFAULT_REWARDS,
  PERKS,
  REP_AFTER_PIP,
  REP_BONUS_THRESHOLD,
  REP_MAX,
  REP_MIN,
  REP_START,
  SAVE_SCHEMA_VERSION,
} from './constants'
import { applyDiagramOps, cloneDiagram } from './diagram'
import { clusterById, deriveLitClusters } from './skilltree'
import type {
  ContentBundle,
  DiagramState,
  Encounter,
  EncounterState,
  EngineAction,
  EngineEvent,
  EngineResult,
  GameState,
  Manifest,
  Option,
  PerkId,
  Phase,
  Rewards,
} from './types'

// ------------------------------------------------------------- new game

export function emptyEncounterState(): EncounterState {
  return {
    eliminatedOptionIds: [],
    revealedActionIds: [],
    ranCommandIds: [],
    timeRemaining: null,
    attempts: 0,
    hintUsed: false,
    overtimeUsed: false,
  }
}

export function createInitialState(manifest: Manifest, act = 1): GameState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    questId: '',
    encounterId: '',
    phase: 'scenario',
    rep: REP_START,
    skillPoints: 0,
    perksOwned: { hint: 0, overtime: 0, repShield: 0 },
    armed: { repShield: false },
    encounter: emptyEncounterState(),
    diagram: baseDiagram(manifest, act),
    clearedObjectiveIds: [],
    litClusterIds: [],
    completedQuestIds: [],
    history: [],
    checkpoint: null,
    bonusUnlocked: false,
  }
}

export function baseDiagram(manifest: Manifest, act: number): DiagramState {
  const source = manifest.diagrams[String(act)]
  if (!source) return { groups: [], nodes: [], edges: [] }
  return cloneDiagram({ groups: source.groups, nodes: source.nodes, edges: source.edges })
}

// ------------------------------------------------------------ transition

export function applyAction(
  state: GameState,
  content: ContentBundle,
  action: EngineAction,
): EngineResult {
  const ctx = new Transition(state, content)

  switch (action.type) {
    case 'START_QUEST':
      ctx.startQuest(action.questId)
      break
    case 'CHOOSE_OPTION':
      ctx.chooseOption(action.optionId)
      break
    case 'RUN_INVESTIGATE':
      ctx.runInvestigate(action.actionId)
      break
    case 'RUN_COMMAND':
      ctx.runCommand(action.commandId)
      break
    case 'ENTER_PHASE':
      ctx.enterPhase(action.phase)
      break
    case 'BUY_PERK':
      ctx.buyPerk(action.perk)
      break
    case 'USE_PERK':
      ctx.usePerk(action.perk)
      break
    case 'ADVANCE':
      ctx.advance()
      break
    case 'RESTART_CHECKPOINT':
      ctx.restartCheckpoint()
      break
  }

  return ctx.result()
}

/**
 * Working copy for one action. Mutates its own draft freely and hands back a
 * new object, so callers never see a partially applied transition.
 */
class Transition {
  private draft: GameState
  private events: EngineEvent[] = []
  private changed = false

  constructor(
    private readonly original: GameState,
    private readonly content: ContentBundle,
  ) {
    this.draft = cloneState(original)
  }

  result(): EngineResult {
    return {
      state: this.changed ? this.draft : this.original,
      events: this.events,
    }
  }

  // -------------------------------------------------------- helpers

  private emit(event: EngineEvent) {
    this.events.push(event)
    this.changed = true
  }

  private reject(reason: string) {
    // Rejections are surfaced but never mutate state, so a double-click or a
    // stale button cannot corrupt a save.
    this.events.push({ type: 'rejected', reason })
  }

  private get quest() {
    return this.content.quest
  }

  private encounter(): Encounter | undefined {
    return this.quest.encounters.find((candidate) => candidate.id === this.draft.encounterId)
  }

  private rewards(encounter: Encounter): Required<Rewards> {
    return { ...DEFAULT_REWARDS[encounter.type], ...encounter.rewards }
  }

  /** The option set the current phase is choosing from. */
  private activeOptions(encounter: Encounter): Option[] {
    if (encounter.type === 'troubleshoot') return encounter.fixes
    return encounter.options
  }

  private changeRep(delta: number) {
    let applied = delta
    let shielded = false

    if (delta < 0 && this.draft.armed.repShield) {
      // Halve toward zero so a shielded loss is never rounded up.
      applied = -Math.floor(Math.abs(delta) / 2)
      shielded = true
      this.draft.armed.repShield = false
    }

    const rep = clamp(this.draft.rep + applied, REP_MIN, REP_MAX)
    if (rep === this.draft.rep && applied === 0) return

    this.draft.rep = rep
    this.emit({ type: 'rep_changed', delta: applied, rep, shielded })

    if (rep >= REP_BONUS_THRESHOLD && !this.draft.bonusUnlocked) {
      this.draft.bonusUnlocked = true
      this.emit({ type: 'bonus_unlocked' })
    }
    if (rep <= REP_MIN) {
      this.enterPip()
    }
  }

  private changeSkillPoints(delta: number) {
    if (delta === 0) return
    this.draft.skillPoints += delta
    this.emit({ type: 'skill_points_changed', delta, total: this.draft.skillPoints })
  }

  private changeTime(delta: number) {
    if (this.draft.encounter.timeRemaining === null || delta === 0) return
    this.draft.encounter.timeRemaining += delta
    this.emit({
      type: 'time_changed',
      delta,
      remaining: this.draft.encounter.timeRemaining,
    })
    if (this.draft.encounter.timeRemaining <= 0) {
      this.emit({ type: 'time_exhausted' })
    }
  }

  private setPhase(phase: Phase) {
    if (this.draft.phase === phase) return
    this.draft.phase = phase
    this.emit({ type: 'phase_changed', phase })
  }

  private record(action: string, choiceId: string, correct?: boolean) {
    const entry = {
      questId: this.draft.questId,
      encounterId: this.draft.encounterId,
      action,
      choiceId,
      ...(correct === undefined ? {} : { correct }),
    }
    this.draft.history.push(entry)
  }

  // --------------------------------------------------------- actions

  startQuest(questId: string) {
    const quest = this.quest
    if (quest.id !== questId) {
      this.reject(`content bundle holds ${quest.id}, not ${questId}`)
      return
    }

    this.draft.questId = questId
    this.draft.encounterId = quest.entry
    this.draft.encounter = emptyEncounterState()
    this.emit({ type: 'quest_started', questId, title: quest.title })

    if (quest.checkpoint) {
      // Snapshot before entering, so a PIP returns to the quest's start rather
      // than to wherever the player was when reputation ran out.
      this.draft.checkpoint = snapshot(this.draft)
    }

    this.enterEncounter()
  }

  /** Set up phase, timer, and on-entry diagram ops for the current encounter. */
  private enterEncounter() {
    const encounter = this.encounter()
    if (!encounter) {
      this.reject(`unknown encounter ${this.draft.encounterId}`)
      return
    }

    this.draft.encounter = emptyEncounterState()
    if (encounter.type === 'troubleshoot') {
      this.draft.encounter.timeRemaining = encounter.timeBudget
    }

    if (encounter.onEnterDiagramOps.length > 0) {
      this.draft.diagram = applyDiagramOps(this.draft.diagram, encounter.onEnterDiagramOps)
    }

    this.draft.phase = encounter.type === 'troubleshoot' ? 'investigate' : 'scenario'
    this.emit({
      type: 'encounter_entered',
      encounterId: encounter.id,
      encounterType: encounter.type,
    })
    this.emit({ type: 'phase_changed', phase: this.draft.phase })
  }

  chooseOption(optionId: string) {
    const encounter = this.encounter()
    if (!encounter) return this.reject('no encounter in progress')

    const choosable: Phase[] = ['scenario', 'fix']
    if (!choosable.includes(this.draft.phase)) {
      return this.reject(`cannot choose an option during ${this.draft.phase}`)
    }

    const options = this.activeOptions(encounter)
    const option = options.find((candidate) => candidate.id === optionId)
    if (!option) return this.reject(`unknown option ${optionId}`)
    if (this.draft.encounter.eliminatedOptionIds.includes(optionId)) {
      return this.reject('that option has already been ruled out')
    }

    const rewards = this.rewards(encounter)
    const firstTry = this.draft.encounter.attempts === 0
    this.record('CHOOSE_OPTION', optionId, option.correct)
    this.emit({
      type: 'option_chosen',
      optionId,
      label: option.label,
      correct: option.correct,
    })

    if (!option.correct) {
      this.draft.encounter.attempts += 1
      this.draft.encounter.eliminatedOptionIds.push(optionId)
      this.emit({ type: 'option_eliminated', optionId, reason: 'wrong' })
      this.emit({
        type: 'explanation',
        text: option.explain,
        correct: false,
        ...(option.consequence ? { consequence: option.consequence } : {}),
      })
      this.changeRep(-(option.rep !== undefined ? Math.abs(option.rep) : rewards.repPenalty))
      if (encounter.type === 'troubleshoot') {
        this.changeTime(-rewards.timePenalty)
      }
      return
    }

    // Correct. Bonuses are for a clean first pick only; a recovered encounter
    // still clears but pays nothing.
    this.emit({ type: 'explanation', text: option.explain, correct: true })

    const underBudget =
      encounter.type === 'troubleshoot' && (this.draft.encounter.timeRemaining ?? 0) >= 0

    if (firstTry) {
      const gain = option.rep !== undefined ? option.rep : rewards.repBonus
      this.changeRep(gain)
      if (underBudget && rewards.underBudgetBonus > 0) {
        this.changeRep(rewards.underBudgetBonus)
      }
      this.changeSkillPoints(rewards.skillPoints)
    }

    this.clearEncounter(encounter, option, firstTry, underBudget)
  }

  private clearEncounter(
    encounter: Encounter,
    option: Option,
    firstTry: boolean,
    underBudget: boolean,
  ) {
    if (option.diagramOps.length > 0) {
      this.draft.diagram = applyDiagramOps(this.draft.diagram, option.diagramOps)
    }

    const fresh = encounter.objectives.filter(
      (objective) => !this.draft.clearedObjectiveIds.includes(objective),
    )
    if (fresh.length > 0) {
      this.draft.clearedObjectiveIds.push(...fresh)
      this.emit({ type: 'objectives_cleared', objectiveIds: fresh })

      const lit = deriveLitClusters(this.content.manifest, this.draft.clearedObjectiveIds)
      for (const clusterId of lit) {
        if (!this.draft.litClusterIds.includes(clusterId)) {
          this.draft.litClusterIds.push(clusterId)
          const cluster = clusterById(this.content.manifest, clusterId)
          this.emit({
            type: 'cluster_lit',
            clusterId,
            title: cluster?.title ?? clusterId,
          })
        }
      }
    }

    this.emit({
      type: 'encounter_cleared',
      encounterId: encounter.id,
      firstTry,
      underBudget,
    })
    this.setPhase('resolved')
  }

  runInvestigate(actionId: string) {
    const encounter = this.encounter()
    if (!encounter || encounter.type !== 'troubleshoot') {
      return this.reject('not a troubleshooting encounter')
    }
    if (this.draft.phase !== 'investigate') {
      return this.reject('investigation is closed for this incident')
    }

    const action = encounter.investigate.find((candidate) => candidate.id === actionId)
    if (!action) return this.reject(`unknown investigation ${actionId}`)
    if (this.draft.encounter.revealedActionIds.includes(actionId)) {
      return this.reject('you already followed that up')
    }

    this.draft.encounter.revealedActionIds.push(actionId)
    this.record('RUN_INVESTIGATE', actionId)
    this.emit({
      type: 'investigated',
      actionId,
      label: action.label,
      reveals: action.reveals,
      speaker: action.speaker,
    })
    if (action.timeCost > 0) this.changeTime(-action.timeCost)
  }

  runCommand(commandId: string) {
    const encounter = this.encounter()
    if (!encounter || encounter.type !== 'troubleshoot') {
      return this.reject('not a troubleshooting encounter')
    }
    if (this.draft.phase !== 'diagnose') {
      return this.reject('you are not at a terminal right now')
    }

    const command = encounter.commands.find((candidate) => candidate.id === commandId)
    if (!command) return this.reject(`unknown command ${commandId}`)
    if (this.draft.encounter.ranCommandIds.includes(commandId)) {
      return this.reject('you have already run that')
    }
    if ((this.draft.encounter.timeRemaining ?? 0) <= 0) {
      return this.reject('the incident is out of time - go to the fix')
    }

    this.draft.encounter.ranCommandIds.push(commandId)
    this.record('RUN_COMMAND', commandId)
    this.emit({
      type: 'command_ran',
      commandId,
      command: command.command,
      output: command.output,
      note: command.note,
    })
    this.changeTime(-command.timeCost)
  }

  enterPhase(phase: Phase) {
    const encounter = this.encounter()
    if (!encounter) return this.reject('no encounter in progress')

    const allowed: Record<string, Phase[]> = {
      investigate: ['diagnose', 'fix'],
      diagnose: ['fix', 'investigate'],
    }
    if (!allowed[this.draft.phase]?.includes(phase)) {
      return this.reject(`cannot move from ${this.draft.phase} to ${phase}`)
    }
    this.setPhase(phase)
  }

  buyPerk(perk: PerkId) {
    const definition = PERKS[perk]
    const owned = this.draft.perksOwned[perk]
    if (owned >= definition.cap) return this.reject(`${definition.name} is at its cap`)
    if (this.draft.skillPoints < definition.cost) {
      return this.reject(`${definition.name} costs ${definition.cost} skill points`)
    }

    this.draft.skillPoints -= definition.cost
    this.draft.perksOwned[perk] = owned + 1
    this.emit({ type: 'skill_points_changed', delta: -definition.cost, total: this.draft.skillPoints })
    this.emit({ type: 'perk_bought', perk, owned: this.draft.perksOwned[perk] })
  }

  usePerk(perk: PerkId) {
    if (this.draft.perksOwned[perk] <= 0) return this.reject(`no ${PERKS[perk].name} available`)
    const encounter = this.encounter()
    if (!encounter) return this.reject('no encounter in progress')

    switch (perk) {
      case 'hint': {
        if (this.draft.encounter.hintUsed) return this.reject('already used a hint here')
        const options = this.activeOptions(encounter)
        // Deterministic: the first still-standing wrong option, in authored order.
        const target = options.find(
          (option) =>
            !option.correct && !this.draft.encounter.eliminatedOptionIds.includes(option.id),
        )
        if (!target) return this.reject('nothing left to eliminate')

        this.draft.encounter.hintUsed = true
        this.draft.encounter.eliminatedOptionIds.push(target.id)
        this.emit({ type: 'option_eliminated', optionId: target.id, reason: 'hint' })
        break
      }
      case 'overtime': {
        if (encounter.type !== 'troubleshoot') {
          return this.reject('Overtime only applies to an incident')
        }
        if (this.draft.encounter.overtimeUsed) {
          return this.reject('already claimed overtime on this incident')
        }
        this.draft.encounter.overtimeUsed = true
        this.changeTime(1)
        break
      }
      case 'repShield': {
        if (this.draft.armed.repShield) return this.reject('a shield is already armed')
        this.draft.armed.repShield = true
        break
      }
    }

    this.draft.perksOwned[perk] -= 1
    this.emit({ type: 'perk_used', perk, owned: this.draft.perksOwned[perk] })
  }

  advance() {
    if (this.draft.phase !== 'resolved') {
      return this.reject('nothing to advance past yet')
    }
    const encounter = this.encounter()
    if (!encounter) return this.reject('no encounter in progress')

    if (encounter.next === 'END') {
      if (!this.draft.completedQuestIds.includes(this.draft.questId)) {
        this.draft.completedQuestIds.push(this.draft.questId)
      }
      this.setPhase('quest_complete')
      this.emit({
        type: 'quest_completed',
        questId: this.draft.questId,
        title: this.quest.title,
      })
      return
    }

    this.draft.encounterId = encounter.next
    this.enterEncounter()
  }

  private enterPip() {
    this.setPhase('pip')
    this.emit({ type: 'pip', rep: this.draft.rep })
  }

  restartCheckpoint() {
    if (this.draft.phase !== 'pip') {
      return this.reject('you are not on a performance improvement plan')
    }
    if (!this.draft.checkpoint) {
      return this.reject('no checkpoint to return to')
    }

    // Restoring the snapshot reverts the diagram, the encounter, and the
    // objectives cleared since the checkpoint in one move - no inverse ops.
    const restored: GameState = JSON.parse(this.draft.checkpoint)
    const keptCheckpoint = this.draft.checkpoint
    const questId = restored.questId

    this.draft = restored
    this.draft.checkpoint = keptCheckpoint
    this.draft.rep = REP_AFTER_PIP
    this.draft.encounter = emptyEncounterState()

    this.emit({ type: 'checkpoint_restored', questId })
    this.emit({ type: 'rep_changed', delta: 0, rep: REP_AFTER_PIP, shielded: false })

    this.enterEncounter()
  }
}

// --------------------------------------------------------------- utility

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    perksOwned: { ...state.perksOwned },
    armed: { ...state.armed },
    encounter: {
      ...state.encounter,
      eliminatedOptionIds: [...state.encounter.eliminatedOptionIds],
      revealedActionIds: [...state.encounter.revealedActionIds],
      ranCommandIds: [...state.encounter.ranCommandIds],
    },
    diagram: cloneDiagram(state.diagram),
    clearedObjectiveIds: [...state.clearedObjectiveIds],
    litClusterIds: [...state.litClusterIds],
    completedQuestIds: [...state.completedQuestIds],
    history: state.history.map((entry) => ({ ...entry })),
  }
}

/** Checkpoint snapshots exclude the checkpoint itself, so they never nest. */
function snapshot(state: GameState): string {
  return JSON.stringify({ ...cloneState(state), checkpoint: null })
}

/** Options the player may still pick, in authored order. */
export function remainingOptions(encounter: Encounter, state: GameState): Option[] {
  const options = encounter.type === 'troubleshoot' ? encounter.fixes : encounter.options
  return options.filter((option) => !state.encounter.eliminatedOptionIds.includes(option.id))
}
