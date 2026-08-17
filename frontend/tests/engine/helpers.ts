import { applyAction, createInitialState } from '@/engine/engine'
import type {
  ContentBundle,
  EngineAction,
  EngineEvent,
  EngineResult,
  GameState,
} from '@/engine/types'

import { manifest } from './fixtures'

/** Drive a sequence of actions, returning the final state and every event. */
export function run(
  content: ContentBundle,
  actions: EngineAction[],
  start?: GameState,
): { state: GameState; events: EngineEvent[] } {
  let state = start ?? createInitialState(manifest)
  const events: EngineEvent[] = []
  for (const action of actions) {
    const result: EngineResult = applyAction(state, content, action)
    state = result.state
    events.push(...result.events)
  }
  return { state, events }
}

export function eventsOfType<T extends EngineEvent['type']>(
  events: EngineEvent[],
  type: T,
): Extract<EngineEvent, { type: T }>[] {
  return events.filter((event) => event.type === type) as Extract<EngineEvent, { type: T }>[]
}

export function hasEvent(events: EngineEvent[], type: EngineEvent['type']): boolean {
  return events.some((event) => event.type === type)
}

export function nodeStatus(state: GameState, nodeId: string): string | undefined {
  return state.diagram.nodes.find((node) => node.id === nodeId)?.status
}

export function edgeStatus(state: GameState, edgeId: string): string | undefined {
  return state.diagram.edges.find((edge) => edge.id === edgeId)?.status
}
