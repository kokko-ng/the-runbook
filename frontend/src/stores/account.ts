/**
 * Optional accounts, for one purpose: carrying a save between devices.
 *
 * Username and password only. No email address is collected anywhere, which
 * means there is no self-serve password reset -- the signup screen says so
 * before the button, and the admin resets by hand.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiError, api } from '@/lib/api'
import { useGameStore } from './game'
import { useUiStore } from './ui'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

export const useAccountStore = defineStore('account', () => {
  const username = ref<string | null>(null)
  const checked = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const syncState = ref<SyncState>('idle')
  const lastSyncedAt = ref<string | null>(null)

  const signedIn = computed(() => username.value !== null)

  async function refresh(): Promise<void> {
    try {
      const me = await api.me()
      username.value = me.authenticated ? me.username : null
    } catch {
      username.value = null
      syncState.value = 'offline'
    } finally {
      checked.value = true
    }
  }

  async function attempt(action: () => Promise<void>): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      await action()
      return true
    } catch (cause) {
      error.value = cause instanceof ApiError ? cause.message : 'The server is not answering.'
      return false
    } finally {
      busy.value = false
    }
  }

  async function signUp(name: string, password: string): Promise<boolean> {
    return attempt(async () => {
      const me = await api.signup(name, password)
      username.value = me.username
      // A brand new account adopts whatever the player has played so far.
      await push()
    })
  }

  async function signIn(name: string, password: string): Promise<boolean> {
    return attempt(async () => {
      const me = await api.login(name, password)
      username.value = me.username
      await pull()
    })
  }

  async function signOut(): Promise<void> {
    await attempt(async () => {
      await api.logout()
      username.value = null
      syncState.value = 'idle'
    })
  }

  /** Send the local save up. Refuses politely if the server holds a newer one. */
  async function push(): Promise<void> {
    const game = useGameStore()
    if (!signedIn.value || !game.save) return
    syncState.value = 'syncing'
    try {
      await api.putSave(game.save)
      syncState.value = 'synced'
      lastSyncedAt.value = new Date().toISOString()
      game.dirty = false
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        await pull()
        useUiStore().toast('A newer save from another device came down instead.', 'info')
        return
      }
      syncState.value = 'error'
    }
  }

  /** Take the server save if it is newer than the local one. */
  async function pull(): Promise<void> {
    const game = useGameStore()
    if (!signedIn.value) return
    syncState.value = 'syncing'
    try {
      const remote = await api.getSave()
      const localAt = game.save?.updated_at ?? ''
      if (!game.save || remote.blob.updated_at > localAt) {
        game.adopt(remote.blob)
      } else if (localAt > remote.blob.updated_at) {
        await api.putSave(game.save)
      }
      syncState.value = 'synced'
      lastSyncedAt.value = new Date().toISOString()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        await push()
        return
      }
      syncState.value = 'error'
    }
  }

  return {
    username,
    checked,
    busy,
    error,
    syncState,
    lastSyncedAt,
    signedIn,
    refresh,
    signUp,
    signIn,
    signOut,
    push,
    pull,
  }
})
