import { describe, expect, it } from 'vitest'

import { applyAction, createInitialState } from '@/engine/engine'
import {
  REP_AFTER_PIP,
  REP_BONUS_THRESHOLD,
  REP_MAX,
  REP_MIN,
  REP_START,
} from '@/engine/constants'
import type { GameState } from '@/engine/types'

import { bundle, decision, manifest, troubleshoot } from './fixtures'
import { eventsOfType, hasEvent, nodeStatus, run } from './helpers'

const start = { type: 'START_QUEST' as const, questId: 'q1' }

function withRep(rep: number): GameState {
  return { ...createInitialState(manifest), rep }
}

describe('reputation bounds', () => {
  it('clamps at the ceiling', () => {
    const { state } = run(
      bundle(),
      [start, { type: 'CHOOSE_OPTION', optionId: 'right' }],
      withRep(98),
    )
    expect(state.rep).toBe(REP_MAX)
  })

  it('does not fall below zero', () => {
    const { state } = run(
      bundle(),
      [start, { type: 'CHOOSE_OPTION', optionId: 'wrong-a' }],
      withRep(3),
    )
    expect(state.rep).toBe(REP_MIN)
  })
})

describe('bonus unlock', () => {
  it('latches once reputation reaches the threshold', () => {
    const { state, events } = run(
      bundle(),
      [start, { type: 'CHOOSE_OPTION', optionId: 'right' }],
      withRep(REP_BONUS_THRESHOLD - 2),
    )

    expect(state.bonusUnlocked).toBe(true)
    expect(hasEvent(events, 'bonus_unlocked')).toBe(true)
  })

  it('stays unlocked after reputation falls back below the threshold', () => {
    const content = bundle({
      encounters: [decision({ id: 'e1', next: 'e2' }), decision({ id: 'e2', next: 'END' })],
    })
    const { state } = run(
      content,
      [
        start,
        { type: 'CHOOSE_OPTION', optionId: 'right' },
        { type: 'ADVANCE' },
        { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
      ],
      withRep(REP_BONUS_THRESHOLD - 2),
    )

    expect(state.rep).toBeLessThan(REP_BONUS_THRESHOLD)
    expect(state.bonusUnlocked).toBe(true)
  })

  it('does not fire twice', () => {
    const content = bundle({
      encounters: [decision({ id: 'e1', next: 'e2' }), decision({ id: 'e2', next: 'END' })],
    })
    const { events } = run(
      content,
      [
        start,
        { type: 'CHOOSE_OPTION', optionId: 'right' },
        { type: 'ADVANCE' },
        { type: 'CHOOSE_OPTION', optionId: 'right' },
      ],
      withRep(REP_BONUS_THRESHOLD - 2),
    )
    expect(eventsOfType(events, 'bonus_unlocked')).toHaveLength(1)
  })
})

describe('performance improvement plan', () => {
  const twoEncounters = () =>
    bundle({
      encounters: [
        decision({ id: 'e1', objectives: ['OBJ-1'], next: 'e-inc' }),
        troubleshoot({ id: 'e-inc', objectives: ['OBJ-2'], next: 'END' }),
      ],
    })

  it('puts the player on a PIP when reputation hits zero', () => {
    const { state, events } = run(
      bundle(),
      [start, { type: 'CHOOSE_OPTION', optionId: 'wrong-a' }],
      withRep(4),
    )

    expect(state.rep).toBe(0)
    expect(state.phase).toBe('pip')
    expect(eventsOfType(events, 'pip')[0]?.rep).toBe(0)
  })

  it('restores the checkpoint with reputation reset', () => {
    const { state, events } = run(
      bundle(),
      [
        start,
        { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
        { type: 'RESTART_CHECKPOINT' },
      ],
      withRep(4),
    )

    expect(state.rep).toBe(REP_AFTER_PIP)
    expect(state.encounterId).toBe('e1')
    expect(state.phase).toBe('scenario')
    expect(hasEvent(events, 'checkpoint_restored')).toBe(true)
  })

  it('reverts the diagram to its checkpoint state', () => {
    const content = twoEncounters()
    const broken = run(content, [
      start,
      { type: 'CHOOSE_OPTION', optionId: 'right' }, // sets vnet-hub warning
      { type: 'ADVANCE' }, // incident entry sets vnet-spoke broken
    ])
    expect(nodeStatus(broken.state, 'vnet-hub')).toBe('warning')
    expect(nodeStatus(broken.state, 'vnet-spoke')).toBe('broken')

    const pipped = run(
      content,
      [{ type: 'ENTER_PHASE', phase: 'fix' }, { type: 'CHOOSE_OPTION', optionId: 'fix-wrong' }],
      { ...broken.state, rep: 4 },
    )
    expect(pipped.state.phase).toBe('pip')

    const restored = applyAction(pipped.state, content, { type: 'RESTART_CHECKPOINT' })
    expect(nodeStatus(restored.state, 'vnet-hub')).toBe('healthy')
    expect(nodeStatus(restored.state, 'vnet-spoke')).toBe('healthy')
  })

  it('rolls back objectives cleared since the checkpoint', () => {
    const content = twoEncounters()
    const progressed = run(content, [
      start,
      { type: 'CHOOSE_OPTION', optionId: 'right' },
      { type: 'ADVANCE' },
    ])
    expect(progressed.state.clearedObjectiveIds).toEqual(['OBJ-1'])

    const pipped = run(
      content,
      [{ type: 'ENTER_PHASE', phase: 'fix' }, { type: 'CHOOSE_OPTION', optionId: 'fix-wrong' }],
      { ...progressed.state, rep: 4 },
    )
    const restored = applyAction(pipped.state, content, { type: 'RESTART_CHECKPOINT' })

    expect(restored.state.clearedObjectiveIds).toEqual([])
    expect(restored.state.encounterId).toBe('e1')
  })

  it('keeps the checkpoint so a second PIP is survivable', () => {
    const content = bundle()
    const first = run(
      content,
      [
        start,
        { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
        { type: 'RESTART_CHECKPOINT' },
      ],
      withRep(4),
    )
    expect(first.state.checkpoint).not.toBeNull()

    const second = run(
      content,
      [
        { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
        { type: 'RESTART_CHECKPOINT' },
      ],
      { ...first.state, rep: 4 },
    )
    expect(second.state.rep).toBe(REP_AFTER_PIP)
    expect(second.state.encounterId).toBe('e1')
  })

  it('bounds reputation loss in one encounter by the number of wrong options', () => {
    // Every wrong pick removes that option, so an encounter cannot be farmed
    // for losses - the player runs out of wrong answers before rep runs out.
    const { state } = run(bundle(), [
      start,
      { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
      { type: 'CHOOSE_OPTION', optionId: 'wrong-b' },
      { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
    ])

    expect(state.rep).toBe(REP_START - 8 - 8)
    expect(state.encounter.eliminatedOptionIds).toEqual(['wrong-a', 'wrong-b'])
  })

  it('refuses a restart when the player is not on a PIP', () => {
    const content = bundle()
    const started = run(content, [start])
    const result = applyAction(started.state, content, { type: 'RESTART_CHECKPOINT' })

    expect(result.state).toBe(started.state)
    expect(hasEvent(result.events, 'rejected')).toBe(true)
  })

  it('does not nest checkpoints inside the restored snapshot', () => {
    const { state } = run(
      bundle(),
      [
        start,
        { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
        { type: 'RESTART_CHECKPOINT' },
      ],
      withRep(4),
    )

    const snapshot = JSON.parse(state.checkpoint!)
    expect(snapshot.checkpoint).toBeNull()
  })

  it('keeps perks and skill points earned before the checkpoint', () => {
    const content = bundle()
    const equipped: GameState = {
      ...createInitialState(manifest),
      rep: 4,
      skillPoints: 2,
      perksOwned: { hint: 1, overtime: 0, repShield: 0 },
    }
    const { state } = run(content, [
      start,
      { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
      { type: 'RESTART_CHECKPOINT' },
    ], equipped)

    expect(state.skillPoints).toBe(2)
    expect(state.perksOwned.hint).toBe(1)
  })
})
