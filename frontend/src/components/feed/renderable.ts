import type { EngineEvent } from '@/engine/types'

/**
 * Which engine events become lines in the narrative feed.
 *
 * The rest still drive the interface - phase changes swap the action panel,
 * eliminations grey out choices - but they have nothing to say in the
 * transcript, and an empty rail entry is just noise.
 */
export function isRenderable(event: EngineEvent): boolean {
  switch (event.type) {
    case 'investigated':
    case 'command_ran':
    case 'option_chosen':
    case 'explanation':
    case 'time_exhausted':
    case 'cluster_lit':
    case 'bonus_unlocked':
    case 'quest_completed':
    case 'checkpoint_restored':
      return true
    case 'rep_changed':
    case 'time_changed':
      return event.delta !== 0
    case 'skill_points_changed':
      return event.delta > 0
    default:
      return false
  }
}
