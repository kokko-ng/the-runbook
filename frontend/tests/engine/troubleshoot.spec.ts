import { describe, expect, it } from 'vitest'

import { applyAction } from '@/engine/engine'
import { DEFAULT_REWARDS, REP_START } from '@/engine/constants'

import { bundle, troubleshoot } from './fixtures'
import { edgeStatus, eventsOfType, hasEvent, nodeStatus, run } from './helpers'

const incident = () => bundle({ entry: 'e-inc', encounters: [troubleshoot()] })

const start = { type: 'START_QUEST' as const, questId: 'q1' }

describe('troubleshoot: entry', () => {
  it('opens in the investigate phase with the time budget loaded', () => {
    const { state, events } = run(incident(), [start])

    expect(state.phase).toBe('investigate')
    expect(state.encounter.timeRemaining).toBe(4)
    expect(eventsOfType(events, 'encounter_entered')[0]?.encounterType).toBe('troubleshoot')
  })

  it('applies on-entry diagram ops so the map shows the breakage', () => {
    const { state } = run(incident(), [start])
    expect(nodeStatus(state, 'vnet-spoke')).toBe('broken')
  })
})

describe('troubleshoot: investigate', () => {
  it('reveals authored information and remembers what was followed up', () => {
    const { state, events } = run(incident(), [
      start,
      { type: 'RUN_INVESTIGATE', actionId: 'inv-a' },
    ])

    const revealed = eventsOfType(events, 'investigated')[0]
    expect(revealed?.reveals).toBe('They changed a peering.')
    expect(revealed?.speaker).toBe('noc')
    expect(state.encounter.revealedActionIds).toEqual(['inv-a'])
    expect(state.encounter.timeRemaining).toBe(4)
  })

  it('charges time for investigations that cost it', () => {
    const { state } = run(incident(), [start, { type: 'RUN_INVESTIGATE', actionId: 'inv-b' }])
    expect(state.encounter.timeRemaining).toBe(3)
  })

  it('refuses to repeat an investigation', () => {
    const content = incident()
    const once = run(content, [start, { type: 'RUN_INVESTIGATE', actionId: 'inv-a' }])
    const twice = applyAction(once.state, content, {
      type: 'RUN_INVESTIGATE',
      actionId: 'inv-a',
    })

    expect(twice.state).toBe(once.state)
    expect(hasEvent(twice.events, 'rejected')).toBe(true)
  })

  it('refuses commands before reaching the diagnose phase', () => {
    const content = incident()
    const started = run(content, [start])
    const result = applyAction(started.state, content, {
      type: 'RUN_COMMAND',
      commandId: 'cmd-cheap',
    })

    expect(result.state).toBe(started.state)
    expect(hasEvent(result.events, 'rejected')).toBe(true)
  })
})

describe('troubleshoot: diagnose', () => {
  it('returns authored output and charges the command time cost', () => {
    const { state, events } = run(incident(), [
      start,
      { type: 'ENTER_PHASE', phase: 'diagnose' },
      { type: 'RUN_COMMAND', commandId: 'cmd-cheap' },
    ])

    const ran = eventsOfType(events, 'command_ran')[0]
    expect(ran?.command).toBe('az network vnet peering list')
    expect(ran?.output).toBe('Initiated')
    expect(state.encounter.timeRemaining).toBe(3)
  })

  it('refuses to run the same command twice', () => {
    const content = incident()
    const once = run(content, [
      start,
      { type: 'ENTER_PHASE', phase: 'diagnose' },
      { type: 'RUN_COMMAND', commandId: 'cmd-cheap' },
    ])
    const twice = applyAction(once.state, content, {
      type: 'RUN_COMMAND',
      commandId: 'cmd-cheap',
    })

    expect(twice.state).toBe(once.state)
    expect(hasEvent(twice.events, 'rejected')).toBe(true)
  })

  it('emits time_exhausted and blocks further commands once the budget runs out', () => {
    const content = incident()
    const spent = run(content, [
      start,
      { type: 'ENTER_PHASE', phase: 'diagnose' },
      { type: 'RUN_COMMAND', commandId: 'cmd-cheap' }, // 4 -> 3
      { type: 'RUN_COMMAND', commandId: 'cmd-dear' }, // 3 -> 0
    ])

    expect(spent.state.encounter.timeRemaining).toBe(0)
    expect(hasEvent(spent.events, 'time_exhausted')).toBe(true)

    const blocked = applyAction(spent.state, content, {
      type: 'RUN_COMMAND',
      commandId: 'cmd-cheap',
    })
    expect(hasEvent(blocked.events, 'rejected')).toBe(true)
  })

  it('allows going back to investigate from diagnose', () => {
    const { state } = run(incident(), [
      start,
      { type: 'ENTER_PHASE', phase: 'diagnose' },
      { type: 'ENTER_PHASE', phase: 'investigate' },
    ])
    expect(state.phase).toBe('investigate')
  })

  it('refuses an illegal phase move', () => {
    const content = incident()
    const started = run(content, [start])
    const result = applyAction(started.state, content, {
      type: 'ENTER_PHASE',
      phase: 'resolved',
    })

    expect(result.state).toBe(started.state)
    expect(hasEvent(result.events, 'rejected')).toBe(true)
  })
})

describe('troubleshoot: fix', () => {
  it('pays the under-budget bonus on a clean fix with time left', () => {
    const { state, events } = run(incident(), [
      start,
      { type: 'ENTER_PHASE', phase: 'fix' },
      { type: 'CHOOSE_OPTION', optionId: 'fix-right' },
    ])

    const { repBonus, underBudgetBonus } = DEFAULT_REWARDS.troubleshoot
    expect(state.rep).toBe(REP_START + repBonus + underBudgetBonus)
    expect(state.skillPoints).toBe(1)

    const cleared = eventsOfType(events, 'encounter_cleared')[0]
    expect(cleared?.firstTry).toBe(true)
    expect(cleared?.underBudget).toBe(true)
    expect(edgeStatus(state, 'peer')).toBe('healthy')
  })

  it('costs rep and a time unit on a wrong fix, then allows a retry', () => {
    const { state } = run(incident(), [
      start,
      { type: 'ENTER_PHASE', phase: 'fix' },
      { type: 'CHOOSE_OPTION', optionId: 'fix-wrong' },
    ])

    expect(state.rep).toBe(REP_START - DEFAULT_REWARDS.troubleshoot.repPenalty)
    expect(state.encounter.timeRemaining).toBe(3)
    expect(state.encounter.eliminatedOptionIds).toEqual(['fix-wrong'])
    expect(state.phase).toBe('fix')
  })

  it('withholds the under-budget bonus when the budget is overspent', () => {
    const content = incident()
    const overspent = run(content, [
      start,
      { type: 'ENTER_PHASE', phase: 'diagnose' },
      { type: 'RUN_COMMAND', commandId: 'cmd-cheap' },
      { type: 'RUN_COMMAND', commandId: 'cmd-dear' },
      { type: 'ENTER_PHASE', phase: 'fix' },
      { type: 'CHOOSE_OPTION', optionId: 'fix-wrong' }, // 0 -> -1
      { type: 'CHOOSE_OPTION', optionId: 'fix-right' },
    ])

    expect(overspent.state.encounter.timeRemaining).toBe(-1)
    const cleared = eventsOfType(overspent.events, 'encounter_cleared')[0]
    expect(cleared?.underBudget).toBe(false)
    expect(cleared?.firstTry).toBe(false)
  })

  it('still resolves the incident when time has run out', () => {
    const { state } = run(incident(), [
      start,
      { type: 'ENTER_PHASE', phase: 'diagnose' },
      { type: 'RUN_COMMAND', commandId: 'cmd-cheap' },
      { type: 'RUN_COMMAND', commandId: 'cmd-dear' },
      { type: 'ENTER_PHASE', phase: 'fix' },
      { type: 'CHOOSE_OPTION', optionId: 'fix-right' },
    ])

    expect(state.phase).toBe('resolved')
    expect(edgeStatus(state, 'peer')).toBe('healthy')
  })
})
