<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ChoiceList from '@/components/ChoiceList.vue'
import IncidentPanel from '@/components/IncidentPanel.vue'
import LivingMap from '@/components/LivingMap.vue'
import MapSheet from '@/components/MapSheet.vue'
import NarrativeFeed from '@/components/NarrativeFeed.vue'
import { PERKS, type LogEntry, type PerkId } from '@/engine'
import { useContentStore } from '@/stores/content'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ questId: string }>()
const game = useGameStore()
const content = useContentStore()
const ui = useUiStore()
const router = useRouter()
const loading = ref(true)
// The engine drops the run when a quest ends. Hold on to the last feed so the
// closing screen still shows how it finished rather than an empty panel.
const lastLog = ref<LogEntry[]>([])

const quest = computed(() => game.activeQuest)
const run = computed(() => game.run)
const encounter = computed(() => game.encounter)
const save = computed(() => game.save)

const finished = computed(
  () => Boolean(quest.value) && !run.value && save.value?.progress.quests_completed.includes(props.questId),
)

const chapter = computed(() => (quest.value ? content.chapterById(quest.value.chapter) : undefined))

const nextQuest = computed(() => {
  if (!chapter.value || !save.value) return null
  const core = chapter.value.quests.filter((entry) => entry.variant !== 'bonus')
  const position = core.findIndex((entry) => entry.id === props.questId)
  return core[position + 1] ?? null
})

const progressLabel = computed(() => {
  if (!quest.value || !save.value?.position) return ''
  return `Encounter ${save.value.position.encounter_index + 1} of ${quest.value.encounters.length}`
})

const perkList = computed(() =>
  (Object.keys(PERKS) as PerkId[]).map((id) => ({
    ...PERKS[id],
    owned: save.value?.perks[id] ?? 0,
  })),
)

async function open(): Promise<void> {
  loading.value = true
  await game.boot()
  const loaded = await game.resume(props.questId)
  if (!loaded) {
    loading.value = false
    return
  }
  const standingHere = save.value?.position?.quest_id === props.questId && save.value?.active
  const alreadyDone = save.value?.progress.quests_completed.includes(props.questId)
  if (!standingHere) {
    if (game.availability(props.questId).unlocked) {
      await game.startQuest(props.questId)
    } else if (!alreadyDone) {
      router.replace('/career')
    }
  }
  loading.value = false
}

watch(
  () => game.run?.log,
  (log) => {
    if (log?.length) lastLog.value = log
  },
  { immediate: true },
)

onMounted(open)
watch(() => props.questId, () => {
  lastLog.value = []
  void open()
})
</script>

<template>
  <div v-if="loading" class="card p-6 text-sm text-ink-500">Opening the ticket...</div>

  <div v-else-if="!quest" class="card p-6">
    <p class="text-sm">That quest is not part of this build yet.</p>
    <RouterLink to="/career" class="btn-primary mt-4">Back to the queue</RouterLink>
  </div>

  <div
    v-else
    class="grid min-w-0 gap-4"
    :class="ui.mapPanelOpen ? 'md:grid-cols-[minmax(0,1fr)_19rem] lg:grid-cols-[minmax(0,1fr)_26rem]' : ''"
  >
    <div class="min-w-0 space-y-4">
      <header class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
            {{ chapter?.title }}
            <span v-if="quest.variant === 'bonus'" class="text-degraded">&middot; exam hard</span>
          </p>
          <h1 class="truncate text-lg font-semibold tracking-tight sm:text-xl">{{ quest.title }}</h1>
        </div>
        <div class="flex items-center gap-2">
          <span class="hidden text-xs text-ink-500 sm:inline dark:text-ink-400">{{ progressLabel }}</span>
          <button class="btn-quiet px-3 md:hidden" type="button" @click="ui.mapSheetOpen = true">
            Map
          </button>
          <button
            class="btn-quiet hidden px-3 md:inline-flex"
            type="button"
            @click="ui.mapPanelOpen = !ui.mapPanelOpen"
          >
            {{ ui.mapPanelOpen ? 'Hide map' : 'Show map' }}
          </button>
        </div>
      </header>

      <p v-if="quest.brief && run?.index === 0" class="prose-beat text-ink-600 dark:text-ink-300">
        {{ quest.brief }}
      </p>

      <section class="card min-w-0 p-3 sm:p-5" aria-label="Story">
        <NarrativeFeed :entries="run?.log ?? lastLog" />
      </section>

      <section v-if="run && !run.resolved && encounter" class="min-w-0 space-y-3">
        <IncidentPanel
          v-if="encounter.type === 'troubleshoot'"
          :encounter="encounter"
          :run="run"
          @investigate="(id) => game.dispatch({ type: 'investigate', id })"
          @command="(id) => game.dispatch({ type: 'command', id })"
          @choose="(id) => game.dispatch({ type: 'choose', option_id: id })"
        />
        <div v-else class="card p-3 sm:p-4">
          <ChoiceList
            :options="encounter.options"
            :eliminated="run.eliminated"
            :disabled="run.resolved"
            :prompt="encounter.type === 'design' ? encounter.prompt : encounter.question"
            @choose="(id) => game.dispatch({ type: 'choose', option_id: id })"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="perk in perkList"
            :key="perk.id"
            type="button"
            class="btn-quiet px-3 text-xs"
            :disabled="!perk.owned"
            :title="perk.blurb"
            @click="game.dispatch({ type: 'use_perk', perk: perk.id })"
          >
            {{ perk.name }} &middot; {{ perk.owned }}
          </button>
          <RouterLink to="/skills" class="text-xs text-signal-600 underline dark:text-signal-400">
            Spend skill points
          </RouterLink>
        </div>
      </section>

      <section v-else-if="run?.resolved" class="flex flex-wrap gap-2">
        <button class="btn-primary" type="button" @click="game.dispatch({ type: 'advance' })">
          Continue
        </button>
      </section>

      <section v-else-if="finished" class="card space-y-4 p-4 sm:p-5">
        <h2 class="text-base font-semibold">Ticket closed</h2>
        <p v-if="quest.debrief" class="prose-beat">{{ quest.debrief }}</p>
        <div class="flex flex-wrap gap-2">
          <RouterLink v-if="nextQuest" :to="`/play/${nextQuest.id}`" class="btn-primary">
            Next: {{ nextQuest.title }}
          </RouterLink>
          <RouterLink to="/career" class="btn-quiet">Back to the queue</RouterLink>
          <RouterLink to="/skills" class="btn-quiet">Skill tree</RouterLink>
        </div>
      </section>
    </div>

    <aside v-if="ui.mapPanelOpen" class="hidden min-w-0 md:block">
      <div class="card sticky top-28 h-[min(70vh,40rem)] overflow-hidden">
        <LivingMap />
      </div>
    </aside>
  </div>

  <MapSheet />
</template>
