/**
 * Content and save shapes.
 *
 * These mirror content/schema/*.json exactly. If a field appears here that the
 * schema does not allow, the linter is right and this file is wrong.
 */

export type EncounterType = 'design' | 'troubleshoot' | 'knowledge'
export type NodeStatus = 'healthy' | 'degraded' | 'broken' | 'planned'

export interface DiagramOp {
  op:
    | 'add_node'
    | 'remove_node'
    | 'set_status'
    | 'set_detail'
    | 'add_edge'
    | 'remove_edge'
    | 'set_edge_status'
  node?: string
  edge?: string
  status?: NodeStatus
  detail?: string
}

export interface Option {
  id: string
  label: string
  correct: boolean
  rep: number
  consequence?: string
  explain: string
  diagram?: DiagramOp[]
}

export interface InvestigateStep {
  id: string
  action: string
  speaker?: string
  reveals: string
  time_cost?: number
}

export interface CommandStep {
  id: string
  cmd: string
  label?: string
  output: string
  note?: string
  time_cost?: number
}

export interface Ticket {
  ref: string
  opened: string
  reporter: string
  summary: string
  severity?: 'sev1' | 'sev2' | 'sev3' | 'sev4'
}

export interface SketchNode {
  id: string
  label: string
  kind: string
  col: number
  row: number
  note?: string
  tone?: 'normal' | 'proposed' | 'problem'
}

export interface SketchEdge {
  source: string
  target: string
  label?: string
  tone?: 'normal' | 'proposed' | 'problem'
}

/** A small diagram drawn inline in the feed, authored as data rather than an image. */
export interface Sketch {
  caption: string
  nodes: SketchNode[]
  edges?: SketchEdge[]
}

interface EncounterBase {
  id: string
  title: string
  intro: string
  speaker?: string
  objectives?: string[]
  on_enter?: DiagramOp[]
  sketch?: Sketch
  resolution?: string
}

export interface DesignEncounter extends EncounterBase {
  type: 'design'
  prompt: string
  options: Option[]
}

export interface KnowledgeEncounter extends EncounterBase {
  type: 'knowledge'
  question: string
  options: Option[]
}

export interface TroubleshootEncounter extends EncounterBase {
  type: 'troubleshoot'
  ticket: Ticket
  time_budget: number
  investigate: InvestigateStep[]
  commands: CommandStep[]
  fixes: Option[]
}

export type Encounter = DesignEncounter | KnowledgeEncounter | TroubleshootEncounter

export interface Quest {
  id: string
  chapter: string
  title: string
  summary: string
  variant?: 'core' | 'bonus'
  bonus_of?: string
  objectives: string[]
  estimated_minutes?: number
  brief?: string
  debrief?: string
  encounters: Encounter[]
}

export interface QuestSummary {
  id: string
  title: string
  summary: string
  variant: 'core' | 'bonus'
  bonus_of: string | null
  objectives: string[]
  estimated_minutes: number
  encounter_count: number
  encounter_types: EncounterType[]
}

export interface Chapter {
  id: string
  act: string
  order: number
  domain: string
  title: string
  rank: string
  blurb: string
  quests: QuestSummary[]
}

export interface ObjectiveRef {
  id: string
  text: string
}

export interface SkillGroup {
  id: string
  title: string
  objectives: ObjectiveRef[]
}

export interface ExamDomain {
  id: string
  title: string
  weight: string
  chapter: string
  groups: SkillGroup[]
}

export interface Exam {
  exam: string
  act: number
  title: string
  source_url: string
  skills_measured_as_of: string
  fetched_on: string
  domains: ExamDomain[]
}

export interface DiagramNodeSpec {
  id: string
  label: string
  kind: string
  group: string
  x: number
  y: number
  detail?: string
  present?: boolean
  status?: NodeStatus
}

export interface DiagramEdgeSpec {
  id: string
  source: string
  target: string
  label?: string
  kind?: 'network' | 'identity' | 'data' | 'traffic' | 'backup'
  present?: boolean
  status?: NodeStatus
}

export interface DiagramSpec {
  act: number
  groups: { id: string; label: string; note?: string }[]
  nodes: DiagramNodeSpec[]
  edges: DiagramEdgeSpec[]
}

export interface CastMember {
  id: string
  name: string
  role: string
  note: string
}

export interface Act {
  id: string
  number: number
  exam: string
  title: string
  tagline: string
  chapters: string[]
}

export interface ContentIndex {
  version: string
  company: Record<string, string>
  ranks: { id: string; title: string }[]
  cast: CastMember[]
  acts: Act[]
  chapters: Chapter[]
  exams: Exam[]
  diagrams: Record<string, DiagramSpec>
  legal: string[]
}

// --------------------------------------------------------------------------
// save state
// --------------------------------------------------------------------------

export const SAVE_SCHEMA_VERSION = 1

export type PerkId = 'hint' | 'overtime' | 'rep_shield'

export interface DiagramNodeState {
  present: boolean
  status: NodeStatus
  detail?: string
}

export interface DiagramState {
  nodes: Record<string, DiagramNodeState>
  edges: Record<string, DiagramNodeState>
}

export type LogEntry =
  | { seq: number; kind: 'intro'; text: string; speaker?: string; title: string }
  | { seq: number; kind: 'ticket'; ticket: Ticket }
  | { seq: number; kind: 'sketch'; sketch: Sketch }
  | { seq: number; kind: 'reveal'; id: string; action: string; reveals: string; speaker?: string }
  | { seq: number; kind: 'command'; id: string; cmd: string; output: string; note?: string; cost: number }
  | { seq: number; kind: 'choice'; option_id: string; label: string; correct: boolean }
  | {
      seq: number
      kind: 'feedback'
      correct: boolean
      consequence?: string
      explain: string
      rep_delta: number
    }
  | { seq: number; kind: 'resolution'; text: string }
  | { seq: number; kind: 'system'; text: string }

/** Omit that distributes over a union, so log entries keep their shape. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type LogEntryInput = DistributiveOmit<LogEntry, 'seq'>

export interface EncounterRun {
  quest_id: string
  encounter_id: string
  type: EncounterType
  index: number
  attempts: number
  eliminated: string[]
  revealed: string[]
  ran: string[]
  time_left: number
  time_budget: number
  shield: boolean
  resolved: boolean
  outcome: 'first_try' | 'recovered' | null
  log: LogEntry[]
  seq: number
}

export interface Position {
  chapter_id: string
  quest_id: string
  encounter_index: number
}

export interface HistoryEntry {
  at: string
  quest_id: string
  encounter_id: string
  option_id: string
  correct: boolean
  rep_after: number
}

export interface Progress {
  quests_completed: string[]
  encounters_cleared: string[]
  first_try: string[]
  objectives: string[]
  chapter_checkpoints: Record<string, string>
}

export interface SaveState {
  schema_version: number
  content_version: string
  created_at: string
  updated_at: string
  rep: number
  skill_points: number
  perks: Record<PerkId, number>
  perks_bought: Record<PerkId, number>
  position: Position | null
  active: EncounterRun | null
  diagram: DiagramState
  progress: Progress
  history: HistoryEntry[]
  stats: { pips: number; correct: number; wrong: number; quests: number }
}

// --------------------------------------------------------------------------
// actions and events
// --------------------------------------------------------------------------

export type Action =
  | { type: 'start_quest'; quest_id: string }
  | { type: 'investigate'; id: string }
  | { type: 'command'; id: string }
  | { type: 'choose'; option_id: string }
  | { type: 'advance' }
  | { type: 'abandon' }
  | { type: 'buy_perk'; perk: PerkId }
  | { type: 'use_perk'; perk: PerkId }
  | { type: 'restart_checkpoint' }

export type GameEvent =
  | { type: 'quest_start'; quest_id: string }
  | { type: 'quest_complete'; quest_id: string; chapter_id: string }
  | { type: 'encounter_resolve'; quest_id: string; encounter_id: string; outcome: string }
  | { type: 'choice'; quest_id: string; encounter_id: string; option_id: string; correct: boolean }
  | { type: 'pip'; chapter_id: string; quest_id: string }
  | { type: 'perk_buy'; perk: PerkId }
  | { type: 'perk_use'; perk: PerkId }
  | { type: 'rejected'; reason: string }
  | { type: 'objectives'; ids: string[] }

export interface EngineResult {
  state: SaveState
  events: GameEvent[]
}
