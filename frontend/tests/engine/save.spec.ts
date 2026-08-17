import { describe, expect, it } from 'vitest'

import { SAVE_SCHEMA_VERSION } from '@/engine/constants'
import { createInitialState } from '@/engine/engine'
import { SaveIncompatibleError, isSaveBlob, migrate, serialize } from '@/engine/save'

import { manifest } from './fixtures'

describe('save serialization', () => {
  it('round-trips a state through JSON unchanged', () => {
    const state = createInitialState(manifest)
    const blob = serialize(state, '2026-08-17T00:00:00Z')
    const restored = migrate(JSON.parse(JSON.stringify(blob)))

    expect(restored).toEqual(state)
  })

  it('stamps the current schema version', () => {
    const blob = serialize(createInitialState(manifest), '2026-08-17T00:00:00Z')
    expect(blob.schemaVersion).toBe(SAVE_SCHEMA_VERSION)
  })

  it('refuses a save from a newer build', () => {
    const blob = serialize(createInitialState(manifest), '2026-08-17T00:00:00Z')
    blob.schemaVersion = SAVE_SCHEMA_VERSION + 1

    expect(() => migrate(blob)).toThrow(SaveIncompatibleError)
  })

  it('refuses a save whose version has no migration path', () => {
    const blob = serialize(createInitialState(manifest), '2026-08-17T00:00:00Z')
    blob.schemaVersion = 0

    expect(() => migrate(blob)).toThrow(SaveIncompatibleError)
  })
})

describe('save validation', () => {
  it('accepts a real blob', () => {
    expect(isSaveBlob(serialize(createInitialState(manifest), 'now'))).toBe(true)
  })

  it.each([null, undefined, 42, 'a string', {}, { schemaVersion: 1 }, { state: {} }])(
    'rejects %p',
    (value) => {
      expect(isSaveBlob(value)).toBe(false)
    },
  )

  it('rejects a blob whose state is missing required fields', () => {
    expect(isSaveBlob({ schemaVersion: 1, state: { rep: 50 } })).toBe(false)
  })
})
