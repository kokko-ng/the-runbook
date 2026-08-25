<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import {
  FEEDBACK_CATEGORIES,
  buildFeedbackContext,
  describeContext,
  sheetMetrics,
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
 *
 * On a phone it is a sheet rather than a dialog: the title and the Send button
 * are pinned, only the middle scrolls, and the whole thing sits on top of the
 * on-screen keyboard rather than behind it.
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
const panel = ref<HTMLDivElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)

// Re-measured whenever the panel opens or the window changes, so a report sent
// after a rotation carries the size the player is actually looking at.
const viewport = ref(
  typeof window === 'undefined'
    ? { width: 0, height: 0 }
    : { width: window.innerWidth, height: window.innerHeight },
)

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
    viewport: viewport.value,
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

// --------------------------------------------------------------------------
// keeping the sheet above the keyboard
// --------------------------------------------------------------------------

// The arithmetic lives in sheetMetrics(); this only feeds it the live numbers.
const metrics = ref({ inset: 0, maxHeight: 520 })

function measure(): void {
  if (typeof window === 'undefined') return
  metrics.value = sheetMetrics(window.innerHeight, window.visualViewport)
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
}

const sheetStyle = computed(() => ({ bottom: `${metrics.value.inset}px` }))
const panelStyle = computed(() => ({ maxHeight: `${metrics.value.maxHeight}px` }))

function watchViewport(on: boolean): void {
  if (typeof window === 'undefined') return
  const method = on ? 'addEventListener' : 'removeEventListener'
  window[method]('resize', measure)
  window.visualViewport?.[method]('resize', measure)
  window.visualViewport?.[method]('scroll', measure)
}

function reset(): void {
  category.value = null
  message.value = ''
  state.value = 'idle'
  error.value = ''
  showContext.value = false
}

async function openPanel(): Promise<void> {
  reset()
  measure()
  open.value = true
  await nextTick()
  // Focus the panel, not the text field: on a phone, focusing the field opens
  // the keyboard and scrolls the categories out of view before the player has
  // picked one.
  panel.value?.focus()
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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePanel()
}

watch(open, (isOpen) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = isOpen ? 'hidden' : ''
  watchViewport(isOpen)
  const method = isOpen ? 'addEventListener' : 'removeEventListener'
  window[method]('keydown', onKeydown as EventListener)
})

// Never leave the page unable to scroll, or a listener attached, because the
// panel went away with the route.
onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
  watchViewport(false)
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown as EventListener)
})
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-30 flex min-h-11
    items-center gap-2 rounded-full border border-ink-200 bg-white/95 px-4 text-sm font-medium
    shadow-lg backdrop-blur transition-colors hover:border-signal-500 dark:border-ink-700
    dark:bg-ink-900/95"
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
      class="fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4"
      :style="sheetStyle"
      @click.self="closePanel"
    >
      <div
        ref="panel"
        class="card flex w-full max-w-lg flex-col overflow-hidden rounded-b-none rounded-t-2xl
        focus-visible:outline-none sm:rounded-xl"
        tabindex="-1"
        :style="panelStyle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <div
          class="flex shrink-0 items-start justify-between gap-3 border-b border-ink-200 px-4 py-3
          dark:border-ink-800 sm:px-5"
        >
          <div class="min-w-0">
            <h2 id="feedback-title" class="text-base font-semibold">Tell us what happened</h2>
            <p class="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">From: {{ place }}</p>
          </div>
          <button class="btn-quiet shrink-0 px-3" type="button" @click="closePanel">Close</button>
        </div>

        <!-- Only the middle scrolls, so the title and the Send button stay put. -->
        <div class="min-h-0 grow overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <template v-if="state !== 'sent'">
            <fieldset>
              <legend class="text-sm font-medium">What kind of thing is it?</legend>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  v-for="option in FEEDBACK_CATEGORIES"
                  :key="option.id"
                  type="button"
                  class="min-h-11 grow rounded-full border px-3 text-sm transition-colors sm:grow-0"
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
              <!-- 16 px on a phone: anything smaller makes iOS zoom the page in
                   the moment the field takes focus. -->
              <textarea
                v-model="message"
                rows="4"
                :maxlength="MAX_CHARS"
                placeholder="What you expected, and what happened instead."
                class="w-full rounded-lg border border-ink-200 bg-white p-3 text-base
                dark:border-ink-700 dark:bg-ink-900 sm:text-sm"
              />
              <span class="mt-1 block text-right text-xs text-ink-400">{{ remaining }} left</span>
            </label>

            <details class="mt-2 text-xs" :open="showContext">
              <summary class="min-h-11 cursor-pointer content-center text-ink-500 dark:text-ink-400">
                What gets sent with this
              </summary>
              <p class="mt-1 text-ink-500 dark:text-ink-400">
                Where you were and the state of your career, so the scenario can be reproduced. No
                name, no email address, and nothing about your device beyond the window size.
              </p>
              <pre class="console mt-2 max-h-44 overflow-auto text-[0.7rem]">{{ describeContext(context) }}</pre>
            </details>

            <p v-if="state === 'error'" class="mt-3 text-sm text-broken" role="alert">{{ error }}</p>
          </template>

          <p v-else class="py-4 text-sm" role="status">
            Sent, with the quest and the state you were in attached. Thank you: this is the only
            way a scenario that reads wrongly gets found.
          </p>
        </div>

        <div
          v-if="state !== 'sent'"
          class="flex shrink-0 gap-2 border-t border-ink-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]
          dark:border-ink-800 sm:px-5"
        >
          <button
            class="btn-primary grow sm:grow-0"
            type="button"
            :disabled="!category || state === 'sending'"
            @click="send"
          >
            {{ state === 'sending' ? 'Sending' : 'Send it' }}
          </button>
          <button class="btn-quiet grow sm:grow-0" type="button" @click="closePanel">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
