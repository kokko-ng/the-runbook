<script setup lang="ts">
import { computed } from 'vue'

import type { EngineEvent } from '@/engine/types'

import CommandTerminal from './CommandTerminal.vue'
import ProseBeat from './ProseBeat.vue'
import SpeakerLine from './SpeakerLine.vue'

const props = defineProps<{ event: EngineEvent }>()

/**
 * The gutter marker encodes what kind of entry this is, so the rail can be
 * skimmed: who spoke, what was run, what was decided, and how it went.
 */
const mark = computed(() => {
  switch (props.event.type) {
    case 'investigated':
      return 'voice'
    case 'command_ran':
      return 'machine'
    case 'option_chosen':
      return props.event.correct ? 'right' : 'wrong'
    case 'encounter_entered':
      return 'record'
    default:
      return 'system'
  }
})
</script>

<template>
  <div class="rail entry-in pb-5">
    <span class="rail-mark" :class="`rail-mark--${mark}`" aria-hidden="true" />

    <!-- Someone was asked something and answered. -->
    <template v-if="event.type === 'investigated'">
      <p class="eyebrow mb-1">{{ event.label }}</p>
      <SpeakerLine :speaker="event.speaker" />
      <ProseBeat :text="event.reveals" />
    </template>

    <!-- A command was run against the environment. -->
    <template v-else-if="event.type === 'command_ran'">
      <CommandTerminal :command="event.command" :output="event.output" :note="event.note" />
    </template>

    <!-- A choice was made. -->
    <template v-else-if="event.type === 'option_chosen'">
      <p class="eyebrow mb-1">You chose</p>
      <p class="font-serif text-[0.9375rem] leading-snug italic">{{ event.label }}</p>
    </template>

    <!-- Why it was right or wrong. This is the teaching moment. -->
    <template v-else-if="event.type === 'explanation'">
      <div
        class="border-l-2 py-0.5 pl-3"
        :class="
          event.correct
            ? 'border-[var(--color-healthy)]'
            : 'border-[var(--color-broken)]'
        "
      >
        <p v-if="event.consequence" class="mb-2 font-serif text-[0.9375rem] leading-relaxed">
          {{ event.consequence }}
        </p>
        <p class="eyebrow mb-1">
          {{ event.correct ? 'Why that works' : 'Why that fails' }}
        </p>
        <p class="text-[0.9375rem] leading-relaxed text-[var(--ink)]">{{ event.text }}</p>
      </div>
    </template>

    <!-- Reputation moved. -->
    <template v-else-if="event.type === 'rep_changed' && event.delta !== 0">
      <p class="readout text-[0.8125rem]">
        <span
          :class="
            event.delta > 0 ? 'text-[var(--color-healthy)]' : 'text-[var(--color-broken)]'
          "
        >
          {{ event.delta > 0 ? '+' : '' }}{{ event.delta }} standing
        </span>
        <span class="text-[var(--ink-faint)]"> &rarr; {{ event.rep }}</span>
        <span v-if="event.shielded" class="ml-2 text-[var(--ink-muted)]">(shielded)</span>
      </p>
    </template>

    <template v-else-if="event.type === 'time_changed'">
      <p class="readout text-[0.8125rem] text-[var(--ink-muted)]">
        {{ event.delta > 0 ? '+' : '' }}{{ event.delta }} time
        <span class="text-[var(--ink-faint)]">&rarr; {{ event.remaining }} left</span>
      </p>
    </template>

    <template v-else-if="event.type === 'time_exhausted'">
      <p class="text-[0.875rem] text-[var(--color-broken)]">
        The incident is over budget. Whatever you do next, do it now.
      </p>
    </template>

    <template v-else-if="event.type === 'skill_points_changed' && event.delta > 0">
      <p class="readout text-[0.8125rem] text-[var(--ink-muted)]">
        +{{ event.delta }} skill point<span v-if="event.delta > 1">s</span>
      </p>
    </template>

    <template v-else-if="event.type === 'cluster_lit'">
      <p class="text-[0.875rem]">
        <span class="eyebrow">Skill tree</span>
        <span class="ml-2">{{ event.title }} is complete.</span>
      </p>
    </template>

    <template v-else-if="event.type === 'bonus_unlocked'">
      <p class="text-[0.875rem]">
        Your standing is high enough that Desmond has started handing you the harder
        version of jobs you have already cleared.
      </p>
    </template>

    <template v-else-if="event.type === 'quest_completed'">
      <p class="eyebrow">Closed</p>
      <p class="font-serif text-base">{{ event.title }}</p>
    </template>

    <template v-else-if="event.type === 'checkpoint_restored'">
      <p class="text-[0.875rem] text-[var(--ink-muted)]">
        Back to the start of the job, with the environment as it was.
      </p>
    </template>

    <!-- encounter_entered, phase_changed and the rest render as headers
         elsewhere; nothing to show inline. -->
  </div>
</template>
