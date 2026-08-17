import type { GameState } from '@/engine/types'

import { ApiError, request } from './client'

export interface Account {
  email: string
}

export interface RemoteSave {
  blob: { schemaVersion: number; state: GameState; updatedAt: string }
  schema_version: number
  updated_at: string
}

export function signup(email: string, password: string): Promise<Account> {
  return request<Account>('POST', '/api/auth/signup', { email, password })
}

export function login(email: string, password: string): Promise<Account> {
  return request<Account>('POST', '/api/auth/login', { email, password })
}

export function logout(): Promise<void> {
  return request<void>('POST', '/api/auth/logout')
}

/** Resolves to null when nobody is signed in, rather than throwing. */
export async function currentAccount(): Promise<Account | null> {
  try {
    return await request<Account>('GET', '/api/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function requestPasswordReset(email: string): Promise<{ detail: string }> {
  return request<{ detail: string }>('POST', '/api/auth/password-reset', { email })
}

export function confirmPasswordReset(
  uid: string,
  token: string,
  password: string,
): Promise<{ detail: string }> {
  return request<{ detail: string }>('POST', '/api/auth/password-reset/confirm', {
    uid,
    token,
    password,
  })
}

/** Resolves to null when the account has no save yet. */
export async function fetchSave(): Promise<RemoteSave | null> {
  try {
    return await request<RemoteSave>('GET', '/api/save')
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export function pushSave(state: GameState, updatedAt: string): Promise<RemoteSave> {
  return request<RemoteSave>('PUT', '/api/save', {
    blob: { schemaVersion: state.schemaVersion, state, updatedAt },
    schema_version: state.schemaVersion,
    updated_at: updatedAt,
  })
}
