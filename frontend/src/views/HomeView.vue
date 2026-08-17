<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppFooter from '@/components/AppFooter.vue'
import ThemeToggle from '@/components/hud/ThemeToggle.vue'
import { chapterQuests, chapters, manifest } from '@/content'
import { useAccountStore } from '@/stores/account'
import { useGameStore } from '@/stores/game'
import * as localSave from '@/persistence/localSave'

const game = useGameStore()
const account = useAccountStore()
const router = useRouter()

const savedAt = ref<string | null>(null)
const confirmingWipe = ref(false)

onMounted(async () => {
  const outcome = localSave.read()
  if (outcome.status === 'loaded') savedAt.value = outcome.updatedAt

  // If an account is already signed in, take the newer of the two saves before
  // the player picks Continue.
  await account.restore()
  if (!account.signedIn) return

  const adopted = await account.pull(outcome.status === 'loaded' ? outcome.state : null)
  if (adopted) {
    await game.adopt(adopted)
    savedAt.value = new Date().toISOString()
  }
})

const hasSave = computed(() => savedAt.value !== null)

const objectiveCount = computed(
  () =>
    manifest.exams
      .flatMap((exam) => exam.domains)
      .flatMap((domain) => domain.clusters)
      .flatMap((cluster) => cluster.objectives).length,
)

const questCount = computed(() => manifest.quests.filter((quest) => !quest.bonusVariantOf).length)

async function start() {
  await game.newGame()
  router.push('/play')
}

async function resume() {
  const ok = await game.resume()
  if (ok) router.push('/play')
}

function wipe() {
  game.wipe()
  savedAt.value = null
  confirmingWipe.value = false
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="border-b border-[var(--rule)]">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <span class="eyebrow">The Runbook</span>
        <div class="flex items-center gap-2">
          <RouterLink to="/account" class="btn btn-quiet !min-h-9 !px-2.5 !text-[0.75rem]">
            {{ account.signedIn ? 'Account' : 'Sync across devices' }}
          </RouterLink>
          <ThemeToggle />
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-16">
      <!-- The hero is the premise, stated the way the job would be. -->
      <section class="mb-12 max-w-2xl">
        <p class="eyebrow mb-3">Meridian Logistics &middot; Cloud operations</p>
        <h1 class="text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)] leading-[1.12] font-semibold">
          You are the new Azure admin at a freight company that cannot afford downtime.
        </h1>
        <p class="prose-beat mt-4">
          Tickets arrive. Peerings break at 09:12. The CFO asks what a gateway costs and the
          security officer asks why a domain controller has a public IP. Work the queue, survive
          the design reviews, and learn AZ-104 and AZ-305 the way you would actually meet them.
        </p>

        <div class="mt-7 flex flex-wrap gap-3">
          <button v-if="hasSave" type="button" class="btn btn-primary" @click="resume">
            Continue
          </button>
          <button
            type="button"
            :class="hasSave ? 'btn btn-quiet' : 'btn btn-primary'"
            @click="start"
          >
            {{ hasSave ? 'Start over' : 'Start your first day' }}
          </button>
        </div>

        <p v-if="hasSave && savedAt" class="mt-3 text-[0.8125rem] text-[var(--ink-muted)]">
          Saved on this device, {{ formatDate(savedAt) }}.
          <button
            v-if="!confirmingWipe"
            type="button"
            class="underline underline-offset-2"
            @click="confirmingWipe = true"
          >
            Delete it
          </button>
          <span v-else>
            Delete the save?
            <button type="button" class="underline underline-offset-2" @click="wipe">Yes</button>
            /
            <button
              type="button"
              class="underline underline-offset-2"
              @click="confirmingWipe = false"
            >
              No
            </button>
          </span>
        </p>

        <p class="mt-6 text-[0.8125rem] text-[var(--ink-muted)]">
          Free, no account needed. Every answer is a choice from a list, so there is nothing to
          type. Your progress saves in this browser.
        </p>
      </section>

      <!-- The chapters, as a work programme rather than a curriculum. -->
      <section>
        <div class="mb-3 flex items-baseline justify-between gap-3">
          <h2 class="text-lg font-semibold">The work</h2>
          <p class="readout text-[0.8125rem] text-[var(--ink-muted)]">
            {{ questCount }} jobs &middot; {{ objectiveCount }} exam objectives
          </p>
        </div>

        <ul class="space-y-2">
          <li v-for="chapter in chapters" :key="chapter.id" class="panel p-4">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="text-[0.9375rem] font-semibold">{{ chapter.title }}</h3>
              <span class="eyebrow">
                Act {{ chapter.act }} &middot; {{ chapterQuests(chapter.id).length }} jobs
              </span>
            </div>
            <ul
              v-if="chapterQuests(chapter.id).length"
              class="mt-3 space-y-1.5 border-l border-[var(--rule)] pl-3"
            >
              <li
                v-for="quest in chapterQuests(chapter.id)"
                :key="quest.id"
                class="text-[0.8125rem] leading-snug"
              >
                <span class="font-medium">{{ quest.title }}</span>
                <span v-if="quest.summary" class="text-[var(--ink-muted)]">
                  &mdash; {{ quest.summary }}
                </span>
              </li>
            </ul>
            <p v-else class="mt-2 text-[0.8125rem] text-[var(--ink-muted)]">
              Not written yet.
            </p>
          </li>
        </ul>
      </section>
    </main>

    <AppFooter />
  </div>
</template>
