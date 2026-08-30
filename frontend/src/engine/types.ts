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

export interface PostMortemOption {
  id: string
  label: string
  correct: boolean
  explain: string
}

/**
 * The follow-up a mentor asks after the first wrong answer: what actually went
 * wrong there? Answering it well claws back some of the reputation just lost.
 */
export interface PostMortem {
  question: string
  speaker?: string
  options: PostMortemOption[]
}

/** The diagnostic path a senior would have run, shown once the fix lands. */
export interface PostIncident {
  path: string[]
  text: string
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
  /** A nudge toward the governing principle, spent via the hint perk. */
  hint?: string
  post_mortem?: PostMortem
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
  post_incident?: PostIncident
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

export interface EncounterSummary {
  id: string
  type: EncounterType
  /** Effective objectives: the encounter's own, or the quest's when it has none. */
  objectives: string[]
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
  /**
   * One entry per encounter. Lets the engine map an objective to the cleared
   * encounters that cover it without loading every quest file: review drills
   * and save migration both lean on it.
   */
  encounters?: EncounterSummary[]
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

export const SAVE_SCHEMA_VERSION = 2

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
  | { seq: number; kind: 'hint'; text: string }
  | { seq: number; kind: 'post_mortem_ask'; question: string; speaker?: string }
  | {
      seq: number
      kind: 'post_mortem'
      correct: boolean
      label: string
      explain: string
      rep_delta: number
    }
  | {
      seq: number
      kind: 'post_incident'
      text: string
      steps: { cmd: string; label?: string; ran: boolean }[]
    }

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
  /** True when this run is a drill from the review queue, not the story. */
  review: boolean
  hint_used: boolean
  /** Set once the first wrong answer opens a post-mortem; null before that. */
  post_mortem: { pending: boolean; loss: number } | null
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
  /**
   * Objectives cleared without a wrong turn somewhere along the way. The skill
   * tree shows the difference: covered is "you have seen it", mastered is "it
   * held up". A lapse in a review drill takes an objective back out.
   */
  mastered: string[]
  chapter_checkpoints: Record<string, string>
  /**
   * Acts the player asked to start at rather than arriving at by finishing the
   * one before. An act in here stands on its own: its chapters unlock in their
   * own order and owe nothing to the act ahead of it.
   */
  acts_opened: string[]
}

/** One objective's place in the spaced-review schedule. */
export interface ReviewItem {
  /** ISO instant after which the objective is due for a drill. */
  due: string
  /** Index into REVIEW_INTERVALS_DAYS; grows on recall, resets on a lapse. */
  interval: number
  /** When the objective was last earned or drilled. */
  last: string
}

export interface ReviewSession {
  mode: 'due' | 'act'
  act?: string
  items: { quest_id: string; encounter_id: string }[]
  index: number
  correct: number
  wrong: number
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
  /** The spaced-review schedule, one entry per objective the player has lit. */
  review: Record<string, ReviewItem>
  review_session: ReviewSession | null
  history: HistoryEntry[]
  stats: { pips: number; correct: number; wrong: number; quests: number; drills: number }
}

// --------------------------------------------------------------------------
// actions and events
// --------------------------------------------------------------------------

export type Action =
  | { type: 'start_quest'; quest_id: string }
  | { type: 'investigate'; id: string }
  | { type: 'command'; id: string }
  | { type: 'choose'; option_id: string }
  | { type: 'post_mortem'; option_id: string }
  | { type: 'advance' }
  | { type: 'abandon' }
  | { type: 'buy_perk'; perk: PerkId }
  | { type: 'use_perk'; perk: PerkId }
  | { type: 'restart_checkpoint' }
  | { type: 'open_act'; act: string }
  | { type: 'start_review'; mode: 'due' }
  | { type: 'start_review'; mode: 'act'; act: string }
  | { type: 'review_next' }

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
  | { type: 'act_opened'; act_id: string }
  | { type: 'post_mortem'; quest_id: string; encounter_id: string; correct: boolean }
  /** Objectives promoted to mastered after being merely covered before. */
  | { type: 'mastered'; ids: string[] }
  | { type: 'review_start'; mode: 'due' | 'act'; quest_id: string }
  /** The drill moved on to an encounter in another quest; load it and send review_next. */
  | { type: 'review_advance'; quest_id: string }
  | { type: 'review_complete'; mode: 'due' | 'act'; correct: number; wrong: number }

export interface EngineResult {
  state: SaveState
  events: GameEvent[]
}
