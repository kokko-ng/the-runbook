<script setup lang="ts">
/** Anything with an id and a label deals: options, fixes, post-mortem answers. */
interface Choice {
  id: string
  label: string
}

defineProps<{
  options: Choice[]
  eliminated: string[]
  disabled: boolean
  prompt?: string
}>()
const emit = defineEmits<{ choose: [string] }>()
</script>

<template>
  <div class="space-y-3">
    <p v-if="prompt" class="text-sm font-medium">{{ prompt }}</p>
    <ul class="flex flex-col gap-2">
      <li v-for="option in options" :key="option.id">
        <button
          type="button"
          class="w-full min-h-11 rounded-xl border px-4 py-3 text-left text-sm leading-snug
          transition-colors"
          :class="
            eliminated.includes(option.id)
              ? 'cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400 line-through dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-600'
              : 'border-ink-200 bg-white hover:border-signal-500 hover:bg-signal-500/5 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-signal-400'
          "
          :disabled="disabled || eliminated.includes(option.id)"
          @click="emit('choose', option.id)"
        >
          {{ option.label }}
        </button>
      </li>
    </ul>
  </div>
</template>
