/**
 * Anonymous gameplay telemetry.
 *
 * One question only: which encounters are people getting wrong or walking away
 * from. Events are queued and flushed in small batches; if the server is not
 * there, they are dropped without a word.
 */

import { api } from './api'
import { anonymousId } from './storage'

export interface OutgoingEvent {
  type: string
  anonymous_id: string
  quest_id?: string
  encounter_id?: string
  outcome?: string
  meta?: Record<string, unknown>
}

const queue: OutgoingEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let disabled = false

export function track(
  type: string,
  fields: Omit<OutgoingEvent, 'type' | 'anonymous_id'> = {},
): void {
  if (disabled) return
  queue.push({ type, anonymous_id: anonymousId(), ...fields })
  if (queue.length >= 10) return void flush()
  if (!timer) timer = setTimeout(() => void flush(), 10_000)
}

export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!queue.length || disabled) return
  const batch = queue.splice(0, queue.length)
  try {
    await api.events(batch)
  } catch {
    // A server that is not answering is not worth retrying forever.
    disabled = true
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush())
}
