<script setup lang="ts">
import { computed } from 'vue'

import type { PracticeQuestion } from '@/practice'

const props = defineProps<{
  question: PracticeQuestion
  picked: string[]
  /** Show the answer key, the explanation and the sources. */
  revealed: boolean
  number: number
  total: number
  skillLabel?: string
}>()
const emit = defineEmits<{ toggle: [string] }>()

const letters = 'ABCDEF'

const correct = computed(() => {
  const answer = [...props.question.answer].sort()
  const picked = [...props.picked].sort()
  return answer.length === picked.length && answer.every((id, i) => id === picked[i])
})

function optionClass(id: string): string {
  const isPicked = props.picked.includes(id)
  if (props.revealed) {
    if (props.question.answer.includes(id)) {
      return 'border-healthy bg-healthy/10'
    }
    if (isPicked) return 'border-broken bg-broken/10'
    return 'border-ink-200 bg-white text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400'
  }
  return isPicked
    ? 'border-signal-500 bg-signal-500/10 dark:border-signal-400'
    : 'border-ink-200 bg-white hover:border-signal-500 hover:bg-signal-500/5 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-signal-400'
}

function sourceLabel(url: string): string {
  return url.replace(/^https:\/\/learn\.microsoft\.com\/en-us\//, '').replace(/\/$/, '')
}
</script>

<template>
  <article class="space-y-4">
    <header class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
      <span class="font-mono text-ink-500 dark:text-ink-400">
        Question {{ number }} of {{ total }}
      </span>
      <span v-if="skillLabel" class="text-ink-500 dark:text-ink-400">{{ skillLabel }}</span>
    </header>

    <p class="prose-beat whitespace-pre-line">{{ question.stem }}</p>
    <p v-if="question.kind === 'multiple' && !revealed" class="text-xs text-ink-500 dark:text-ink-400">
      Select {{ question.answer.length }}. Picked {{ picked.length }}.
    </p>

    <ul
      class="flex flex-col gap-2"
      :role="question.kind === 'single' ? 'radiogroup' : 'group'"
      :aria-label="`Answers for question ${number}`"
    >
      <li v-for="(option, index) in question.options" :key="option.id">
        <button
          type="button"
          class="flex w-full min-h-11 items-start gap-3 rounded-xl border px-4 py-3 text-left
          text-sm leading-snug transition-colors disabled:cursor-default"
          :class="optionClass(option.id)"
          :role="question.kind === 'single' ? 'radio' : 'checkbox'"
          :aria-checked="picked.includes(option.id)"
          :disabled="revealed"
          @click="emit('toggle', option.id)"
        >
          <span
            class="grid h-6 w-6 shrink-0 place-items-center border font-mono text-xs"
            :class="[
              question.kind === 'single' ? 'rounded-full' : 'rounded-md',
              picked.includes(option.id)
                ? 'border-signal-600 bg-signal-600 text-white'
                : 'border-ink-300 dark:border-ink-600',
            ]"
            aria-hidden="true"
          >
            {{ letters[index] }}
          </span>
          <span class="min-w-0 pt-0.5">{{ option.text }}</span>
        </button>
      </li>
    </ul>

    <section
      v-if="revealed"
      class="space-y-2 rounded-xl border-l-4 bg-ink-100 p-3 text-sm sm:p-4 dark:bg-ink-800/60"
      :class="correct ? 'border-l-healthy' : 'border-l-broken'"
      aria-live="polite"
    >
      <p class="font-semibold">
        {{
          correct
            ? 'Correct.'
            : picked.length
              ? 'Not quite.'
              : 'Not answered.'
        }}
        <span class="font-normal text-ink-600 dark:text-ink-300">
          Answer:
          {{
            question.options
              .map((option, index) => (question.answer.includes(option.id) ? letters[index] : ''))
              .filter(Boolean)
              .join(', ')
          }}
        </span>
      </p>
      <p class="leading-relaxed">{{ question.explanation }}</p>
      <div>
        <p class="text-xs font-medium text-ink-500 dark:text-ink-400">Source on Microsoft Learn</p>
        <ul class="mt-1 space-y-1">
          <li v-for="source in question.sources" :key="source" class="min-w-0">
            <a
              :href="source"
              class="break-all text-signal-600 underline dark:text-signal-400"
              rel="noreferrer noopener"
              target="_blank"
            >{{ sourceLabel(source) }}</a>
          </li>
        </ul>
      </div>
    </section>
  </article>
</template>
