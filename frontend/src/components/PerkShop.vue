<script setup lang="ts">
import { computed } from 'vue'

import { PERKS, type PerkId } from '@/engine'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const perks = computed(() =>
  (Object.keys(PERKS) as PerkId[]).map((id) => ({
    ...PERKS[id],
    owned: game.save?.perks[id] ?? 0,
    bought: game.save?.perks_bought[id] ?? 0,
  })),
)
</script>

<template>
  <section class="card p-4">
    <header class="flex items-baseline justify-between gap-2">
      <h3 class="text-sm font-semibold">Perks</h3>
      <p class="font-mono text-xs">{{ game.save?.skill_points ?? 0 }} skill points</p>
    </header>
    <p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
      Skill points come from getting a design call right first time and from closing an incident
      with time to spare.
    </p>
    <ul class="mt-3 space-y-2">
      <li
        v-for="perk in perks"
        :key="perk.id"
        class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200
        p-3 dark:border-ink-800"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">
            {{ perk.name }}
            <span class="ml-1 font-mono text-xs text-ink-500">owned {{ perk.owned }}</span>
          </p>
          <p class="text-xs text-ink-500 dark:text-ink-400">{{ perk.blurb }}</p>
        </div>
        <button
          class="btn-quiet px-3 text-xs"
          type="button"
          :disabled="(game.save?.skill_points ?? 0) < perk.cost || perk.bought >= perk.cap"
          @click="game.dispatch({ type: 'buy_perk', perk: perk.id })"
        >
          {{ perk.bought >= perk.cap ? 'At cap' : `Buy for ${perk.cost}` }}
        </button>
      </li>
    </ul>
  </section>
</template>
