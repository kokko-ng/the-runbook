/**
 * The only code in the app that touches localStorage.
 *
 * Guest-first: the game is fully playable with no account, and this is where
 * that save lives. The blob shape is identical to the one the server stores, so
 * enabling sync later is a transport change, not a format change.
 */

import { isSaveBlob, migrate, serialize, SaveIncompatibleError } from '@/engine/save'
import type { SaveBlob } from '@/engine/save'
import type { GameState } from '@/engine/types'

const KEY = 'runbook.save.v1'
const ANON_KEY = 'runbook.anonymous-id'

export type LoadOutcome =
  | { status: 'loaded'; state: GameState; updatedAt: string }
  | { status: 'empty' }
  | { status: 'unreadable'; reason: string }

function storage(): Storage | null {
  try {
    // Private browsing and blocked-cookie modes throw on access, not on use.
    const probe = window.localStorage
    probe.getItem(KEY)
    return probe
  } catch {
    return null
  }
}

export function write(state: GameState, now: string): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(KEY, JSON.stringify(serialize(state, now)))
    return true
  } catch {
    // Quota exhausted or storage disabled mid-session; the game continues in
    // memory rather than interrupting play.
    return false
  }
}

export function read(): LoadOutcome {
  const store = storage()
  if (!store) return { status: 'unreadable', reason: 'This browser is blocking local storage.' }

  const raw = store.getItem(KEY)
  if (!raw) return { status: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'unreadable', reason: 'The saved game could not be read.' }
  }

  if (!isSaveBlob(parsed)) {
    return { status: 'unreadable', reason: 'The saved game is not in a format this build knows.' }
  }

  try {
    const blob = parsed as SaveBlob
    return { status: 'loaded', state: migrate(blob), updatedAt: blob.updatedAt }
  } catch (error) {
    const reason =
      error instanceof SaveIncompatibleError
        ? 'This save was made by a newer version of the game. Reload to update.'
        : 'The saved game could not be restored.'
    return { status: 'unreadable', reason }
  }
}

export function clear(): void {
  storage()?.removeItem(KEY)
}

export function hasSave(): boolean {
  return storage()?.getItem(KEY) != null
}

/** Stable per-browser id for anonymous analytics. Never leaves this device except on events. */
export function anonymousId(): string {
  const store = storage()
  if (!store) return 'anonymous'

  const existing = store.getItem(ANON_KEY)
  if (existing) return existing

  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `anon-${Date.now().toString(36)}`
  store.setItem(ANON_KEY, generated)
  return generated
}
