<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import RepBar from '@/components/RepBar.vue'
import { useAccountStore } from '@/stores/account'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const game = useGameStore()
const ui = useUiStore()
const account = useAccountStore()
const route = useRoute()
const menuOpen = ref(false)

const links = [
  { to: '/career', label: 'Career' },
  { to: '/skills', label: 'Skills' },
  { to: '/map', label: 'Map' },
  { to: '/account', label: 'Account' },
]

const themeLabel = computed(
  () => ({ system: 'Auto', light: 'Light', dark: 'Dark' })[ui.theme],
)

function cycleTheme(): void {
  ui.setTheme(ui.theme === 'system' ? 'light' : ui.theme === 'light' ? 'dark' : 'system')
}
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-ink-200 bg-ink-50/85 backdrop-blur
    dark:border-ink-800 dark:bg-ink-950/85"
  >
    <div class="mx-auto flex w-full max-w-7xl items-center gap-3 px-3 py-2.5 sm:px-5">
      <RouterLink to="/" class="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-signal-600 font-mono
          text-sm text-white"
          aria-hidden="true"
        >
          rb
        </span>
        <span class="truncate">The Runbook</span>
      </RouterLink>

      <nav class="ml-auto hidden items-center gap-1 md:flex" aria-label="Main">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900
          dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-50"
          :class="route.path.startsWith(link.to) && 'bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-ink-50'"
        >
          {{ link.label }}
          <span v-if="link.to === '/account' && account.signedIn" class="text-signal-500">.</span>
        </RouterLink>
        <button class="btn-quiet px-3" type="button" @click="cycleTheme">
          {{ themeLabel }}
        </button>
      </nav>

      <button
        class="btn-quiet ml-auto px-3 md:hidden"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="mobile-nav"
        @click="menuOpen = !menuOpen"
      >
        Menu
      </button>
    </div>

    <div v-if="game.save" class="mx-auto w-full max-w-7xl px-3 pb-2 sm:px-5">
      <RepBar />
    </div>

    <nav
      v-if="menuOpen"
      id="mobile-nav"
      class="border-t border-ink-200 px-3 py-2 md:hidden dark:border-ink-800"
      aria-label="Main"
    >
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="block rounded-lg px-3 py-3 text-sm"
        @click="menuOpen = false"
      >
        {{ link.label }}
      </RouterLink>
      <button class="block w-full rounded-lg px-3 py-3 text-left text-sm" type="button" @click="cycleTheme">
        Theme: {{ themeLabel }}
      </button>
    </nav>
  </header>
</template>
