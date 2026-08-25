<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import {
  FEEDBACK_CATEGORIES,
  buildFeedbackContext,
  describeContext,
  type FeedbackCategory,
} from '@/lib/feedback'
import { api } from '@/lib/api'
import { anonymousId } from '@/lib/storage'
import { useAccountStore } from '@/stores/account'
import { useContentStore } from '@/stores/content'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

/**
 * The feedback button.
 *
 * Deliberately always reachable, and deliberately explicit about what it sends:
 * the panel shows the exact context that travels with the report, because the
 * privacy page promises the player knows what leaves their device.
 */
const game = useGameStore()
const content = useContentStore()
const account = useAccountStore()
const ui = useUiStore()
const route = useRoute()

const open = ref(false)
const category = ref<FeedbackCategory | null>(null)
const message = ref('')
const state = ref<'idle' | 'sending' | 'sent' | 'error'>('idle')
const error = ref('')
const showContext = ref(false)
const field = ref<HTMLTextAreaElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)

const MAX_CHARS = 2000
const remaining = computed(() => MAX_CHARS - message.value.length)

const context = computed(() =>
  buildFeedbackContext({
    route: { path: route.path, name: route.name as string | undefined },
    save: game.save,
    quest: game.activeQuest,
    encounter: game.encounter,
    contentVersion: content.index?.version ?? '',
    theme: ui.theme,
    signedIn: account.signedIn,
    viewport: {
      width: typeof window === 'undefined' ? 0 : window.innerWidth,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
    },
  }),
)

/** A one-line answer to "where am I sending this from". */
const place = computed(() => {
  const questTitle = context.value.quest_title as string | undefined
  const encounterTitle = context.value.encounter_title as string | undefined
  if (questTitle && encounterTitle) return `${questTitle} - ${encounterTitle}`
  if (questTitle) return questTitle
  return route.path
})

function reset(): void {
  category.value = null
  message.value = ''
  state.value = 'idle'
  error.value = ''
  showContext.value = false
}

async function openPanel(): Promise<void> {
  reset()
  open.value = true
  await nextTick()
  field.value?.focus()
}

function closePanel(): void {
  open.value = false
  trigger.value?.focus()
}

async function send(): Promise<void> {
  if (!category.value || state.value === 'sending') return
  state.value = 'sending'
  error.value = ''
  try {
    await api.feedback({
      category: category.value,
      message: message.value.trim(),
      anonymous_id: anonymousId(),
      context: context.value,
    })
    state.value = 'sent'
    setTimeout(() => {
      if (state.value === 'sent') closePanel()
    }, 1800)
  } catch (cause) {
    state.value = 'error'
    error.value =
      cause instanceof Error
        ? cause.message
        : 'That did not reach the server. Your note is still here, so try again.'
  }
}

watch(open, (isOpen) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = isOpen ? 'hidden' : ''
})

// Never leave the page unable to scroll because the panel went away with it.
onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="fixed bottom-3 right-3 z-30 flex min-h-11 items-center gap-2 rounded-full border
    border-ink-200 bg-white/95 px-4 text-sm font-medium shadow-lg backdrop-blur transition-colors
    hover:border-signal-500 dark:border-ink-700 dark:bg-ink-900/95"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @click="openPanel"
  >
    <span aria-hidden="true" class="font-mono text-signal-600 dark:text-signal-400">?</span>
    Feedback
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4"
      @click.self="closePanel"
      @keydown.esc="closePanel"
    >
      <div
        class="card max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-4 sm:rounded-xl sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="feedback-title" class="text-base font-semibold">Tell us what happened</h2>
            <p class="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
              From: {{ place }}
            </p>
          </div>
          <button class="btn-quiet px-3" type="button" @click="closePanel">Close</button>
        </div>

        <template v-if="state !== 'sent'">
          <fieldset class="mt-4">
            <legend class="text-sm font-medium">What kind of thing is it?</legend>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="option in FEEDBACK_CATEGORIES"
                :key="option.id"
                type="button"
                class="min-h-11 rounded-full border px-3 text-sm transition-colors"
                :class="
                  category === option.id
                    ? 'border-signal-600 bg-signal-600 text-white'
                    : 'border-ink-200 hover:border-signal-500 dark:border-ink-700'
                "
                :aria-pressed="category === option.id"
                :title="option.hint"
                @click="category = option.id"
              >
                {{ option.label }}
              </button>
            </div>
            <p class="mt-2 min-h-4 text-xs text-ink-500 dark:text-ink-400">
              {{ FEEDBACK_CATEGORIES.find((option) => option.id === category)?.hint }}
            </p>
          </fieldset>

          <label class="mt-3 block text-sm">
            <span class="mb-1 block font-medium">What should we know?</span>
            <textarea
              ref="field"
              v-model="message"
              rows="4"
              :maxlength="MAX_CHARS"
              placeholder="What you expected, and what happened instead."
              class="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm
              dark:border-ink-700 dark:bg-ink-900"
            />
            <span class="mt-1 block text-right text-xs text-ink-400">{{ remaining }} left</span>
          </label>

          <details class="mt-2 text-xs" :open="showContext">
            <summary class="cursor-pointer text-ink-500 dark:text-ink-400">
              What gets sent with this
            </summary>
            <p class="mt-2 text-ink-500 dark:text-ink-400">
              Where you were and the state of your career, so the scenario can be reproduced. No
              name, no email address, and nothing about your device beyond the window size.
            </p>
            <pre class="console mt-2 max-h-56 overflow-auto text-[0.7rem]">{{ describeContext(context) }}</pre>
          </details>

          <p v-if="state === 'error'" class="mt-3 text-sm text-broken" role="alert">{{ error }}</p>

          <div class="mt-4 flex flex-wrap gap-2">
            <button
              class="btn-primary"
              type="button"
              :disabled="!category || state === 'sending'"
              @click="send"
            >
              {{ state === 'sending' ? 'Sending' : 'Send it' }}
            </button>
            <button class="btn-quiet" type="button" @click="closePanel">Cancel</button>
          </div>
        </template>

        <p v-else class="py-6 text-sm" role="status">
          Sent, with the quest and the state you were in attached. Thank you: this is the only way
          a scenario that reads wrongly gets found.
        </p>
      </div>
    </div>
  </Teleport>
</template>
