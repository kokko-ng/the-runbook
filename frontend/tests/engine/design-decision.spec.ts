import { describe, expect, it } from 'vitest'

import { applyAction, createInitialState, remainingOptions } from '@/engine/engine'
import { DEFAULT_REWARDS, REP_START } from '@/engine/constants'

import { bundle, decision, knowledge, manifest } from './fixtures'
import { eventsOfType, hasEvent, nodeStatus, run } from './helpers'

describe('design decision', () => {
  it('rewards a first-pick-correct answer with rep and a skill point', () => {
    const { state, events } = run(bundle(), [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'right' },
    ])

    expect(state.rep).toBe(REP_START + DEFAULT_REWARDS.design_decision.repBonus)
    expect(state.skillPoints).toBe(1)
    expect(state.phase).toBe('resolved')
    expect(eventsOfType(events, 'encounter_cleared')[0]?.firstTry).toBe(true)
  })

  it('costs rep and eliminates the option on a wrong pick, then allows a retry', () => {
    const content = bundle()
    const { state, events } = run(content, [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
    ])

    expect(state.rep).toBe(REP_START - DEFAULT_REWARDS.design_decision.repPenalty)
    expect(state.encounter.eliminatedOptionIds).toEqual(['wrong-a'])
    expect(state.phase).toBe('scenario')

    const explanation = eventsOfType(events, 'explanation')[0]
    expect(explanation?.correct).toBe(false)
    expect(explanation?.text).toBe('Not that.')
    expect(explanation?.consequence).toBe('It goes badly.')

    // The wrong option is gone from what the player may pick next.
    const encounter = content.quest.encounters[0]!
    expect(remainingOptions(encounter, state).map((option) => option.id)).toEqual([
      'right',
      'wrong-b',
    ])
  })

  it('clears without bonus rep or a skill point after a wrong pick', () => {
    const { state } = run(bundle(), [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
      { type: 'CHOOSE_OPTION', optionId: 'right' },
    ])

    expect(state.rep).toBe(REP_START - DEFAULT_REWARDS.design_decision.repPenalty)
    expect(state.skillPoints).toBe(0)
    expect(state.phase).toBe('resolved')
  })

  it('refuses an option that has already been ruled out', () => {
    const content = bundle()
    const first = run(content, [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
    ])
    const result = applyAction(first.state, content, {
      type: 'CHOOSE_OPTION',
      optionId: 'wrong-a',
    })

    expect(result.state).toBe(first.state)
    expect(hasEvent(result.events, 'rejected')).toBe(true)
  })

  it('applies the winning option diagram ops only', () => {
    const { state } = run(bundle(), [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
    ])
    expect(nodeStatus(state, 'vnet-hub')).toBe('healthy')

    const { state: after } = run(bundle(), [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'right' },
    ])
    expect(nodeStatus(after, 'vnet-hub')).toBe('warning')
  })

  it('honours an option-level rep override in both directions', () => {
    const content = bundle({
      encounters: [
        decision({
          options: [
            {
              id: 'wrong-a',
              label: 'Wrong',
              correct: false,
              explain: 'No.',
              rep: 15,
              diagramOps: [],
            },
            {
              id: 'right',
              label: 'Right',
              correct: true,
              explain: 'Yes.',
              rep: 12,
              diagramOps: [],
            },
          ],
        }),
      ],
    })

    // A positive `rep` on a wrong option is still a loss of that magnitude.
    const wrong = run(content, [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
    ])
    expect(wrong.state.rep).toBe(REP_START - 15)

    const right = run(content, [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'right' },
    ])
    expect(right.state.rep).toBe(REP_START + 12)
  })

  it('honours encounter-level reward overrides', () => {
    const content = bundle({
      encounters: [decision({ rewards: { repBonus: 20, skillPoints: 3 } })],
    })
    const { state } = run(content, [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'right' },
    ])

    expect(state.rep).toBe(REP_START + 20)
    expect(state.skillPoints).toBe(3)
  })

  it('lights a cluster only when all of its objectives are cleared', () => {
    const content = bundle({
      entry: 'e1',
      encounters: [
        decision({ id: 'e1', objectives: ['OBJ-1'], next: 'e2' }),
        decision({ id: 'e2', objectives: ['OBJ-2'], next: 'END' }),
      ],
    })

    const partial = run(content, [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'right' },
    ])
    expect(partial.state.clearedObjectiveIds).toEqual(['OBJ-1'])
    expect(partial.state.litClusterIds).toEqual([])

    const full = run(
      content,
      [{ type: 'ADVANCE' }, { type: 'CHOOSE_OPTION', optionId: 'right' }],
      partial.state,
    )
    expect(full.state.litClusterIds).toEqual(['cluster-a'])
    expect(eventsOfType(full.events, 'cluster_lit')[0]?.title).toBe('Cluster A')
  })

  it('records every choice in history for the save', () => {
    const { state } = run(bundle(), [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'wrong-a' },
      { type: 'CHOOSE_OPTION', optionId: 'right' },
    ])

    expect(state.history).toEqual([
      { questId: 'q1', encounterId: 'e1', action: 'CHOOSE_OPTION', choiceId: 'wrong-a', correct: false },
      { questId: 'q1', encounterId: 'e1', action: 'CHOOSE_OPTION', choiceId: 'right', correct: true },
    ])
  })

  it('never mutates the state it was given', () => {
    const content = bundle()
    const before = createInitialState(manifest)
    const snapshot = JSON.stringify(before)

    applyAction(before, content, { type: 'START_QUEST', questId: 'q1' })

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('advances to the next encounter and finishes the quest at END', () => {
    const content = bundle({
      encounters: [decision({ id: 'e1', next: 'e2' }), decision({ id: 'e2', next: 'END' })],
    })
    const { state, events } = run(content, [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'right' },
      { type: 'ADVANCE' },
      { type: 'CHOOSE_OPTION', optionId: 'right' },
      { type: 'ADVANCE' },
    ])

    expect(state.phase).toBe('quest_complete')
    expect(state.completedQuestIds).toEqual(['q1'])
    expect(hasEvent(events, 'quest_completed')).toBe(true)
  })

  it('refuses to advance before the encounter resolves', () => {
    const content = bundle()
    const started = run(content, [{ type: 'START_QUEST', questId: 'q1' }])
    const result = applyAction(started.state, content, { type: 'ADVANCE' })

    expect(result.state).toBe(started.state)
    expect(hasEvent(result.events, 'rejected')).toBe(true)
  })
})

describe('knowledge check', () => {
  it('uses its own smaller rep values and grants no skill point', () => {
    const { state } = run(bundle({ entry: 'e-quiz', encounters: [knowledge()] }), [
      { type: 'START_QUEST', questId: 'q1' },
      { type: 'CHOOSE_OPTION', optionId: 'no' },
    ])

    expect(state.rep).toBe(REP_START + DEFAULT_REWARDS.knowledge_check.repBonus)
    expect(state.skillPoints).toBe(0)
  })
})
