<script setup lang="ts">
import { computed } from 'vue'

import { useGameStore } from '@/stores/game'
import type { TroubleshootEncounter } from '@/engine/types'

import ChoiceList from './ChoiceList.vue'
import ProseBeat from './ProseBeat.vue'
import SpeakerLine from './SpeakerLine.vue'
import TicketCard from './TicketCard.vue'
import TimeBudget from '../hud/TimeBudget.vue'

const game = useGameStore()

const encounter = computed(() => game.encounter)
const incident = computed(() =>
  encounter.value?.type === 'troubleshoot' ? (encounter.value as TroubleshootEncounter) : null,
)

/** Investigations and commands are one-shot; used ones stay listed but spent. */
const investigations = computed(() => incident.value?.investigate ?? [])
const commands = computed(() => incident.value?.commands ?? [])

const outOfTime = computed(() => (game.state.encounter.timeRemaining ?? 1) <= 0)

const showsScenario = computed(
  () => game.state.phase === 'scenario' || game.state.phase === 'investigate',
)

/** The brief has been read once the player has acted on it. */
const briefRead = computed(
  () =>
    game.state.encounter.attempts > 0 ||
    game.state.encounter.revealedActionIds.length > 0 ||
    game.state.encounter.ranCommandIds.length > 0,
)

const heading = computed(() => {
  switch (game.state.phase) {
    case 'investigate':
      return { eyebrow: 'Investigate', hint: 'Ask around and read what came in. This costs little.' }
    case 'diagnose':
      return { eyebrow: 'Diagnose', hint: 'Every command spends time against the incident budget.' }
    case 'fix':
      return { eyebrow: 'Resolve', hint: 'Pick the fix. A wrong one costs standing and time.' }
    default:
      return null
  }
})
</script>

<template>
  <section v-if="encounter" class="space-y-4">
    <!-- The beat itself. Once the player has answered once they have read it,
         so it collapses to a re-openable brief rather than repeating in full. -->
    <div v-if="showsScenario">
      <p v-if="encounter.title" class="eyebrow mb-2">{{ encounter.title }}</p>

      <template v-if="!briefRead">
        <TicketCard v-if="incident?.ticket" :ticket="incident.ticket" class="mb-4" />
        <SpeakerLine :speaker="encounter.speaker" />
        <ProseBeat v-if="encounter.scenario" :text="encounter.scenario" />
      </template>

      <details v-else class="panel px-3 py-2">
        <summary class="eyebrow cursor-pointer select-none">Re-read the brief</summary>
        <div class="mt-3">
          <TicketCard v-if="incident?.ticket" :ticket="incident.ticket" class="mb-4" />
          <SpeakerLine :speaker="encounter.speaker" />
          <ProseBeat v-if="encounter.scenario" :text="encounter.scenario" />
        </div>
      </details>
    </div>

    <!-- Design decision and knowledge check: one menu, straight to the point. -->
    <template v-if="encounter.type !== 'troubleshoot' && game.state.phase === 'scenario'">
      <p
        v-if="encounter.type === 'knowledge_check'"
        class="font-serif text-[1.0625rem] leading-relaxed"
      >
        {{ encounter.question }}
      </p>
      <p
        v-else-if="encounter.prompt"
        class="font-serif text-[1.0625rem] leading-relaxed font-semibold"
      >
        {{ encounter.prompt }}
      </p>
      <ChoiceList
        :options="encounter.options"
        :eliminated="game.eliminated"
        @choose="game.dispatch({ type: 'CHOOSE_OPTION', optionId: $event })"
      />
    </template>

    <!-- Troubleshooting: three phases, each its own menu. -->
    <template v-if="incident">
      <div
        v-if="heading"
        class="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule)] pt-3"
      >
        <div>
          <p class="eyebrow">{{ heading.eyebrow }}</p>
          <p class="mt-0.5 text-[0.8125rem] text-[var(--ink-muted)]">{{ heading.hint }}</p>
        </div>
        <TimeBudget
          :remaining="game.state.encounter.timeRemaining ?? 0"
          :budget="incident.timeBudget"
        />
      </div>

      <template v-if="game.state.phase === 'investigate'">
        <ul class="space-y-2">
          <li v-for="action in investigations" :key="action.id">
            <button
              type="button"
              class="choice"
              :class="{
                'choice--eliminated': game.state.encounter.revealedActionIds.includes(action.id),
              }"
              :disabled="game.state.encounter.revealedActionIds.includes(action.id)"
              @click="game.dispatch({ type: 'RUN_INVESTIGATE', actionId: action.id })"
            >
              {{ action.label }}
              <span v-if="action.timeCost > 0" class="readout ml-1 text-[var(--ink-faint)]">
                ({{ action.timeCost }} time unit<template v-if="action.timeCost !== 1">s</template>)
              </span>
            </button>
          </li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-primary"
            @click="game.dispatch({ type: 'ENTER_PHASE', phase: 'diagnose' })"
          >
            Open a terminal
          </button>
          <button
            type="button"
            class="btn btn-quiet"
            @click="game.dispatch({ type: 'ENTER_PHASE', phase: 'fix' })"
          >
            Go straight to the fix
          </button>
        </div>
      </template>

      <template v-else-if="game.state.phase === 'diagnose'">
        <ul class="space-y-2">
          <li v-for="command in commands" :key="command.id">
            <button
              type="button"
              class="choice"
              :class="{
                'choice--eliminated': game.state.encounter.ranCommandIds.includes(command.id),
              }"
              :disabled="game.state.encounter.ranCommandIds.includes(command.id) || outOfTime"
              @click="game.dispatch({ type: 'RUN_COMMAND', commandId: command.id })"
            >
              <span class="readout block text-[0.8125rem] leading-snug break-all">
                {{ command.command }}
              </span>
              <span class="mt-1 block text-[0.75rem] text-[var(--ink-faint)]">
                {{ command.timeCost }} time unit<template v-if="command.timeCost !== 1">s</template>
              </span>
            </button>
          </li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-primary"
            @click="game.dispatch({ type: 'ENTER_PHASE', phase: 'fix' })"
          >
            Apply a fix
          </button>
          <button
            type="button"
            class="btn btn-quiet"
            @click="game.dispatch({ type: 'ENTER_PHASE', phase: 'investigate' })"
          >
            Back to asking around
          </button>
        </div>
      </template>

      <template v-else-if="game.state.phase === 'fix'">
        <ChoiceList
          :options="incident.fixes"
          :eliminated="game.eliminated"
          @choose="game.dispatch({ type: 'CHOOSE_OPTION', optionId: $event })"
        />
      </template>
    </template>

    <!-- Resolved: the only way forward is on. -->
    <div v-if="game.canAdvance" class="border-t border-[var(--rule)] pt-4">
      <button type="button" class="btn btn-primary" @click="game.dispatch({ type: 'ADVANCE' })">
        Carry on
      </button>
    </div>
  </section>
</template>
