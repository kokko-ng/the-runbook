/** Every tunable number the game runs on, in one place. */

export const REP_START = 50
export const REP_MIN = 0
export const REP_MAX = 100
/** Reputation you are handed back after a performance improvement plan. */
export const REP_AFTER_PIP = 40
/** Getting it right without a wrong turn first is worth something extra. */
export const REP_FIRST_TRY_BONUS = 2
/** Closing an incident with time to spare is worth the same again. */
export const REP_UNDER_BUDGET_BONUS = 3
/** Bonus scenarios stay locked until you are trusted with them. */
export const REP_BONUS_UNLOCK = 80
/** A wrong fix burns a time unit as well as reputation. */
export const WRONG_FIX_TIME_COST = 1
export const DEFAULT_COMMAND_TIME_COST = 1

export const PERKS = {
  hint: { id: 'hint', name: 'Hint', cost: 1, cap: 8, blurb: 'Rule out one wrong option.' },
  overtime: {
    id: 'overtime',
    name: 'Overtime',
    cost: 1,
    cap: 8,
    blurb: 'Buy one more time unit on the incident in front of you.',
  },
  rep_shield: {
    id: 'rep_shield',
    name: 'Rep Shield',
    cost: 2,
    cap: 6,
    blurb: 'Halve the next reputation hit you take.',
  },
} as const

export type PerkDefinition = (typeof PERKS)[keyof typeof PERKS]

export function clampRep(value: number): number {
  return Math.max(REP_MIN, Math.min(REP_MAX, Math.round(value)))
}

/** A shielded loss is halved in the player's favor, never rounded against them. */
export function applyShield(delta: number, shielded: boolean): number {
  if (!shielded || delta >= 0) return delta
  return Math.ceil(delta / 2)
}
