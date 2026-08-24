/**
 * The thin client for the optional server.
 *
 * Nothing here is required to play. Every call can fail and the caller is
 * expected to shrug and carry on with the local save.
 */

import type { SaveState } from '@/engine'

export interface Me {
  username: string | null
  authenticated: boolean
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)runbook_csrftoken=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && !csrfToken()) {
    // Pick up a CSRF cookie before the first write of the session.
    await fetch('/api/csrf', { credentials: 'same-origin' }).catch(() => undefined)
  }
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(method === 'GET' ? {} : { 'X-CSRFToken': csrfToken() }),
      ...(init.headers ?? {}),
    },
  })
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail =
      (payload as { detail?: string; message?: string }).detail ??
      (payload as { message?: string }).message ??
      'Something went wrong.'
    throw new ApiError(detail, response.status)
  }
  return payload as T
}

export const api = {
  me: () => request<Me>('/api/auth/me'),
  signup: (username: string, password: string) =>
    request<Me>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    request<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<Me>('/api/auth/logout', { method: 'POST' }),
  getSave: () =>
    request<{ schema_version: number; updated_at: string; blob: SaveState }>('/api/save'),
  putSave: (save: SaveState) =>
    request<{ schema_version: number; updated_at: string; blob: SaveState }>('/api/save', {
      method: 'PUT',
      body: JSON.stringify({
        schema_version: save.schema_version,
        updated_at: save.updated_at,
        blob: save,
      }),
    }),
  deleteSave: () => request<{ deleted: boolean }>('/api/save', { method: 'DELETE' }),
  events: (events: unknown[]) =>
    request<{ recorded: number }>('/api/events', {
      method: 'POST',
      body: JSON.stringify({ events }),
    }),
}
