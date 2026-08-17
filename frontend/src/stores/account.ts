/**
 * Optional accounts. The game never waits on this store: if the server is
 * unreachable or nobody is signed in, play continues against local storage and
 * sync simply does not happen.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import * as api from '@/api/account'
import { ApiError } from '@/api/client'
import { migrate } from '@/engine/save'
import type { GameState } from '@/engine/types'
import * as localSave from '@/persistence/localSave'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

export const useAccountStore = defineStore('account', () => {
  const email = ref<string | null>(null)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const sync = ref<SyncState>('idle')
  const lastSyncedAt = ref<string | null>(null)

  const signedIn = computed(() => email.value !== null)

  function fail(caught: unknown): never {
    const message =
      caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.'
    error.value = message
    throw caught
  }

  /** Called once at startup. Silent on failure: an account is optional. */
  async function restore() {
    try {
      const account = await api.currentAccount()
      email.value = account?.email ?? null
    } catch {
      email.value = null
      sync.value = 'offline'
    }
  }

  async function signUp(address: string, password: string) {
    busy.value = true
    error.value = null
    try {
      const account = await api.signup(address, password)
      email.value = account.email
    } catch (caught) {
      fail(caught)
    } finally {
      busy.value = false
    }
  }

  async function signIn(address: string, password: string) {
    busy.value = true
    error.value = null
    try {
      const account = await api.login(address, password)
      email.value = account.email
    } catch (caught) {
      fail(caught)
    } finally {
      busy.value = false
    }
  }

  async function signOut() {
    busy.value = true
    try {
      await api.logout()
    } catch {
      // Even a failed sign-out ends the local session; the cookie may already
      // be gone, and leaving the UI signed in would be a lie.
    } finally {
      email.value = null
      sync.value = 'idle'
      busy.value = false
    }
  }

  /** Upload the current state. Never throws: a failed sync must not break play. */
  async function push(state: GameState) {
    if (!signedIn.value) return
    sync.value = 'syncing'
    try {
      const result = await api.pushSave(state, new Date().toISOString())
      lastSyncedAt.value = result.updated_at
      sync.value = 'synced'
    } catch (caught) {
      sync.value = caught instanceof ApiError && caught.status === 0 ? 'offline' : 'error'
    }
  }

  /**
   * Reconcile the server save with this device's. Returns the state to adopt,
   * or null to keep playing what is already loaded.
   */
  async function pull(localState: GameState | null): Promise<GameState | null> {
    if (!signedIn.value) return null
    sync.value = 'syncing'
    try {
      const remote = await api.fetchSave()
      if (!remote) {
        // First device on this account: the local save becomes the server's.
        if (localState) await push(localState)
        sync.value = 'synced'
        return null
      }

      const local = localSave.read()
      const localStamp = local.status === 'loaded' ? local.updatedAt : null
      sync.value = 'synced'
      lastSyncedAt.value = remote.updated_at

      // Last write wins, and a device with no save always takes the server's.
      if (localStamp && new Date(localStamp) >= new Date(remote.updated_at)) return null
      return migrate({
        schemaVersion: remote.blob.schemaVersion,
        state: remote.blob.state,
        updatedAt: remote.updated_at,
      })
    } catch (caught) {
      sync.value = caught instanceof ApiError && caught.status === 0 ? 'offline' : 'error'
      return null
    }
  }

  async function requestReset(address: string) {
    busy.value = true
    error.value = null
    try {
      return (await api.requestPasswordReset(address)).detail
    } catch (caught) {
      fail(caught)
    } finally {
      busy.value = false
    }
  }

  async function confirmReset(uid: string, token: string, password: string) {
    busy.value = true
    error.value = null
    try {
      return (await api.confirmPasswordReset(uid, token, password)).detail
    } catch (caught) {
      fail(caught)
    } finally {
      busy.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    email,
    busy,
    error,
    sync,
    lastSyncedAt,
    signedIn,
    restore,
    signUp,
    signIn,
    signOut,
    push,
    pull,
    requestReset,
    confirmReset,
    clearError,
  }
})
