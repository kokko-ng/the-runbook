<script setup lang="ts">
import { computed } from 'vue'

import type { QuestSummary } from '@/engine'
import { useGameStore } from '@/stores/game'

const props = defineProps<{ quest: QuestSummary }>()
const game = useGameStore()

const availability = computed(() => game.availability(props.quest.id))
const done = computed(() => game.save?.progress.quests_completed.includes(props.quest.id) ?? false)
const typeLabels: Record<string, string> = {
  design: 'design call',
  troubleshoot: 'incident',
  knowledge: 'check',
}
</script>

<template>
  <li>
    <component
      :is="availability.unlocked ? 'RouterLink' : 'div'"
      :to="availability.unlocked ? `/play/${quest.id}` : undefined"
      class="card flex min-h-11 flex-col gap-2 p-4 transition-colors"
      :class="
        availability.unlocked
          ? 'hover:border-signal-500'
          : 'opacity-65'
      "
    >
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-sm font-semibold">
          {{ quest.title }}
          <span v-if="quest.variant === 'bonus'" class="ml-1 text-xs font-normal text-degraded">
            exam hard
          </span>
        </h3>
        <span v-if="done" class="shrink-0 text-xs text-healthy">closed</span>
        <span v-else-if="!availability.unlocked" class="shrink-0 text-xs text-ink-500">locked</span>
      </div>
      <p class="text-sm text-ink-600 dark:text-ink-300">{{ quest.summary }}</p>
      <p class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
        <span>{{ quest.estimated_minutes }} min</span>
        <span>{{ quest.encounter_count }} encounters</span>
        <span>{{ quest.encounter_types.map((type) => typeLabels[type] ?? type).join(', ') }}</span>
      </p>
      <p v-if="!availability.unlocked" class="text-xs text-ink-500 dark:text-ink-400">
        {{ availability.reason }}
      </p>
    </component>
  </li>
</template>
