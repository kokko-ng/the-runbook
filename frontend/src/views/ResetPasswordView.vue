<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppFooter from '@/components/AppFooter.vue'
import { useAccountStore } from '@/stores/account'

const account = useAccountStore()
const route = useRoute()
const router = useRouter()

const password = ref('')
const done = ref(false)

// The reset link is /reset/<uid>/<token>, matching the email template.
const uid = computed(() => String(route.params.uid ?? ''))
const token = computed(() => String(route.params.token ?? ''))

async function submit() {
  try {
    await account.confirmReset(uid.value, token.value, password.value)
    done.value = true
    password.value = ''
  } catch {
    // The store holds the message.
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <main class="mx-auto w-full max-w-md flex-1 px-4 py-12">
      <p class="eyebrow mb-2">The Runbook</p>
      <h1 class="mb-6 text-2xl font-semibold">Set a new password</h1>

      <template v-if="!done">
        <form class="space-y-3" @submit.prevent="submit">
          <div>
            <label class="eyebrow mb-1 block" for="new-password">New password</label>
            <input
              id="new-password"
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              class="w-full rounded-[var(--radius-card)] border border-[var(--rule)] bg-[var(--surface-raised)] px-3 py-2.5 text-[0.9375rem]"
            />
            <p class="mt-1 text-[0.75rem] text-[var(--ink-muted)]">
              At least 8 characters, and not one of the common ones.
            </p>
          </div>
          <button type="submit" class="btn btn-primary w-full" :disabled="account.busy">
            {{ account.busy ? 'Working' : 'Change password' }}
          </button>
        </form>

        <p
          v-if="account.error"
          class="mt-4 border-l-2 border-[var(--color-broken)] py-1 pl-3 text-[0.875rem]"
          role="alert"
        >
          {{ account.error }}
        </p>
      </template>

      <template v-else>
        <p class="prose-beat mb-6">Password changed. You can sign in with it now.</p>
        <button type="button" class="btn btn-primary" @click="router.push('/account')">
          Go to sign in
        </button>
      </template>
    </main>
    <AppFooter />
  </div>
</template>
