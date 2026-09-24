/**
 * localStorage, defensively.
 *
 * The game is playable with no account at all, so the browser is the primary
 * home of a save. It is also a place that throws: private windows, full quotas,
 * blocked storage. Every access here fails soft, because losing a turn is
 * better than a white screen.
 */

import type { SaveState } from '@/engine'
import type { Attempt, HistoryEntry } from '@/practice'

const SAVE_KEY = 'runbook.save.v1'
const ANON_KEY = 'runbook.anon.v1'
const THEME_KEY = 'runbook.theme.v1'

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function loadSave(): SaveState | null {
  const raw = readRaw(SAVE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SaveState
    return parsed && typeof parsed === 'object' && 'rep' in parsed ? parsed : null
  } catch {
    return null
  }
}

export function persistSave(save: SaveState): boolean {
  return writeRaw(SAVE_KEY, JSON.stringify(save))
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY)
  } catch {
    /* nothing sensible to do */
  }
}

/** A random id so anonymous telemetry can be grouped into sessions. */
export function anonymousId(): string {
  const existing = readRaw(ANON_KEY)
  if (existing) return existing
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  writeRaw(ANON_KEY, generated)
  return generated
}

export type ThemeChoice = 'system' | 'light' | 'dark'

export function loadTheme(): ThemeChoice {
  const value = readRaw(THEME_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function persistTheme(choice: ThemeChoice): void {
  writeRaw(THEME_KEY, choice)
}

const PRACTICE_KEY = 'runbook.practice.v1'

/**
 * Practice exam attempts and scores. Kept apart from the game save so a
 * practice exam can never disturb reputation or progress, and vice versa.
 */
export interface PracticeStore {
  attempts: Record<string, Attempt>
  history: Record<string, HistoryEntry[]>
}

export function loadPractice(): PracticeStore {
  const raw = readRaw(PRACTICE_KEY)
  const empty: PracticeStore = { attempts: {}, history: {} }
  if (!raw) return empty
  try {
    const parsed = JSON.parse(raw) as Partial<PracticeStore>
    return {
      attempts: parsed.attempts && typeof parsed.attempts === 'object' ? parsed.attempts : {},
      history: parsed.history && typeof parsed.history === 'object' ? parsed.history : {},
    }
  } catch {
    return empty
  }
}

export function persistPractice(store: PracticeStore): boolean {
  return writeRaw(PRACTICE_KEY, JSON.stringify(store))
}
