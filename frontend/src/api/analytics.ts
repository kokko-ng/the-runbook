/**
 * Anonymous gameplay analytics. Fire-and-forget by design: the game is fully
 * playable with the API unreachable, so a failed event is never surfaced.
 */

import { anonymousId } from '@/persistence/localSave'

export interface AnalyticsPayload {
  type: string
  encounter_id?: string
  outcome?: string
}

export function recordEvent(payload: AnalyticsPayload): void {
  const body = JSON.stringify({
    anonymous_id: anonymousId(),
    type: payload.type,
    encounter_id: payload.encounter_id ?? '',
    outcome: payload.outcome ?? '',
  })

  try {
    // sendBeacon survives the tab closing, which is exactly when the last
    // encounter of a session resolves.
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
      return
    }
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Analytics never interrupts play.
  }
}
