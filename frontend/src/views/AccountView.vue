<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useAccountStore } from '@/stores/account'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const account = useAccountStore()
const game = useGameStore()
const ui = useUiStore()

const mode = ref<'in' | 'up'>('in')
const username = ref('')
const password = ref('')
const confirming = ref(false)

const syncLabel = computed(
  () =>
    ({
      idle: 'Not synced yet',
      syncing: 'Syncing',
      synced: 'Synced',
      error: 'The server did not answer. Your local save is fine.',
      offline: 'Offline',
    })[account.syncState],
)

async function submit(): Promise<void> {
  const ok =
    mode.value === 'in'
      ? await account.signIn(username.value, password.value)
      : await account.signUp(username.value, password.value)
  password.value = ''
  if (ok) ui.toast(mode.value === 'in' ? 'Signed in.' : 'Account created.', 'good')
}

function reset(): void {
  game.restart()
  confirming.value = false
  ui.toast('Career reset.', 'info')
}

onMounted(() => account.refresh())
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">Account</h1>
      <p class="text-sm text-ink-600 dark:text-ink-300">
        Entirely optional. The game is playable without one, and an account exists for exactly one
        reason: carrying your save to another device.
      </p>
    </header>

    <section v-if="account.signedIn" class="card space-y-4 p-4">
      <div>
        <p class="text-sm">
          Signed in as <span class="font-semibold">{{ account.username }}</span>
        </p>
        <p class="text-xs text-ink-500 dark:text-ink-400">{{ syncLabel }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-quiet" type="button" :disabled="account.busy" @click="account.push()">
          Upload this device's save
        </button>
        <button class="btn-quiet" type="button" :disabled="account.busy" @click="account.pull()">
          Download the server save
        </button>
        <button class="btn-quiet" type="button" :disabled="account.busy" @click="account.signOut()">
          Sign out
        </button>
      </div>
    </section>

    <section v-else class="card space-y-4 p-4">
      <div class="flex gap-1 rounded-lg border border-ink-200 p-0.5 dark:border-ink-700">
        <button
          v-for="option in [['in', 'Sign in'], ['up', 'Create an account']] as const"
          :key="option[0]"
          type="button"
          class="min-h-10 grow rounded-md px-3 text-sm"
          :class="mode === option[0] ? 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900' : ''"
          @click="mode = option[0]"
        >
          {{ option[1] }}
        </button>
      </div>

      <form class="space-y-3" @submit.prevent="submit">
        <label class="block text-sm">
          <span class="mb-1 block text-ink-600 dark:text-ink-300">Username</span>
          <input
            v-model="username"
            required
            autocomplete="username"
            class="w-full min-h-11 rounded-lg border border-ink-200 bg-white px-3 dark:border-ink-700
            dark:bg-ink-900"
          />
        </label>
        <label class="block text-sm">
          <span class="mb-1 block text-ink-600 dark:text-ink-300">Password</span>
          <input
            v-model="password"
            type="password"
            required
            :autocomplete="mode === 'in' ? 'current-password' : 'new-password'"
            class="w-full min-h-11 rounded-lg border border-ink-200 bg-white px-3 dark:border-ink-700
            dark:bg-ink-900"
          />
        </label>
        <p v-if="account.error" class="text-sm text-broken" role="alert">{{ account.error }}</p>
        <button class="btn-primary w-full" type="submit" :disabled="account.busy">
          {{ mode === 'in' ? 'Sign in' : 'Create account' }}
        </button>
      </form>

      <p class="text-xs text-ink-500 dark:text-ink-400">
        Username and password only. No email address is collected anywhere in this project, which
        also means there is no self-serve password reset: if you forget it, the save stays on the
        device that has it. Pick something you can remember, and at least ten characters.
      </p>
    </section>

    <section class="card space-y-3 p-4">
      <h2 class="text-sm font-semibold">This device</h2>
      <dl class="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt class="text-ink-500 dark:text-ink-400">Reputation</dt>
          <dd>{{ game.save?.rep ?? '-' }}</dd>
        </div>
        <div>
          <dt class="text-ink-500 dark:text-ink-400">Quests closed</dt>
          <dd>{{ game.save?.progress.quests_completed.length ?? 0 }}</dd>
        </div>
        <div>
          <dt class="text-ink-500 dark:text-ink-400">Objectives cleared</dt>
          <dd>{{ game.examReadiness.covered }} / {{ game.examReadiness.total }}</dd>
        </div>
        <div>
          <dt class="text-ink-500 dark:text-ink-400">Last saved</dt>
          <dd class="truncate font-mono text-xs">{{ game.save?.updated_at ?? '-' }}</dd>
        </div>
      </dl>
      <div class="flex flex-wrap gap-2">
        <button v-if="!confirming" class="btn-quiet" type="button" @click="confirming = true">
          Start over
        </button>
        <template v-else>
          <button class="btn-quiet border-broken text-broken" type="button" @click="reset">
            Yes, wipe this career
          </button>
          <button class="btn-quiet" type="button" @click="confirming = false">Cancel</button>
        </template>
      </div>
    </section>
  </div>
</template>
