<script setup lang="ts">
import { computed } from 'vue'

import { PERKS, PERK_IDS } from '@/engine/constants'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

/** Only offer a perk that can actually do something right now. */
const usable = computed(() => {
  const phase = game.state.phase
  const inChoice = phase === 'scenario' || phase === 'fix'
  const inIncident = game.encounter?.type === 'troubleshoot'
  return {
    hint: inChoice && !game.state.encounter.hintUsed,
    overtime: inIncident && !game.state.encounter.overtimeUsed && phase !== 'resolved',
    repShield: !game.state.armed.repShield,
  }
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span class="eyebrow">Perks</span>
    <button
      v-for="perk in PERK_IDS"
      :key="perk"
      type="button"
      class="btn btn-quiet btn-compact"
      :disabled="game.state.perksOwned[perk] === 0 || !usable[perk]"
      :title="PERKS[perk].description"
      @click="game.dispatch({ type: 'USE_PERK', perk })"
    >
      {{ PERKS[perk].name }}
      <span class="readout text-[var(--ink-faint)]">{{ game.state.perksOwned[perk] }}</span>
    </button>
    <span
      v-if="game.state.armed.repShield"
      class="eyebrow text-[var(--color-healthy)]"
      title="Your next loss of standing is halved."
    >
      Shield armed
    </span>
  </div>
</template>
