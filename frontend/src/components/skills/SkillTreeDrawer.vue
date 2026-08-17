<script setup lang="ts">
import { computed } from 'vue'

import { manifest } from '@/content'
import { PERKS, PERK_IDS } from '@/engine/constants'
import { clusterProgress, isClusterUnlocked } from '@/engine/skilltree'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const game = useGameStore()
const ui = useUiStore()

/** Only show domains the player can actually reach content for. */
const domains = computed(() =>
  manifest.exams.flatMap((exam) =>
    exam.domains
      .filter((domain) => manifest.chapters.some((chapter) => chapter.domain === domain.id))
      .map((domain) => ({ ...domain, exam: exam.exam.toUpperCase() })),
  ),
)

function progress(clusterId: string) {
  const cluster = domains.value.flatMap((domain) => domain.clusters).find((c) => c.id === clusterId)
  return cluster ? clusterProgress(cluster, game.state.clearedObjectiveIds) : { cleared: 0, total: 0 }
}
</script>

<template>
  <div
    v-if="ui.skillsOpen"
    class="fixed inset-0 z-40 flex justify-end bg-black/40"
    role="dialog"
    aria-modal="true"
    aria-label="Skills and perks"
    @click.self="ui.closeSkills()"
    @keydown.esc="ui.closeSkills()"
  >
    <aside
      class="flex h-full w-full max-w-md flex-col bg-[var(--surface)] shadow-xl"
      @click.stop
    >
      <header
        class="flex items-center justify-between border-b border-[var(--rule)] px-4 py-3"
      >
        <div>
          <h2 class="text-base font-semibold">Skills and perks</h2>
          <p class="text-[0.8125rem] text-[var(--ink-muted)]">
            <span class="readout">{{ game.state.skillPoints }}</span> skill point<span
              v-if="game.state.skillPoints !== 1"
              >s</span
            >
            to spend
          </p>
        </div>
        <button type="button" class="btn btn-quiet btn-compact" @click="ui.closeSkills()">
          Close
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <!-- Perks first: this is the only place they are bought. -->
        <section class="mb-6">
          <p class="eyebrow mb-2">Perks</p>
          <ul class="space-y-2">
            <li v-for="perk in PERK_IDS" :key="perk" class="panel flex items-center gap-3 p-3">
              <div class="min-w-0 flex-1">
                <p class="text-[0.9375rem] font-semibold">{{ PERKS[perk].name }}</p>
                <p class="text-[0.8125rem] leading-snug text-[var(--ink-muted)]">
                  {{ PERKS[perk].description }}
                </p>
                <p class="readout mt-1 text-[0.75rem] text-[var(--ink-faint)]">
                  {{ game.state.perksOwned[perk] }} held &middot; cap {{ PERKS[perk].cap }}
                </p>
              </div>
              <button
                type="button"
                class="btn btn-quiet btn-compact shrink-0"
                :disabled="
                  game.state.skillPoints < PERKS[perk].cost ||
                  game.state.perksOwned[perk] >= PERKS[perk].cap
                "
                @click="game.dispatch({ type: 'BUY_PERK', perk })"
              >
                Buy
                <span class="readout text-[var(--ink-faint)]">{{ PERKS[perk].cost }}</span>
              </button>
            </li>
          </ul>
        </section>

        <!-- The tree doubles as an exam-readiness view. -->
        <section v-for="domain in domains" :key="domain.id" class="mb-6">
          <p class="eyebrow mb-0.5">{{ domain.exam }} &middot; {{ domain.weight }}</p>
          <h3 class="mb-2 text-[0.9375rem] font-semibold">{{ domain.title }}</h3>
          <ul class="space-y-2">
            <li
              v-for="cluster in domain.clusters"
              :key="cluster.id"
              class="panel p-3"
              :class="{
                'opacity-55': !isClusterUnlocked(cluster, game.state.litClusterIds),
              }"
            >
              <div class="flex items-baseline justify-between gap-2">
                <p class="text-[0.9375rem] font-semibold">{{ cluster.title }}</p>
                <span
                  class="readout shrink-0 text-[0.75rem]"
                  :class="
                    game.state.litClusterIds.includes(cluster.id)
                      ? 'text-[var(--color-healthy)]'
                      : 'text-[var(--ink-faint)]'
                  "
                >
                  {{ progress(cluster.id).cleared }}/{{ progress(cluster.id).total }}
                </span>
              </div>
              <ul class="mt-2 space-y-1">
                <li
                  v-for="objective in cluster.objectives"
                  :key="objective.id"
                  class="flex items-baseline gap-2 text-[0.8125rem] leading-snug"
                >
                  <span
                    class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0"
                    :class="
                      game.state.clearedObjectiveIds.includes(objective.id)
                        ? 'bg-[var(--color-healthy)]'
                        : 'bg-[var(--rule-strong)]'
                    "
                  />
                  <span
                    :class="
                      game.state.clearedObjectiveIds.includes(objective.id)
                        ? 'text-[var(--ink)]'
                        : 'text-[var(--ink-muted)]'
                    "
                  >
                    {{ objective.text }}
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </section>
      </div>
    </aside>
  </div>
</template>
