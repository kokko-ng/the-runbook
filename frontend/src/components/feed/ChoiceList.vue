<script setup lang="ts">
import type { Option } from '@/engine/types'

defineProps<{
  options: Option[]
  eliminated: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{ choose: [optionId: string] }>()
</script>

<template>
  <ul class="space-y-2">
    <li v-for="option in options" :key="option.id">
      <button
        type="button"
        class="choice"
        :class="{ 'choice--eliminated': eliminated.includes(option.id) }"
        :disabled="disabled || eliminated.includes(option.id)"
        @click="emit('choose', option.id)"
      >
        {{ option.label }}
      </button>
    </li>
  </ul>
</template>
