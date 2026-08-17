<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import EncounterPanel from '@/components/feed/EncounterPanel.vue'
import GameFeed from '@/components/feed/GameFeed.vue'
import PerkBar from '@/components/hud/PerkBar.vue'
import StandingMeter from '@/components/hud/StandingMeter.vue'
import ThemeToggle from '@/components/hud/ThemeToggle.vue'
import MapPane from '@/components/map/MapPane.vue'
import SkillTreeDrawer from '@/components/skills/SkillTreeDrawer.vue'
import { questRef } from '@/content'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const game = useGameStore()
const ui = useUiStore()
const router = useRouter()

const booting = ref(true)

onMounted(async () => {
  if (!game.started) {
    const resumed = await game.resume()
    if (!resumed) {
      router.replace('/')
      return
    }
  }
  booting.value = false
})

const current = computed(() => (game.quest ? questRef(game.quest.id) : undefined))

const troubleCount = computed(
  () => game.state.diagram.nodes.filter((node) => node.status !== 'healthy').length,
)

async function nextQuest() {
  const advanced = await game.continueToNextQuest()
  if (!advanced) router.push('/')
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <!-- Top bar: identity, standing, and the two overlays. -->
    <header
      class="sticky top-0 z-20 border-b border-[var(--rule)] bg-[var(--surface)]/95 backdrop-blur"
    >
      <div class="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-4">
        <RouterLink to="/" class="min-w-0 flex-1">
          <span class="eyebrow block leading-none">The Runbook</span>
          <span class="block truncate text-[0.8125rem] leading-tight">
            {{ current?.title ?? 'Meridian Logistics' }}
          </span>
        </RouterLink>

        <div class="flex shrink-0 items-center gap-2">
          <StandingMeter :rep="game.state.rep" :compact="ui.isPhone" />
          <button
            type="button"
            class="btn btn-quiet btn-compact"
            @click="ui.toggleSkills()"
          >
            Skills
            <span v-if="game.state.skillPoints > 0" class="readout text-[var(--color-hivis-600)]">
              {{ game.state.skillPoints }}
            </span>
          </button>
          <ThemeToggle class="hidden sm:inline-flex" />
        </div>
      </div>
    </header>

    <p
      v-if="game.notice"
      class="border-b border-[var(--color-hivis-500)] bg-[var(--color-hivis-200)] px-4 py-2 text-[0.8125rem] text-[var(--color-steel-900)]"
      role="status"
    >
      {{ game.notice }}
      <button type="button" class="ml-2 underline" @click="game.dismissNotice()">Dismiss</button>
    </p>

    <!-- Desktop is a persistent two-pane grid; minmax(0,1fr) is what stops a
         wide terminal line from widening the whole page. -->
    <main
      class="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_540px]"
    >
      <div class="min-w-0 px-3 py-4 sm:px-6 sm:py-6">
        <div class="mx-auto max-w-2xl">
          <p v-if="booting || game.loading" class="text-[0.875rem] text-[var(--ink-muted)]">
            Loading the next job.
          </p>

          <template v-else>
            <GameFeed :entries="game.feed" />

            <!-- Rep hit zero: the only way on is back to the checkpoint. -->
            <section v-if="game.isPip" class="panel mt-2 border-[var(--color-broken)] p-4">
              <p class="eyebrow mb-1 text-[var(--color-broken)]">Performance improvement plan</p>
              <p class="mb-3 font-serif text-[1.0625rem] leading-relaxed">
                Priya books thirty minutes with the door closed. Nobody is fired today, but you
                are starting this job again, and the environment goes back to how you found it.
              </p>
              <button
                type="button"
                class="btn btn-primary"
                @click="game.dispatch({ type: 'RESTART_CHECKPOINT' })"
              >
                Start the job again
              </button>
            </section>

            <section v-else-if="game.questComplete" class="panel mt-2 p-4">
              <template v-if="game.careerComplete">
                <p class="eyebrow mb-1">Solutions architect</p>
                <p class="mb-3 font-serif text-[1.0625rem] leading-relaxed">
                  That is the last of it. The estate on the right is the one you designed, and
                  the people who run it can explain why it is shaped the way it is, because you
                  wrote that down. Desmond has stopped checking your work.
                </p>
                <p class="mb-3 text-[0.875rem] text-[var(--ink-muted)]">
                  Every objective you cleared is lit in the skills drawer. If any are still dark,
                  they are the ones worth revisiting before you sit the exam.
                </p>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="btn btn-primary" @click="ui.toggleSkills()">
                    Review the skill tree
                  </button>
                  <RouterLink to="/" class="btn btn-quiet">Back to the chapter list</RouterLink>
                </div>
              </template>
              <template v-else>
                <p class="eyebrow mb-1">Job closed</p>
                <p class="mb-3 font-serif text-[1.0625rem] leading-relaxed">
                  {{ current?.title }} is done. The estate is what you made it.
                </p>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="btn btn-primary" @click="nextQuest">
                    Take the next job
                  </button>
                  <RouterLink to="/" class="btn btn-quiet">Back to the chapter list</RouterLink>
                </div>
              </template>
            </section>

            <EncounterPanel v-else class="mt-2" />
          </template>
        </div>
      </div>

      <!-- Map: a right-hand pane from 1024px, an overlay below it. -->
      <aside
        class="hidden border-l border-[var(--rule)] bg-[var(--surface-raised)] lg:block"
        :class="ui.mapPanelVisible ? '' : 'lg:hidden'"
      >
        <div class="sticky top-[57px] h-[calc(100dvh-57px)]">
          <MapPane :diagram="game.state.diagram" />
        </div>
      </aside>
    </main>

    <!-- Phone and tablet: the map lives behind a bar that opens it full screen. -->
    <div
      class="sticky bottom-0 z-20 border-t border-[var(--rule)] bg-[var(--surface)]/95 px-3 py-2 backdrop-blur lg:hidden"
    >
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-quiet flex-1 !text-[0.8125rem]" @click="ui.openMap()">
          Estate map
          <span
            v-if="troubleCount"
            class="readout text-[var(--color-broken)]"
          >
            {{ troubleCount }}
          </span>
        </button>
        <ThemeToggle class="sm:hidden" />
      </div>
      <PerkBar class="mt-2" />
    </div>

    <PerkBar class="hidden px-6 pb-4 lg:flex" />

    <!-- Full-screen map sheet for phone and tablet. -->
    <div
      v-if="ui.mapOpen"
      class="fixed inset-0 z-40 flex flex-col bg-[var(--surface)] lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Estate map"
    >
      <MapPane :diagram="game.state.diagram" class="flex-1">
        <template #actions>
          <button type="button" class="btn btn-quiet btn-compact" @click="ui.closeMap()">
            Close
          </button>
        </template>
      </MapPane>
    </div>

    <SkillTreeDrawer />
  </div>
</template>
