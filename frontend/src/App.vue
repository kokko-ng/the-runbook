<script setup lang="ts">
import { onMounted } from 'vue'

import AppFooter from '@/components/AppFooter.vue'
import AppHeader from '@/components/AppHeader.vue'
import FeedbackButton from '@/components/FeedbackButton.vue'
import ToastStack from '@/components/ToastStack.vue'
import { useAccountStore } from '@/stores/account'
import { useContentStore } from '@/stores/content'
import { useGameStore } from '@/stores/game'

const content = useContentStore()
const game = useGameStore()
const account = useAccountStore()

onMounted(async () => {
  await game.boot()
  await account.refresh()
  if (account.signedIn) await account.pull()
})
</script>

<template>
  <a
    href="#main"
    class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50
    focus:rounded-lg focus:bg-signal-600 focus:px-4 focus:py-2 focus:text-white"
  >
    Skip to content
  </a>
  <div class="flex min-h-dvh flex-col">
    <AppHeader />
    <main id="main" class="mx-auto w-full max-w-7xl grow px-3 py-4 pb-20 sm:px-5 sm:py-6 sm:pb-20">
      <p
        v-if="content.error"
        class="card mb-4 border-broken/40 p-4 text-sm text-broken"
        role="alert"
      >
        {{ content.error }}
      </p>
      <p
        v-if="game.storageBlocked"
        class="card mb-4 border-degraded/50 p-4 text-sm"
        role="status"
      >
        This browser will not let the game save locally, so progress will be lost when you close the
        tab. Private browsing usually causes this.
      </p>
      <RouterView />
    </main>
    <AppFooter />
    <FeedbackButton />
    <ToastStack />
  </div>
</template>
