import { describe, expect, it } from 'vitest'

import { buildFeedbackContext, FEEDBACK_CATEGORIES } from '../src/lib/feedback'
import { createSave, reduce } from '../src/engine'
import type { SaveState } from '../src/engine'
import { NOW, incident, index } from './fixtures'

function ctx(quest = incident) {
  return { index, quest, now: NOW }
}

function midIncident(): SaveState {
  let state = createSave(index, NOW)
  state.progress.quests_completed = ['q-design']
  state = reduce(state, { type: 'start_quest', quest_id: 'q-incident' }, ctx()).state
  state = reduce(state, { type: 'investigate', id: 'a' }, ctx()).state
  state = reduce(state, { type: 'command', id: 'b' }, ctx()).state
  state = reduce(state, { type: 'choose', option_id: 'c' }, ctx()).state
  return state
}

function snapshot(save: SaveState) {
  return {
    route: { path: '/play/q-incident', name: 'play' },
    save,
    quest: incident,
    encounter: incident.encounters[0],
    contentVersion: 'test-version',
    theme: 'dark',
    signedIn: false,
    viewport: { width: 390, height: 844 },
  }
}

describe('the feedback context', () => {
  it('records which page the report came from', () => {
    const context = buildFeedbackContext(snapshot(midIncident()))
    expect(context.route).toBe('/play/q-incident')
    expect(context.route_name).toBe('play')
    expect(context.content_version).toBe('test-version')
    expect(context.viewport).toEqual({ width: 390, height: 844 })
    expect(context.theme).toBe('dark')
  })

  it('records which quest and encounter the player was looking at', () => {
    const context = buildFeedbackContext(snapshot(midIncident()))
    expect(context.quest_id).toBe('q-incident')
    expect(context.quest_title).toBe('Scanners Offline')
    expect(context.chapter).toBe('act1-networking')
    expect(context.encounter_id).toBe('a')
    expect(context.encounter_type).toBe('troubleshoot')
    expect(context.objectives).toEqual(['AZ104-4.1.5'])
  })

  it('records the state of the attempt, which is what makes a report reproducible', () => {
    const context = buildFeedbackContext(snapshot(midIncident()))
    expect(context.run).toMatchObject({
      attempts: 1,
      ruled_out: 1,
      revealed: 1,
      commands_run: 1,
      time_left: 1,
      time_budget: 4,
      resolved: false,
    })
    expect(context.rep).toBe(44)
    expect(context.progress).toMatchObject({ quests_completed: 1, wrong: 1 })
  })

  it('carries nothing that identifies a person', () => {
    const keys: string[] = []
    const walk = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        keys.push(key)
        walk(child)
      }
    }
    walk(buildFeedbackContext(snapshot(midIncident())))
    // The privacy page promises no name, no email address and nothing about the
    // device beyond the window size.
    expect(keys.filter((key) => /user_?name|e_?mail|user_?agent|ip_?address|referrer/i.test(key)))
      .toEqual([])
  })

  it('works on a page with no quest open at all', () => {
    const save = createSave(index, NOW)
    const context = buildFeedbackContext({
      ...snapshot(save),
      route: { path: '/skills', name: 'skills' },
      quest: null,
      encounter: null,
    })
    expect(context.route).toBe('/skills')
    expect(context.quest_id).toBeUndefined()
    expect(context.encounter_id).toBeUndefined()
    expect(context.rep).toBe(50)
  })

  it('survives having no save yet', () => {
    const context = buildFeedbackContext({
      ...snapshot(createSave(index, NOW)),
      save: null,
      quest: null,
      encounter: null,
    })
    expect(context.route).toBe('/play/q-incident')
    expect(context.rep).toBeUndefined()
  })

  it('offers categories the server accepts', () => {
    expect(FEEDBACK_CATEGORIES.map((option) => option.id)).toEqual([
      'confusing',
      'wrong',
      'bug',
      'layout',
      'idea',
      'praise',
    ])
  })
})
