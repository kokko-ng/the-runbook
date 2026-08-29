import { describe, expect, it } from 'vitest'

import {
  REP_AFTER_PIP,
  REP_BONUS_UNLOCK,
  REP_START,
  buildTrees,
  createSave,
  migrateSave,
  chapterUnlocked,
  questAvailability,
  readiness,
  reduce,
} from '../src/engine'
import type { Action, ContentIndex, EngineContext, SaveState } from '../src/engine'
import { NOW, index, questById } from './fixtures'

function ctx(questId?: string): EngineContext {
  return { index, quest: questId ? questById(questId) : null, now: NOW }
}

function run(state: SaveState, actions: [Action, string?][]): SaveState {
  let current = state
  for (const [action, questId] of actions) {
    current = reduce(current, action, ctx(questId)).state
  }
  return current
}

function fresh(): SaveState {
  return createSave(index, NOW)
}

describe('a new save', () => {
  it('starts on 50 reputation with nothing unlocked or spent', () => {
    const save = fresh()
    expect(save.rep).toBe(REP_START)
    expect(save.skill_points).toBe(0)
    expect(save.position).toBeNull()
    expect(save.progress.quests_completed).toEqual([])
  })

  it('seeds the diagram from the registry', () => {
    const save = fresh()
    expect(save.diagram.nodes['vnet-hub'].present).toBe(true)
    expect(save.diagram.nodes['vnet-depot'].present).toBe(false)
    expect(save.diagram.edges['e-hub-depot'].present).toBe(false)
  })
})

describe('progression gates', () => {
  it('locks the second chapter until the first is finished', () => {
    const save = fresh()
    expect(questAvailability(save, index, 'q-later').unlocked).toBe(false)
  })

  it('locks a quest until the one before it is done', () => {
    const save = fresh()
    expect(questAvailability(save, index, 'q-design').unlocked).toBe(true)
    expect(questAvailability(save, index, 'q-incident').unlocked).toBe(false)
  })

  it('keeps bonus scenarios shut until reputation is high enough', () => {
    const save = fresh()
    save.progress.quests_completed = ['q-design', 'q-incident']
    save.rep = REP_BONUS_UNLOCK - 1
    expect(questAvailability(save, index, 'q-bonus').unlocked).toBe(false)
    save.rep = REP_BONUS_UNLOCK
    expect(questAvailability(save, index, 'q-bonus').unlocked).toBe(true)
  })

  it('refuses to start a locked quest', () => {
    const result = reduce(fresh(), { type: 'start_quest', quest_id: 'q-incident' }, ctx('q-incident'))
    expect(result.events[0]).toMatchObject({ type: 'rejected' })
    expect(result.state.position).toBeNull()
  })
})

describe('design decisions', () => {
  it('pays reputation and a skill point for a first-try correct answer', () => {
    const state = run(fresh(), [[{ type: 'start_quest', quest_id: 'q-design' }, 'q-design']])
    const result = reduce(state, { type: 'choose', option_id: 'a' }, ctx('q-design'))
    expect(result.state.rep).toBe(REP_START + 6 + 2)
    expect(result.state.skill_points).toBe(1)
    expect(result.state.active?.resolved).toBe(true)
    expect(result.state.progress.objectives).toContain('AZ104-4.1.2')
    expect(result.events.some((event) => event.type === 'encounter_resolve')).toBe(true)
  })

  it('applies the diagram mutation the option declares', () => {
    const state = run(fresh(), [
      [{ type: 'start_quest', quest_id: 'q-design' }, 'q-design'],
      [{ type: 'choose', option_id: 'a' }, 'q-design'],
    ])
    expect(state.diagram.edges['e-hub-depot'].present).toBe(true)
  })

  it('costs reputation for a wrong answer, teaches, and lets you choose again', () => {
    const state = run(fresh(), [[{ type: 'start_quest', quest_id: 'q-design' }, 'q-design']])
    const wrong = reduce(state, { type: 'choose', option_id: 'b' }, ctx('q-design')).state
    expect(wrong.rep).toBe(REP_START - 10)
    expect(wrong.active?.resolved).toBe(false)
    expect(wrong.active?.eliminated).toEqual(['b'])
    const feedback = wrong.active?.log.at(-1)
    expect(feedback).toMatchObject({ kind: 'feedback', correct: false })

    const recovered = reduce(wrong, { type: 'choose', option_id: 'a' }, ctx('q-design')).state
    expect(recovered.active?.outcome).toBe('recovered')
    // No first-try bonus and no skill point once you have already missed.
    expect(recovered.rep).toBe(REP_START - 10 + 6)
    expect(recovered.skill_points).toBe(0)
  })

  it('will not let you pick an option that is already ruled out', () => {
    let state = run(fresh(), [
      [{ type: 'start_quest', quest_id: 'q-design' }, 'q-design'],
      [{ type: 'choose', option_id: 'b' }, 'q-design'],
    ])
    const result = reduce(state, { type: 'choose', option_id: 'b' }, ctx('q-design'))
    expect(result.events[0]).toMatchObject({ type: 'rejected' })
    state = result.state
    expect(state.rep).toBe(REP_START - 10)
  })

  it('moves to the next encounter and finishes the quest', () => {
    const state = run(fresh(), [
      [{ type: 'start_quest', quest_id: 'q-design' }, 'q-design'],
      [{ type: 'choose', option_id: 'a' }, 'q-design'],
      [{ type: 'advance' }, 'q-design'],
    ])
    expect(state.position?.encounter_index).toBe(1)
    expect(state.active?.encounter_id).toBe('b')

    const done = reduce(
      reduce(state, { type: 'choose', option_id: 'a' }, ctx('q-design')).state,
      { type: 'advance' },
      ctx('q-design'),
    )
    expect(done.state.progress.quests_completed).toEqual(['q-design'])
    expect(done.events[0]).toMatchObject({ type: 'quest_complete', quest_id: 'q-design' })
  })

  it('pays nothing the second time around', () => {
    let state = run(fresh(), [
      [{ type: 'start_quest', quest_id: 'q-design' }, 'q-design'],
      [{ type: 'choose', option_id: 'a' }, 'q-design'],
      [{ type: 'advance' }, 'q-design'],
      [{ type: 'choose', option_id: 'a' }, 'q-design'],
      [{ type: 'advance' }, 'q-design'],
    ])
    const repAfterFirstRun = state.rep
    const pointsAfterFirstRun = state.skill_points
    state = run(state, [
      [{ type: 'start_quest', quest_id: 'q-design' }, 'q-design'],
      [{ type: 'choose', option_id: 'b' }, 'q-design'],
      [{ type: 'choose', option_id: 'a' }, 'q-design'],
    ])
    expect(state.rep).toBe(repAfterFirstRun)
    expect(state.skill_points).toBe(pointsAfterFirstRun)
  })
})

describe('incidents', () => {
  function started(): SaveState {
    const save = fresh()
    save.progress.quests_completed = ['q-design']
    return run(save, [[{ type: 'start_quest', quest_id: 'q-incident' }, 'q-incident']])
  }

  it('opens with the ticket and the beat, and the full time budget', () => {
    const state = started()
    expect(state.active?.time_left).toBe(4)
    expect(state.active?.log[0]).toMatchObject({ kind: 'ticket' })
    expect(state.active?.log[1]).toMatchObject({ kind: 'intro' })
  })

  it('gives away dialogue for free and charges for diagnostics', () => {
    let state = started()
    state = reduce(state, { type: 'investigate', id: 'a' }, ctx('q-incident')).state
    expect(state.active?.time_left).toBe(4)
    state = reduce(state, { type: 'command', id: 'b' }, ctx('q-incident')).state
    expect(state.active?.time_left).toBe(2)
    expect(state.active?.log.at(-1)).toMatchObject({ kind: 'command', cost: 2 })
  })

  it('refuses to repeat a command or a question', () => {
    let state = started()
    state = reduce(state, { type: 'command', id: 'a' }, ctx('q-incident')).state
    const again = reduce(state, { type: 'command', id: 'a' }, ctx('q-incident'))
    expect(again.events[0]).toMatchObject({ type: 'rejected' })
    expect(again.state.active?.time_left).toBe(3)
  })

  it('runs out of time and says so', () => {
    let state = started()
    state = reduce(state, { type: 'command', id: 'b' }, ctx('q-incident')).state
    state = reduce(state, { type: 'command', id: 'a' }, ctx('q-incident')).state
    state = reduce(state, { type: 'command', id: 'c' }, ctx('q-incident')).state
    expect(state.active?.time_left).toBe(0)
    const blocked = reduce(state, { type: 'command', id: 'd' }, ctx('q-incident'))
    expect(blocked.events[0]).toMatchObject({ type: 'rejected' })
  })

  it('pays a bonus for clearing under budget', () => {
    let state = started()
    state = reduce(state, { type: 'command', id: 'a' }, ctx('q-incident')).state
    const before = state.rep
    state = reduce(state, { type: 'choose', option_id: 'a' }, ctx('q-incident')).state
    // fix 8 + first try 2 + under budget 3
    expect(state.rep).toBe(before + 13)
    expect(state.skill_points).toBe(2)
  })

  it('charges a wrong fix in both reputation and time', () => {
    let state = started()
    state = reduce(state, { type: 'choose', option_id: 'c' }, ctx('q-incident')).state
    expect(state.rep).toBe(REP_START - 6)
    expect(state.active?.time_left).toBe(3)
    expect(state.active?.eliminated).toEqual(['c'])
  })

  it('pays no under-budget bonus once the clock is gone', () => {
    let state = started()
    for (const id of ['b', 'a', 'c']) {
      state = reduce(state, { type: 'command', id }, ctx('q-incident')).state
    }
    state = reduce(state, { type: 'choose', option_id: 'b' }, ctx('q-incident')).state
    expect(state.active?.time_left).toBe(0)
    const before = state.rep
    state = reduce(state, { type: 'choose', option_id: 'a' }, ctx('q-incident')).state
    expect(state.rep).toBe(before + 8)
  })
})

describe('perks', () => {
  function withPoints(points: number): SaveState {
    const save = fresh()
    save.skill_points = points
    return save
  }

  it('buys and spends skill points', () => {
    const state = reduce(withPoints(2), { type: 'buy_perk', perk: 'rep_shield' }, ctx()).state
    expect(state.skill_points).toBe(0)
    expect(state.perks.rep_shield).toBe(1)
  })

  it('refuses a purchase you cannot afford', () => {
    const result = reduce(withPoints(1), { type: 'buy_perk', perk: 'rep_shield' }, ctx())
    expect(result.events[0]).toMatchObject({ type: 'rejected' })
  })

  it('caps how many of one perk you can ever buy', () => {
    let state = withPoints(50)
    for (let i = 0; i < 10; i += 1) {
      state = reduce(state, { type: 'buy_perk', perk: 'hint' }, ctx()).state
    }
    expect(state.perks_bought.hint).toBe(8)
  })

  it('rules out a wrong option with a hint', () => {
    let state = withPoints(1)
    state = reduce(state, { type: 'buy_perk', perk: 'hint' }, ctx()).state
    state = reduce(state, { type: 'start_quest', quest_id: 'q-design' }, ctx('q-design')).state
    state = reduce(state, { type: 'use_perk', perk: 'hint' }, ctx('q-design')).state
    expect(state.active?.eliminated).toEqual(['b'])
    expect(state.perks.hint).toBe(0)
  })

  it('halves the next hit with a shield and then drops it', () => {
    let state = withPoints(2)
    state = reduce(state, { type: 'buy_perk', perk: 'rep_shield' }, ctx()).state
    state = reduce(state, { type: 'start_quest', quest_id: 'q-design' }, ctx('q-design')).state
    state = reduce(state, { type: 'use_perk', perk: 'rep_shield' }, ctx('q-design')).state
    state = reduce(state, { type: 'choose', option_id: 'b' }, ctx('q-design')).state
    expect(state.rep).toBe(REP_START - 5)
    expect(state.active?.shield).toBe(false)
  })

  it('adds a time unit with overtime, and only on an incident', () => {
    let state = fresh()
    state.skill_points = 2
    state.progress.quests_completed = ['q-design']
    state = reduce(state, { type: 'buy_perk', perk: 'overtime' }, ctx()).state
    state = reduce(state, { type: 'start_quest', quest_id: 'q-incident' }, ctx('q-incident')).state
    state = reduce(state, { type: 'use_perk', perk: 'overtime' }, ctx('q-incident')).state
    expect(state.active?.time_left).toBe(5)

    let design = reduce(withPoints(1), { type: 'buy_perk', perk: 'overtime' }, ctx()).state
    design = reduce(design, { type: 'start_quest', quest_id: 'q-design' }, ctx('q-design')).state
    const rejected = reduce(design, { type: 'use_perk', perk: 'overtime' }, ctx('q-design'))
    expect(rejected.events[0]).toMatchObject({ type: 'rejected' })
  })
})

describe('hitting zero reputation', () => {
  it('puts the player on a plan and rewinds to the checkpoint', () => {
    let state = fresh()
    state.rep = 8
    state = reduce(state, { type: 'start_quest', quest_id: 'q-design' }, ctx('q-design')).state
    const result = reduce(state, { type: 'choose', option_id: 'b' }, ctx('q-design'))
    expect(result.state.rep).toBe(REP_AFTER_PIP)
    expect(result.state.active).toBeNull()
    expect(result.state.position).toMatchObject({ quest_id: 'q-design', encounter_index: 0 })
    expect(result.state.stats.pips).toBe(1)
    expect(result.events.some((event) => event.type === 'pip')).toBe(true)
  })

  it('keeps chapters already cleared, and restarts from the checkpoint quest', () => {
    let state = fresh()
    state.progress.quests_completed = ['q-design']
    state.rep = 5
    state = reduce(state, { type: 'start_quest', quest_id: 'q-incident' }, ctx('q-incident')).state
    const result = reduce(state, { type: 'choose', option_id: 'b' }, ctx('q-incident'))
    expect(result.state.progress.quests_completed).toEqual(['q-design'])
    expect(result.state.position?.quest_id).toBe('q-incident')
  })
})

describe('skill trees', () => {
  it('lights nodes as objectives are cleared', () => {
    let state = fresh()
    expect(buildTrees(index, state)[0].nodes[0].state).toBe('dark')
    state = run(state, [
      [{ type: 'start_quest', quest_id: 'q-design' }, 'q-design'],
      [{ type: 'choose', option_id: 'a' }, 'q-design'],
    ])
    const tree = buildTrees(index, state)[0]
    expect(tree.nodes[0].state).toBe('partial')
    expect(tree.covered).toBe(1)
    expect(readiness(index, state).percent).toBe(33)
  })
})

describe('save migration', () => {
  it('fills in fields an older save never had', () => {
    const old = { ...fresh(), perks: undefined, stats: undefined } as unknown as SaveState
    const migrated = migrateSave(old, index, NOW)
    expect(migrated.perks.hint).toBe(0)
    expect(migrated.stats.pips).toBe(0)
    expect(migrated.content_version).toBe('test')
  })

  it('keeps progress and folds in nodes added by new content', () => {
    const save = fresh()
    save.progress.objectives = ['AZ104-4.1.2']
    delete (save.diagram.nodes as Record<string, unknown>)['vnet-depot']
    const migrated = migrateSave(save, index, NOW)
    expect(migrated.progress.objectives).toEqual(['AZ104-4.1.2'])
    expect(migrated.diagram.nodes['vnet-depot'].present).toBe(false)
  })
})

describe('starting at an act instead of earning it', () => {
  // The shipped content is two acts and two exams; the fixture is one act, so
  // this bolts a second one on rather than reshaping what every other test uses.
  const twoActs: ContentIndex = {
    ...index,
    acts: [
      ...index.acts,
      { id: 'act2', number: 2, exam: 'AZ-305', title: 'The Design Review', tagline: '', chapters: ['act2-identity', 'act2-data'] },
    ],
    chapters: [
      ...index.chapters,
      {
        id: 'act2-identity',
        act: 'act2',
        order: 3,
        domain: 'AZ305-1',
        title: 'Identity and Governance',
        rank: 'junior-cloud-admin',
        blurb: '',
        quests: [
          { id: 'q-a2-first', title: 'First', summary: '', variant: 'core', bonus_of: null, objectives: [], estimated_minutes: 10, encounter_count: 1, encounter_types: ['design'] },
        ],
      },
      {
        id: 'act2-data',
        act: 'act2',
        order: 4,
        domain: 'AZ305-2',
        title: 'Data Platforms',
        rank: 'junior-cloud-admin',
        blurb: '',
        quests: [
          { id: 'q-a2-second', title: 'Second', summary: '', variant: 'core', bonus_of: null, objectives: [], estimated_minutes: 10, encounter_count: 1, encounter_types: ['design'] },
        ],
      },
    ],
  }
  const at = (state: SaveState, action: Action) =>
    reduce(state, action, { index: twoActs, quest: null, now: NOW })

  it('keeps the second act shut until the first one is finished', () => {
    const save = createSave(twoActs, NOW)
    expect(chapterUnlocked(save, twoActs, 'act2-identity')).toBe(false)
  })

  it('opens the act on request without touching the act before it', () => {
    const opened = at(createSave(twoActs, NOW), { type: 'open_act', act: 'act2' }).state
    expect(opened.progress.acts_opened).toEqual(['act2'])
    expect(chapterUnlocked(opened, twoActs, 'act2-identity')).toBe(true)
    // Act 1 is untouched: nothing was completed on the player's behalf.
    expect(opened.progress.quests_completed).toEqual([])
    expect(chapterUnlocked(opened, twoActs, 'act1-monitoring')).toBe(false)
  })

  it('opens the act at its first chapter, not all of it at once', () => {
    const opened = at(createSave(twoActs, NOW), { type: 'open_act', act: 'act2' }).state
    expect(chapterUnlocked(opened, twoActs, 'act2-identity')).toBe(true)
    expect(chapterUnlocked(opened, twoActs, 'act2-data')).toBe(false)
  })

  it('refuses an act that is not in the build, and refuses to open one twice', () => {
    const fresh = createSave(twoActs, NOW)
    expect(at(fresh, { type: 'open_act', act: 'act9' }).events[0]).toMatchObject({ type: 'rejected' })
    const opened = at(fresh, { type: 'open_act', act: 'act2' }).state
    expect(at(opened, { type: 'open_act', act: 'act2' }).events[0]).toMatchObject({ type: 'rejected' })
  })

  it('gives an older save the field rather than throwing it away', () => {
    const old = createSave(twoActs, NOW)
    delete (old.progress as Partial<SaveState['progress']>).acts_opened
    const migrated = migrateSave(old, twoActs, NOW)
    expect(migrated.progress.acts_opened).toEqual([])
    expect(chapterUnlocked(migrated, twoActs, 'act2-identity')).toBe(false)
  })
})
