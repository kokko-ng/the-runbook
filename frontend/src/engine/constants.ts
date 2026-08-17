import type { PerkId } from './types'

/** Reputation bounds and the two thresholds the story hangs off. */
export const REP_MIN = 0
export const REP_MAX = 100
export const REP_START = 50
/** Reputation restored after a PIP; deliberately below the start value. */
export const REP_AFTER_PIP = 40
export const REP_BONUS_THRESHOLD = 80

export const SAVE_SCHEMA_VERSION = 1

/**
 * Default rewards per encounter type. Content may override any of these through
 * an encounter's `rewards` block or an option's explicit `rep`.
 */
export const DEFAULT_REWARDS = {
  design_decision: {
    repBonus: 5,
    repPenalty: 8,
    underBudgetBonus: 0,
    timePenalty: 0,
    skillPoints: 1,
  },
  troubleshoot: {
    repBonus: 5,
    repPenalty: 8,
    underBudgetBonus: 3,
    timePenalty: 1,
    skillPoints: 1,
  },
  knowledge_check: {
    repBonus: 2,
    repPenalty: 4,
    underBudgetBonus: 0,
    timePenalty: 0,
    skillPoints: 0,
  },
} as const

export interface PerkDefinition {
  id: PerkId
  name: string
  description: string
  cost: number
  /** Maximum number held at once; buying is refused at the cap. */
  cap: number
}

export const PERKS: Record<PerkId, PerkDefinition> = {
  hint: {
    id: 'hint',
    name: 'Hint',
    description: 'Eliminate one wrong option from the current choice.',
    cost: 1,
    cap: 3,
  },
  overtime: {
    id: 'overtime',
    name: 'Overtime',
    description: 'Add one time unit to the current incident.',
    cost: 1,
    cap: 3,
  },
  repShield: {
    id: 'repShield',
    name: 'Rep Shield',
    description: 'Halve the next reputation loss.',
    cost: 2,
    cap: 2,
  },
}

export const PERK_IDS: PerkId[] = ['hint', 'overtime', 'repShield']
