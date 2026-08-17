<script setup lang="ts">
import { computed } from 'vue'

import type { Speaker } from '@/engine/types'

const props = defineProps<{ speaker?: Speaker }>()

/** The recurring cast. Names live here so the fiction stays consistent. */
const CAST: Record<Speaker, { name: string; role: string }> = {
  manager: { name: 'Priya Raman', role: 'Infrastructure manager' },
  mentor: { name: 'Desmond Toh', role: 'Senior cloud admin' },
  cfo: { name: 'Evelyn Koh', role: 'Chief financial officer' },
  security: { name: 'Marcus Lim', role: 'Security officer' },
  noc: { name: 'NOC Manila', role: 'Network operations' },
  ticket: { name: 'Service desk', role: 'Ticket' },
  self: { name: 'You', role: '' },
  narrator: { name: '', role: '' },
}

const person = computed(() => (props.speaker ? CAST[props.speaker] : null))
</script>

<template>
  <p v-if="person && person.name" class="eyebrow mb-1.5">
    {{ person.name }}
    <span
      v-if="person.role"
      class="font-normal normal-case tracking-normal text-[var(--ink-faint)]"
    >
      · {{ person.role }}
    </span>
  </p>
</template>
