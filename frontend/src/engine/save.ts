/**
 * Save serialization and schema migration.
 *
 * The blob written here is the same one that syncs to the server when an
 * account exists, so its shape is a contract: bump `SAVE_SCHEMA_VERSION` and add
 * a migration whenever `GameState` changes in a way an old save cannot satisfy.
 */

import { SAVE_SCHEMA_VERSION } from './constants'
import type { GameState } from './types'

export interface SaveBlob {
  schemaVersion: number
  state: GameState
  updatedAt: string
}

type Migration = (state: Record<string, unknown>) => Record<string, unknown>

/**
 * Keyed by the version being migrated *from*. Version 1 is the first shipped
 * schema, so this is empty until the first breaking change.
 */
const MIGRATIONS: Record<number, Migration> = {}

export function serialize(state: GameState, updatedAt: string): SaveBlob {
  return { schemaVersion: SAVE_SCHEMA_VERSION, state, updatedAt }
}

export class SaveIncompatibleError extends Error {}

/**
 * Bring a stored blob up to the current schema. Throws when the save comes from
 * a newer build than this one, which is recoverable only by updating the app.
 */
export function migrate(blob: SaveBlob): GameState {
  let version = blob.schemaVersion
  let state = blob.state as unknown as Record<string, unknown>

  if (version > SAVE_SCHEMA_VERSION) {
    throw new SaveIncompatibleError(
      `save is version ${version}, this build understands up to ${SAVE_SCHEMA_VERSION}`,
    )
  }

  while (version < SAVE_SCHEMA_VERSION) {
    const migration = MIGRATIONS[version]
    if (!migration) {
      throw new SaveIncompatibleError(`no migration from save version ${version}`)
    }
    state = migration(state)
    version += 1
  }

  const migrated = state as unknown as GameState
  migrated.schemaVersion = SAVE_SCHEMA_VERSION
  return migrated
}

/** Structural check for anything claiming to be a save. */
export function isSaveBlob(value: unknown): value is SaveBlob {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.schemaVersion !== 'number') return false
  const state = candidate.state
  if (typeof state !== 'object' || state === null) return false
  const gameState = state as Record<string, unknown>
  return typeof gameState.rep === 'number' && typeof gameState.questId === 'string'
}
