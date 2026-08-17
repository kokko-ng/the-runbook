<script setup lang="ts">
import { onMounted, ref } from 'vue'

import AppFooter from '@/components/AppFooter.vue'
import ThemeToggle from '@/components/hud/ThemeToggle.vue'
import { useAccountStore } from '@/stores/account'
import { useGameStore } from '@/stores/game'
import * as localSave from '@/persistence/localSave'

type Mode = 'signin' | 'signup' | 'forgot'

const account = useAccountStore()
const game = useGameStore()

const mode = ref<Mode>('signin')
const email = ref('')
const password = ref('')
const message = ref<string | null>(null)

onMounted(() => account.restore())

function switchTo(next: Mode) {
  mode.value = next
  message.value = null
  account.clearError()
}

async function submit() {
  message.value = null
  try {
    if (mode.value === 'forgot') {
      message.value = (await account.requestReset(email.value)) ?? null
      return
    }

    if (mode.value === 'signup') {
      await account.signUp(email.value, password.value)
    } else {
      await account.signIn(email.value, password.value)
    }

    password.value = ''

    // Reconcile immediately: a fresh sign-in on a new device should show the
    // save from the old one.
    const local = localSave.read()
    const adopted = await account.pull(local.status === 'loaded' ? local.state : null)
    if (adopted) {
      await game.adopt(adopted)
      message.value = 'Signed in. Your saved game from another device is now loaded.'
    } else {
      message.value = 'Signed in. This device now syncs your progress.'
    }
  } catch {
    // The store already holds the message to show.
  }
}

async function signOut() {
  await account.signOut()
  message.value = 'Signed out. Your game stays on this device.'
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="border-b border-[var(--rule)]">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <RouterLink to="/" class="eyebrow">The Runbook</RouterLink>
        <ThemeToggle />
      </div>
    </header>

    <main class="mx-auto w-full max-w-md flex-1 px-4 py-12">
      <h1 class="mb-2 text-2xl font-semibold">Account</h1>
      <p class="prose-beat mb-8 text-[0.9375rem]">
        An account does one thing: keeps your progress in step across devices. The game is free
        and fully playable without one, and everything you have already played stays on this
        device either way.
      </p>

      <!-- Signed in: nothing to do but leave. -->
      <section v-if="account.signedIn" class="panel p-4">
        <p class="eyebrow mb-1">Signed in</p>
        <p class="readout mb-4 text-[0.9375rem]">{{ account.email }}</p>
        <p class="mb-4 text-[0.8125rem] text-[var(--ink-muted)]">
          Sync status:
          <span class="readout">{{ account.sync }}</span>
          <template v-if="account.lastSyncedAt">
            &middot; last saved to the server
            {{ new Date(account.lastSyncedAt).toLocaleString() }}
          </template>
        </p>
        <button type="button" class="btn btn-quiet" :disabled="account.busy" @click="signOut">
          Sign out
        </button>
      </section>

      <!-- Signed out: one form, three modes. -->
      <section v-else>
        <div class="mb-4 flex gap-1 border-b border-[var(--rule)]">
          <button
            v-for="tab in (['signin', 'signup'] as Mode[])"
            :key="tab"
            type="button"
            class="border-b-2 px-3 py-2 text-[0.875rem] font-semibold"
            :class="
              mode === tab
                ? 'border-[var(--accent)] text-[var(--ink)]'
                : 'border-transparent text-[var(--ink-muted)]'
            "
            @click="switchTo(tab)"
          >
            {{ tab === 'signin' ? 'Sign in' : 'Create an account' }}
          </button>
        </div>

        <form class="space-y-3" @submit.prevent="submit">
          <div>
            <label class="eyebrow mb-1 block" for="email">Email</label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="w-full rounded-[var(--radius-card)] border border-[var(--rule)] bg-[var(--surface-raised)] px-3 py-2.5 text-[0.9375rem]"
            />
          </div>

          <div v-if="mode !== 'forgot'">
            <label class="eyebrow mb-1 block" for="password">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
              class="w-full rounded-[var(--radius-card)] border border-[var(--rule)] bg-[var(--surface-raised)] px-3 py-2.5 text-[0.9375rem]"
            />
            <p v-if="mode === 'signup'" class="mt-1 text-[0.75rem] text-[var(--ink-muted)]">
              At least 8 characters, and not one of the common ones.
            </p>
          </div>

          <button type="submit" class="btn btn-primary w-full" :disabled="account.busy">
            {{
              account.busy
                ? 'Working'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'forgot'
                    ? 'Email me a reset link'
                    : 'Sign in'
            }}
          </button>
        </form>

        <p class="mt-3 text-[0.8125rem]">
          <button
            v-if="mode !== 'forgot'"
            type="button"
            class="underline underline-offset-2"
            @click="switchTo('forgot')"
          >
            Forgotten your password?
          </button>
          <button
            v-else
            type="button"
            class="underline underline-offset-2"
            @click="switchTo('signin')"
          >
            Back to signing in
          </button>
        </p>
      </section>

      <p
        v-if="account.error"
        class="mt-4 border-l-2 border-[var(--color-broken)] py-1 pl-3 text-[0.875rem]"
        role="alert"
      >
        {{ account.error }}
      </p>
      <p
        v-else-if="message"
        class="mt-4 border-l-2 border-[var(--color-healthy)] py-1 pl-3 text-[0.875rem]"
        role="status"
      >
        {{ message }}
      </p>

      <RouterLink to="/" class="btn btn-quiet mt-8">Back to the start</RouterLink>
    </main>

    <AppFooter />
  </div>
</template>
