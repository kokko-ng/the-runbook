/**
 * Runs the real compiled content through the engine. This is the drift guard
 * between what the Python compiler emits and what the TypeScript engine expects:
 * a schema change that breaks the engine fails here rather than in a browser.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { applyAction, createInitialState } from '@/engine/engine'
import { deriveLitClusters } from '@/engine/skilltree'
import type { EngineAction, GameState, Manifest, Quest } from '@/engine/types'

const GENERATED = join(__dirname, '../../src/generated/content')

const manifest: Manifest = JSON.parse(readFileSync(join(GENERATED, 'manifest.json'), 'utf-8'))

const quests: Quest[] = readdirSync(join(GENERATED, 'quests'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(GENERATED, 'quests', name), 'utf-8')))

/**
 * Quests in the order a player meets them, which is how the diagram accumulates.
 * Chapter order comes from the manifest (the exam's own order), not from sorting
 * chapter slugs alphabetically.
 */
const chapterRank = new Map(manifest.chapters.map((chapter, index) => [chapter.id, index]))

const inPlayOrder = [...quests].sort(
  (a, b) =>
    a.act - b.act ||
    (chapterRank.get(a.chapter) ?? 999) - (chapterRank.get(b.chapter) ?? 999) ||
    a.order - b.order ||
    a.id.localeCompare(b.id),
)

/** Acts start from their own base diagram, so they accumulate separately. */
function questsForAct(act: number) {
  return inPlayOrder.filter((quest) => quest.act === act)
}

/** Play a quest to completion by always picking the correct option. */
function playThrough(quest: Quest, from?: GameState): GameState {
  const content = { manifest, quest }
  let state = from ?? createInitialState(manifest, quest.act)

  const dispatch = (action: EngineAction) => {
    state = applyAction(state, content, action).state
  }

  dispatch({ type: 'START_QUEST', questId: quest.id })

  let guard = 0
  while (state.phase !== 'quest_complete') {
    if (guard++ > 200) throw new Error(`quest ${quest.id} did not terminate`)

    const encounter = quest.encounters.find((candidate) => candidate.id === state.encounterId)!

    if (state.phase === 'resolved') {
      dispatch({ type: 'ADVANCE' })
      continue
    }
    if (state.phase === 'investigate') {
      for (const action of (encounter as never as { investigate: { id: string }[] }).investigate) {
        dispatch({ type: 'RUN_INVESTIGATE', actionId: action.id })
      }
      dispatch({ type: 'ENTER_PHASE', phase: 'fix' })
      continue
    }

    const options =
      encounter.type === 'troubleshoot' ? encounter.fixes : encounter.options
    const correct = options.find((option) => option.correct)!
    dispatch({ type: 'CHOOSE_OPTION', optionId: correct.id })
  }

  return state
}

describe('compiled content', () => {
  it('ships a manifest the engine understands', () => {
    expect(manifest.formatVersion).toBe(1)
    expect(manifest.exams.length).toBeGreaterThan(0)
    expect(Object.keys(manifest.diagrams)).toContain('1')
  })

  it('ships at least one quest', () => {
    expect(quests.length).toBeGreaterThan(0)
  })

  it.each(quests.map((quest) => [quest.id, quest] as const))(
    'plays %s to completion on correct answers',
    (_id, quest) => {
      const state = playThrough(quest)

      expect(state.phase).toBe('quest_complete')
      expect(state.completedQuestIds).toContain(quest.id)
      // Every objective the quest declares is credited by the time it ends.
      const declared = new Set(quest.encounters.flatMap((encounter) => encounter.objectives))
      for (const objective of declared) {
        expect(state.clearedObjectiveIds).toContain(objective)
      }
    },
  )

  it.each(quests.map((quest) => [quest.id, quest] as const))(
    '%s gains reputation when played correctly',
    (_id, quest) => {
      expect(playThrough(quest).rep).toBeGreaterThan(50)
    },
  )

  it('lights every skill cluster after all quests are played', () => {
    const cleared = new Set<string>()
    for (const quest of inPlayOrder) {
      for (const objective of playThrough(quest).clearedObjectiveIds) {
        cleared.add(objective)
      }
    }

    const lit = deriveLitClusters(manifest, [...cleared])
    const authoredChapters = new Set(quests.map((quest) => quest.chapter))
    const expected = manifest.exams
      .flatMap((exam) => exam.domains)
      .filter((domain) => authoredChapters.has(domain.chapter))
      .flatMap((domain) => domain.clusters.map((cluster) => cluster.id))

    expect(lit.sort()).toEqual(expected.sort())
  })

  it.each([1, 2])('builds a connected diagram when act %i is played end to end', (act) => {
    // Quests accumulate the diagram in play order, so a node one quest deploys
    // is there for the next. The Python linter enforces that ordering at author
    // time; this asserts the compiled artifact the browser loads honours it.
    let state: GameState | undefined
    for (const quest of questsForAct(act)) {
      state = playThrough(quest, state)
    }

    const ids = state!.diagram.nodes.map((node) => node.id)
    for (const edge of state!.diagram.edges) {
      expect(ids).toContain(edge.source)
      expect(ids).toContain(edge.target)
    }
    // Nodes the story deploys are still there at the end, so no add_node was
    // silently dropped along the way.
    expect(ids.length).toBeGreaterThan(manifest.diagrams[String(act)]!.nodes.length)
  })

  it.each([1, 2])('leaves nothing broken in act %i when played correctly', (act) => {
    // Nothing may be left `broken`: that means an unresolved outage, and every
    // later quest would inherit it. `warning` and `degraded` are allowed,
    // because the story deliberately leaves acknowledged debt on the map - the
    // finale's dated interim workload is the clearest example. That an incident
    // is actually repaired by its correct fix is enforced by the content linter,
    // which checks it per encounter rather than in aggregate.
    let state: GameState | undefined
    for (const quest of questsForAct(act)) {
      state = playThrough(quest, state)
    }

    const broken = state!.diagram.nodes.filter((node) => node.status === 'broken')
    const brokenEdges = state!.diagram.edges.filter((edge) => edge.status === 'broken')

    expect(broken.map((node) => node.id)).toEqual([])
    expect(brokenEdges.map((edge) => edge.id)).toEqual([])
  })

  it('breaks something on the map during every troubleshooting incident', () => {
    // The living map is the point: an incident the player cannot see is a
    // missed teaching opportunity.
    for (const quest of quests) {
      for (const encounter of quest.encounters) {
        if (encounter.type !== 'troubleshoot') continue
        expect(
          encounter.onEnterDiagramOps.length,
          `${quest.id}:${encounter.id} does not show up on the map`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('carries diagram changes forward from one quest to the next', () => {
    // The networking chapter labels the warehouse spoke with its address space
    // in its first quest; the label must survive into the second.
    const networking = inPlayOrder.filter((quest) => quest.chapter === 'act1-networking')
    let state: GameState | undefined
    for (const quest of networking.slice(0, 2)) {
      state = playThrough(quest, state)
    }

    const labels = state!.diagram.nodes.map((node) => node.label)
    expect(labels.some((label) => label.includes('10.101.0.0/16'))).toBe(true)
  })
})
