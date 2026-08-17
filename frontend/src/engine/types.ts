/**
 * Engine types. Two families live here:
 *
 * - Content types mirror what `compile_content` emits. Defaults are already
 *   resolved by the compiler, so optional fields here mean genuinely optional
 *   authoring, never "might be missing".
 * - State types are the save blob. Everything the player has is in `GameState`;
 *   the engine never reads anything else.
 */

// ---------------------------------------------------------------- content

export type EncounterType = 'design_decision' | 'troubleshoot' | 'knowledge_check'

export type Speaker =
  | 'manager'
  | 'mentor'
  | 'cfo'
  | 'security'
  | 'noc'
  | 'ticket'
  | 'self'
  | 'narrator'

export type NodeStatus = 'healthy' | 'warning' | 'broken' | 'degraded' | 'planned'

export type PerkId = 'hint' | 'overtime' | 'repShield'

export interface DiagramNode {
  id: string
  label: string
  kind: string
  status: NodeStatus
  group?: string
  note?: string
  position?: { x: number; y: number }
}

export interface DiagramEdge {
  id: string
  source: string
  target: string
  kind: string
  status: NodeStatus
  label?: string
}

export interface DiagramGroup {
  id: string
  label: string
}

export interface DiagramState {
  groups: DiagramGroup[]
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

export type DiagramOp =
  | { op: 'set_status'; node: string; status: NodeStatus }
  | { op: 'set_edge_status'; edge: string; status: NodeStatus }
  | { op: 'add_node'; node: DiagramNode }
  | { op: 'add_edge'; edge: DiagramEdge }
  | { op: 'remove_node'; node: string }
  | { op: 'remove_edge'; edge: string }
  | { op: 'set_label'; node: string; label: string }

export interface Option {
  id: string
  label: string
  correct: boolean
  explain: string
  consequence?: string
  rep?: number
  diagramOps: DiagramOp[]
}

export interface Rewards {
  repBonus?: number
  repPenalty?: number
  underBudgetBonus?: number
  timePenalty?: number
  skillPoints?: number
}

export interface InvestigateAction {
  id: string
  label: string
  reveals: string
  speaker: Speaker
  timeCost: number
}

export interface DiagnosticCommand {
  id: string
  label: string
  command: string
  output: string
  timeCost: number
  note: string
}

export interface Ticket {
  id: string
  reporter: string
  priority: string
  opened: string
  body: string
}

interface EncounterBase {
  id: string
  title: string
  objectives: string[]
  next: string
  onEnterDiagramOps: DiagramOp[]
  rewards: Rewards
  scenario?: string
  speaker?: Speaker
}

export interface DesignDecisionEncounter extends EncounterBase {
  type: 'design_decision'
  prompt: string
  options: Option[]
}

export interface KnowledgeCheckEncounter extends EncounterBase {
  type: 'knowledge_check'
  question: string
  options: Option[]
}

export interface TroubleshootEncounter extends EncounterBase {
  type: 'troubleshoot'
  ticket?: Ticket
  timeBudget: number
  investigate: InvestigateAction[]
  commands: DiagnosticCommand[]
  fixes: Option[]
}

export type Encounter =
  | DesignDecisionEncounter
  | KnowledgeCheckEncounter
  | TroubleshootEncounter

export interface Quest {
  id: string
  title: string
  act: number
  chapter: string
  domain: string
  order: number
  role: string
  checkpoint: boolean
  summary: string
  entry: string
  encounters: Encounter[]
  bonusVariantOf?: string
}

export interface ObjectiveRef {
  id: string
  text: string
}

export interface Cluster {
  id: string
  title: string
  requires: string[]
  objectives: ObjectiveRef[]
}

export interface Domain {
  id: string
  title: string
  chapter: string
  weight: string
  clusters: Cluster[]
}

export interface Exam {
  exam: string
  title: string
  act: number
  sourceUrl: string
  fetchedOn: string
  domains: Domain[]
}

export interface ChapterRef {
  id: string
  act: number
  title: string
  domain: string
  quests: string[]
}

export interface QuestRef {
  id: string
  title: string
  act: number
  chapter: string
  domain: string
  order: number
  role: string
  summary: string
  checkpoint: boolean
  bonusVariantOf: string | null
  objectives: string[]
}

export interface Manifest {
  formatVersion: number
  exams: Exam[]
  chapters: ChapterRef[]
  quests: QuestRef[]
  diagrams: Record<string, DiagramState & { id: string; title: string }>
  coverage: Record<string, string[]>
}

/** Everything the engine needs to resolve one action. */
export interface ContentBundle {
  manifest: Manifest
  quest: Quest
}

// ------------------------------------------------------------------ state

export type Phase =
  | 'scenario'
  | 'investigate'
  | 'diagnose'
  | 'fix'
  | 'resolved'
  | 'quest_complete'
  | 'pip'

export interface EncounterState {
  /** Wrong picks and hint removals; the UI renders the remaining options. */
  eliminatedOptionIds: string[]
  revealedActionIds: string[]
  ranCommandIds: string[]
  /** Troubleshoot only; null elsewhere. May go negative when a wrong fix costs time. */
  timeRemaining: number | null
  /** Resolution attempts so far. Zero at the moment of a correct pick earns the bonus. */
  attempts: number
  hintUsed: boolean
  overtimeUsed: boolean
}

export interface ChoiceRecord {
  questId: string
  encounterId: string
  action: string
  choiceId: string
  correct?: boolean
}

export interface GameState {
  schemaVersion: number
  questId: string
  encounterId: string
  phase: Phase
  rep: number
  skillPoints: number
  perksOwned: Record<PerkId, number>
  /** Rep Shield is armed on purchase-use and consumed by the next rep loss. */
  armed: { repShield: boolean }
  encounter: EncounterState
  diagram: DiagramState
  clearedObjectiveIds: string[]
  litClusterIds: string[]
  completedQuestIds: string[]
  history: ChoiceRecord[]
  /** JSON snapshot of the state on entering the current checkpoint quest. */
  checkpoint: string | null
  /** Latched once reputation reaches the bonus threshold; never falls back. */
  bonusUnlocked: boolean
}

// ---------------------------------------------------------------- actions

export type EngineAction =
  | { type: 'START_QUEST'; questId: string }
  | { type: 'CHOOSE_OPTION'; optionId: string }
  | { type: 'RUN_INVESTIGATE'; actionId: string }
  | { type: 'RUN_COMMAND'; commandId: string }
  | { type: 'ENTER_PHASE'; phase: Phase }
  | { type: 'BUY_PERK'; perk: PerkId }
  | { type: 'USE_PERK'; perk: PerkId }
  | { type: 'ADVANCE' }
  | { type: 'RESTART_CHECKPOINT' }

// ----------------------------------------------------------------- events

/**
 * Events are what the UI renders: the narrative feed is an event log, not a
 * re-derivation of state. Components never inspect content to decide what to
 * show.
 */
export type EngineEvent =
  | { type: 'quest_started'; questId: string; title: string }
  | { type: 'encounter_entered'; encounterId: string; encounterType: EncounterType }
  | { type: 'option_chosen'; optionId: string; label: string; correct: boolean }
  | { type: 'explanation'; text: string; consequence?: string; correct: boolean }
  | { type: 'option_eliminated'; optionId: string; reason: 'wrong' | 'hint' }
  | { type: 'investigated'; actionId: string; label: string; reveals: string; speaker: Speaker }
  | { type: 'command_ran'; commandId: string; command: string; output: string; note: string }
  | { type: 'rep_changed'; delta: number; rep: number; shielded: boolean }
  | { type: 'time_changed'; delta: number; remaining: number }
  | { type: 'time_exhausted' }
  | { type: 'skill_points_changed'; delta: number; total: number }
  | { type: 'perk_bought'; perk: PerkId; owned: number }
  | { type: 'perk_used'; perk: PerkId; owned: number }
  | { type: 'objectives_cleared'; objectiveIds: string[] }
  | { type: 'cluster_lit'; clusterId: string; title: string }
  | { type: 'encounter_cleared'; encounterId: string; firstTry: boolean; underBudget: boolean }
  | { type: 'quest_completed'; questId: string; title: string }
  | { type: 'bonus_unlocked' }
  | { type: 'pip'; rep: number }
  | { type: 'checkpoint_restored'; questId: string }
  | { type: 'phase_changed'; phase: Phase }
  | { type: 'rejected'; reason: string }

export interface EngineResult {
  state: GameState
  events: EngineEvent[]
}
