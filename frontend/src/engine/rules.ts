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
/** Where the reputation bar turns from steady to good. Cosmetic only. */
export const REP_BAR_STRONG = 80
/** A wrong fix burns a time unit as well as reputation. */
export const WRONG_FIX_TIME_COST = 1
export const DEFAULT_COMMAND_TIME_COST = 1

/**
 * How long an objective rests between review drills, by recall streak. A lapse
 * sends it back to the start of the ladder; a clean recall moves it one rung up.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30]
/** A due-queue drill re-runs at most this many closed encounters in one sitting. */
export const REVIEW_SESSION_CAP = 5
/** A clean recall in a drill pays one skill point. Rep never moves in a drill. */
export const REVIEW_FIRST_TRY_POINT = 1

export const PERKS = {
  hint: {
    id: 'hint',
    name: 'Hint',
    cost: 1,
    cap: 8,
    blurb: 'A nudge toward the principle that decides it. Nothing is ruled out for you.',
  },
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

/**
 * A good post-mortem answer earns back half of what the wrong turn cost,
 * rounded in the player's favor. Failure stays a failure; understanding why
 * softens the landing.
 */
export function clawback(loss: number): number {
  if (loss >= 0) return 0
  return Math.ceil(-loss / 2)
}

/** The instant an objective next comes due, `interval` rungs up the ladder. */
export function nextDue(from: string, interval: number): string {
  const rung = Math.max(0, Math.min(interval, REVIEW_INTERVALS_DAYS.length - 1))
  const days = REVIEW_INTERVALS_DAYS[rung]
  return new Date(new Date(from).getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}
