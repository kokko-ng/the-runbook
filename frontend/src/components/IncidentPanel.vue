<script setup lang="ts">
import { computed, ref } from 'vue'

import ChoiceList from '@/components/ChoiceList.vue'
import TimeBudget from '@/components/TimeBudget.vue'
import type { EncounterRun, TroubleshootEncounter } from '@/engine'
import { DEFAULT_COMMAND_TIME_COST } from '@/engine'

const props = defineProps<{ encounter: TroubleshootEncounter; run: EncounterRun }>()
const emit = defineEmits<{
  investigate: [string]
  command: [string]
  choose: [string]
}>()

type Phase = 'investigate' | 'diagnose' | 'fix'
const phase = ref<Phase>('investigate')

const phases: { id: Phase; label: string }[] = [
  { id: 'investigate', label: 'Investigate' },
  { id: 'diagnose', label: 'Diagnose' },
  { id: 'fix', label: 'Fix' },
]

const remaining = computed(() =>
  props.encounter.investigate.filter((step) => !props.run.revealed.includes(step.id)),
)
const commandsLeft = computed(() =>
  props.encounter.commands.filter((command) => !props.run.ran.includes(command.id)),
)
function cost(value?: number): number {
  return value ?? DEFAULT_COMMAND_TIME_COST
}
</script>

<template>
  <section class="card p-3 sm:p-4" aria-label="Incident controls">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex rounded-lg border border-ink-200 p-0.5 dark:border-ink-700" role="tablist">
        <button
          v-for="tab in phases"
          :key="tab.id"
          type="button"
          role="tab"
          class="min-h-9 rounded-md px-3 py-1.5 text-sm"
          :class="
            phase === tab.id
              ? 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900'
              : 'text-ink-600 dark:text-ink-300'
          "
          :aria-selected="phase === tab.id"
          @click="phase = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <TimeBudget :left="run.time_left" :budget="run.time_budget" />
    </div>

    <div class="mt-4">
      <div v-if="phase === 'investigate'">
        <p v-if="!remaining.length" class="text-sm text-ink-500 dark:text-ink-400">
          You have asked everyone who was awake.
        </p>
        <ul class="flex flex-col gap-2">
          <li v-for="step in remaining" :key="step.id">
            <button
              type="button"
              class="w-full min-h-11 rounded-xl border border-ink-200 px-4 py-3 text-left text-sm
              hover:border-signal-500 dark:border-ink-700"
              @click="emit('investigate', step.id)"
            >
              {{ step.action }}
              <span v-if="step.time_cost" class="ml-1 font-mono text-xs text-degraded">
                ({{ step.time_cost }} time)
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div v-else-if="phase === 'diagnose'">
        <p class="mb-2 text-xs text-ink-500 dark:text-ink-400">
          Every check costs time. Pick the ones that can actually change your mind.
        </p>
        <p v-if="!commandsLeft.length" class="text-sm text-ink-500 dark:text-ink-400">
          Nothing left to run.
        </p>
        <ul class="flex flex-col gap-2">
          <li v-for="command in commandsLeft" :key="command.id">
            <button
              type="button"
              class="w-full min-h-11 overflow-hidden rounded-xl border border-ink-200 px-3 py-2.5
              text-left hover:border-signal-500 disabled:opacity-40 dark:border-ink-700"
              :disabled="run.time_left < cost(command.time_cost)"
              @click="emit('command', command.id)"
            >
              <span v-if="command.label" class="block text-sm">{{ command.label }}</span>
              <span class="block overflow-x-auto font-mono text-xs text-ink-600 dark:text-ink-300">
                {{ command.cmd }}
              </span>
              <span class="mt-1 block font-mono text-[0.7rem] text-degraded">
                {{ cost(command.time_cost) }} time
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div v-else>
        <ChoiceList
          :options="encounter.fixes"
          :eliminated="run.eliminated"
          :disabled="run.resolved"
          prompt="What do you actually change?"
          @choose="(id) => emit('choose', id)"
        />
      </div>
    </div>
  </section>
</template>
