import { describe, expect, it } from 'vitest'

import { applyAction, createInitialState } from '@/engine/engine'
import { DEFAULT_REWARDS, PERKS, REP_START } from '@/engine/constants'
import type { GameState } from '@/engine/types'

import { bundle, manifest, troubleshoot } from './fixtures'
import { eventsOfType, hasEvent, run } from './helpers'

const start = { type: 'START_QUEST' as const, questId: 'q1' }

function withPoints(points: number): GameState {
  return { ...createInitialState(manifest), skillPoints: points }
}

describe('buying perks', () => {
  it('spends skill points and adds to the inventory', () => {
    const { state, events } = run(
      bundle(),
      [{ type: 'BUY_PERK', perk: 'hint' }],
      withPoints(3),
    )

    expect(state.skillPoints).toBe(3 - PERKS.hint.cost)
    expect(state.perksOwned.hint).toBe(1)
    expect(eventsOfType(events, 'perk_bought')[0]?.owned).toBe(1)
  })

  it('refuses a purchase the player cannot afford', () => {
    const content = bundle()
    const broke = withPoints(0)
    const result = applyAction(broke, content, { type: 'BUY_PERK', perk: 'repShield' })

    expect(result.state).toBe(broke)
    expect(hasEvent(result.events, 'rejected')).toBe(true)
  })

  it('refuses a purchase past the cap', () => {
    const content = bundle()
    const rich = withPoints(20)
    const atCap = run(
      content,
      Array.from({ length: PERKS.hint.cap }, () => ({ type: 'BUY_PERK' as const, perk: 'hint' as const })),
      rich,
    )
    expect(atCap.state.perksOwned.hint).toBe(PERKS.hint.cap)

    const overCap = applyAction(atCap.state, content, { type: 'BUY_PERK', perk: 'hint' })
    expect(overCap.state).toBe(atCap.state)
    expect(hasEvent(overCap.events, 'rejected')).toBe(true)
  })
})

describe('hint', () => {
  it('eliminates the first remaining wrong option in authored order', () => {
    const { state, events } = run(
      bundle(),
      [{ type: 'BUY_PERK', perk: 'hint' }, start, { type: 'USE_PERK', perk: 'hint' }],
      withPoints(1),
    )

    const eliminated = eventsOfType(events, 'option_eliminated')[0]
    expect(eliminated?.optionId).toBe('wrong-a')
    expect(eliminated?.reason).toBe('hint')
    expect(state.perksOwned.hint).toBe(0)
  })

  it('is deterministic: the same starting state always eliminates the same option', () => {
    const twice = [0, 1].map(
      () =>
        run(
          bundle(),
          [{ type: 'BUY_PERK', perk: 'hint' }, start, { type: 'USE_PERK', perk: 'hint' }],
          withPoints(1),
        ).state.encounter.eliminatedOptionIds,
    )
    expect(twice[0]).toEqual(twice[1])
  })

  it('skips an option the player already ruled out', () => {
    const { events } = run(
      bundle(),
      [
        { type: 'BUY_PERK', perk: 'hint' },
        start,
        { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
        { type: 'USE_PERK', perk: 'hint' },
      ],
      withPoints(1),
    )

    const byHint = eventsOfType(events, 'option_eliminated').find(
      (event) => event.reason === 'hint',
    )
    expect(byHint?.optionId).toBe('wrong-b')
  })

  it('may only be used once per encounter', () => {
    const content = bundle()
    const used = run(
      content,
      [
        { type: 'BUY_PERK', perk: 'hint' },
        { type: 'BUY_PERK', perk: 'hint' },
        start,
        { type: 'USE_PERK', perk: 'hint' },
      ],
      withPoints(2),
    )
    const again = applyAction(used.state, content, { type: 'USE_PERK', perk: 'hint' })

    expect(again.state).toBe(used.state)
    expect(hasEvent(again.events, 'rejected')).toBe(true)
    expect(used.state.perksOwned.hint).toBe(1)
  })

  it('refuses when the player owns none', () => {
    const content = bundle()
    const started = run(content, [start])
    const result = applyAction(started.state, content, { type: 'USE_PERK', perk: 'hint' })

    expect(result.state).toBe(started.state)
    expect(hasEvent(result.events, 'rejected')).toBe(true)
  })
})

describe('overtime', () => {
  const incident = () => bundle({ entry: 'e-inc', encounters: [troubleshoot()] })

  it('adds one time unit to the incident', () => {
    const { state } = run(
      incident(),
      [{ type: 'BUY_PERK', perk: 'overtime' }, start, { type: 'USE_PERK', perk: 'overtime' }],
      withPoints(1),
    )
    expect(state.encounter.timeRemaining).toBe(5)
  })

  it('is refused outside a troubleshooting encounter', () => {
    const content = bundle()
    const started = run(
      content,
      [{ type: 'BUY_PERK', perk: 'overtime' }, start],
      withPoints(1),
    )
    const result = applyAction(started.state, content, { type: 'USE_PERK', perk: 'overtime' })

    expect(result.state).toBe(started.state)
    expect(hasEvent(result.events, 'rejected')).toBe(true)
  })

  it('may only be claimed once per incident', () => {
    const content = incident()
    const used = run(
      content,
      [
        { type: 'BUY_PERK', perk: 'overtime' },
        { type: 'BUY_PERK', perk: 'overtime' },
        start,
        { type: 'USE_PERK', perk: 'overtime' },
      ],
      withPoints(2),
    )
    const again = applyAction(used.state, content, { type: 'USE_PERK', perk: 'overtime' })

    expect(hasEvent(again.events, 'rejected')).toBe(true)
    expect(used.state.encounter.timeRemaining).toBe(5)
  })
})

describe('rep shield', () => {
  it('halves the next reputation loss and is then spent', () => {
    const { state } = run(
      bundle(),
      [
        { type: 'BUY_PERK', perk: 'repShield' },
        start,
        { type: 'USE_PERK', perk: 'repShield' },
        { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
      ],
      withPoints(2),
    )

    const full = DEFAULT_REWARDS.design_decision.repPenalty
    expect(state.rep).toBe(REP_START - Math.floor(full / 2))
    expect(state.armed.repShield).toBe(false)
  })

  it('reports the loss as shielded', () => {
    const { events } = run(
      bundle(),
      [
        { type: 'BUY_PERK', perk: 'repShield' },
        start,
        { type: 'USE_PERK', perk: 'repShield' },
        { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
      ],
      withPoints(2),
    )
    expect(eventsOfType(events, 'rep_changed')[0]?.shielded).toBe(true)
  })

  it('protects only one loss', () => {
    const { state } = run(
      bundle(),
      [
        { type: 'BUY_PERK', perk: 'repShield' },
        start,
        { type: 'USE_PERK', perk: 'repShield' },
        { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
        { type: 'CHOOSE_OPTION', optionId: 'wrong-b' },
      ],
      withPoints(2),
    )

    const full = DEFAULT_REWARDS.design_decision.repPenalty
    expect(state.rep).toBe(REP_START - Math.floor(full / 2) - full)
  })

  it('does not reduce a reputation gain', () => {
    const { state } = run(
      bundle(),
      [
        { type: 'BUY_PERK', perk: 'repShield' },
        start,
        { type: 'USE_PERK', perk: 'repShield' },
        { type: 'CHOOSE_OPTION', optionId: 'right' },
      ],
      withPoints(2),
    )

    expect(state.rep).toBe(REP_START + DEFAULT_REWARDS.design_decision.repBonus)
    expect(state.armed.repShield).toBe(true)
  })

  it('refuses to arm a second shield while one is active', () => {
    const content = bundle()
    const armed = run(
      content,
      [
        { type: 'BUY_PERK', perk: 'repShield' },
        { type: 'BUY_PERK', perk: 'repShield' },
        start,
        { type: 'USE_PERK', perk: 'repShield' },
      ],
      withPoints(4),
    )
    const again = applyAction(armed.state, content, { type: 'USE_PERK', perk: 'repShield' })

    expect(hasEvent(again.events, 'rejected')).toBe(true)
    expect(armed.state.perksOwned.repShield).toBe(1)
  })
})
