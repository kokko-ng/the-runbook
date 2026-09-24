<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import PracticeDisclosure from '@/components/PracticeDisclosure.vue'
import PracticeQuestion from '@/components/PracticeQuestion.vue'
import {
  formatClock,
  goTo,
  isAnswered,
  isCorrect,
  isExpired,
  reveal,
  score,
  timeLeftMs,
  toggleFlag,
  toggleOption,
} from '@/practice'
import type { AttemptMode, PracticeExam } from '@/practice'
import { usePracticeStore } from '@/stores/practice'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ examId: string }>()

const practice = usePracticeStore()
const ui = useUiStore()
const exam = ref<PracticeExam | null>(null)
const loading = ref(true)
const now = ref(Date.now())
const panelOpen = ref(false)
/** Submitting is one-way, so on a phone it takes two deliberate taps. */
const confirming = ref(false)
const questionCard = ref<HTMLElement | null>(null)
const filter = ref<'all' | 'wrong' | 'flagged'>('all')
let timer: ReturnType<typeof setInterval> | undefined

const attempt = computed(() => practice.attempt(props.examId))
const inProgress = computed(() => Boolean(attempt.value && attempt.value.submitted_at === null))
const submitted = computed(() => Boolean(attempt.value && attempt.value.submitted_at !== null))
const question = computed(() =>
  exam.value && attempt.value ? exam.value.questions[attempt.value.current] ?? null : null,
)
const certification = computed(() =>
  practice.index?.certifications.find((cert) => cert.exam === exam.value?.exam),
)
const domainTitle = computed(() => {
  const titles = new Map((certification.value?.domains ?? []).map((d) => [d.id, d.title]))
  return (id: string) => titles.get(id) ?? id
})
const history = computed(() => practice.history(props.examId))
const result = computed(() =>
  exam.value && attempt.value && submitted.value ? score(exam.value, attempt.value) : null,
)
const answeredCount = computed(() =>
  exam.value && attempt.value
    ? exam.value.questions.filter((q) => isAnswered(attempt.value!, q)).length
    : 0,
)
const timeLeft = computed(() => (attempt.value ? timeLeftMs(attempt.value, now.value) : null))
const reviewList = computed(() => {
  if (!exam.value || !attempt.value) return []
  const current = attempt.value
  return exam.value.questions
    .map((q, index) => ({ q, index }))
    .filter(({ q }) =>
      filter.value === 'wrong'
        ? !isCorrect(current, q)
        : filter.value === 'flagged'
          ? current.flagged.includes(q.id)
          : true,
    )
})

function start(mode: AttemptMode): void {
  if (!exam.value) return
  practice.start(exam.value, mode)
  panelOpen.value = false
  window.scrollTo({ top: 0 })
}

function toggle(optionId: string): void {
  if (!attempt.value || !question.value) return
  practice.setAttempt(toggleOption(attempt.value, question.value, optionId))
}

/** Changing question brings its first line back into view, which on a phone is off-screen. */
function move(index: number): void {
  if (!attempt.value || !exam.value) return
  practice.setAttempt(goTo(attempt.value, exam.value, index))
  void nextTick(() => {
    const card = questionCard.value
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' })
  })
}

function jump(index: number): void {
  panelOpen.value = false
  move(index)
  void nextTick(() => questionCard.value?.scrollIntoView({ block: 'start' }))
}

function openPanel(): void {
  panelOpen.value = true
  void nextTick(() =>
    document.getElementById('question-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
  )
}

function togglePanel(): void {
  confirming.value = false
  if (panelOpen.value) panelOpen.value = false
  else openPanel()
}

function flag(): void {
  if (!attempt.value || !question.value) return
  practice.setAttempt(toggleFlag(attempt.value, question.value.id))
}

function check(): void {
  if (!attempt.value || !question.value) return
  practice.setAttempt(reveal(attempt.value, question.value))
}

function finish(): void {
  if (!exam.value) return
  practice.finish(exam.value)
  panelOpen.value = false
  confirming.value = false
  filter.value = defaultFilter()
  window.scrollTo({ top: 0 })
}

/** Open the review on what needs attention: the misses, if there are any. */
function defaultFilter(): 'all' | 'wrong' {
  if (!exam.value || !attempt.value) return 'all'
  const current = attempt.value
  return exam.value.questions.some((q) => !isCorrect(current, q)) ? 'wrong' : 'all'
}

function retake(): void {
  practice.discard(props.examId)
  window.scrollTo({ top: 0 })
}

function navClass(index: number): string {
  if (!exam.value || !attempt.value) return ''
  const q = exam.value.questions[index]!
  const current = attempt.value.current === index
  const base = current ? 'ring-2 ring-signal-500 ' : ''
  if (attempt.value.revealed.includes(q.id)) {
    return base + (isCorrect(attempt.value, q) ? 'bg-healthy/20' : 'bg-broken/20')
  }
  return (
    base +
    (isAnswered(attempt.value, q)
      ? 'bg-signal-600 text-white'
      : 'bg-white text-ink-600 dark:bg-ink-900 dark:text-ink-300')
  )
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function tick(): void {
  now.value = Date.now()
  if (exam.value && attempt.value && isExpired(attempt.value, now.value)) finish()
}

async function load(): Promise<void> {
  loading.value = true
  const [loaded] = await Promise.all([practice.loadExam(props.examId), practice.loadIndex()])
  exam.value = loaded
  loading.value = false
  filter.value = defaultFilter()
  tick()
}

watch(() => props.examId, load)

onMounted(() => {
  void load()
  timer = setInterval(tick, 1000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-5">
    <div class="flex items-center justify-between gap-2">
      <RouterLink
        to="/practice"
        class="inline-flex min-h-11 items-center whitespace-nowrap text-sm text-signal-600
        underline dark:text-signal-400"
      >
        All practice exams
      </RouterLink>
      <button
        class="btn-quiet whitespace-nowrap px-3"
        type="button"
        aria-label="Report a problem with this exam"
        @click="ui.requestFeedback()"
      >
        <span aria-hidden="true" class="font-mono text-signal-600 dark:text-signal-400">?</span>
        Feedback
      </button>
    </div>

    <div v-if="loading" class="card p-6 text-sm text-ink-500">Loading the exam...</div>
    <p v-else-if="!exam" class="card border-broken/40 p-4 text-sm text-broken" role="alert">
      {{ practice.error ?? 'That practice exam does not exist.' }}
    </p>

    <!-- Taking the exam -->
    <template v-else-if="inProgress && attempt && question">
      <header class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
            {{ attempt.mode === 'exam' ? 'Timed exam' : 'Study mode' }}
          </p>
          <h1 class="text-base font-semibold leading-snug">{{ exam.title }}</h1>
        </div>
        <button
          class="btn-quiet shrink-0 px-3"
          type="button"
          :aria-pressed="attempt.flagged.includes(question.id)"
          :class="attempt.flagged.includes(question.id) && 'border-degraded text-degraded dark:text-degraded'"
          @click="flag"
        >
          {{ attempt.flagged.includes(question.id) ? 'Flagged' : 'Flag' }}
        </button>
      </header>

      <section ref="questionCard" class="card scroll-mt-24 p-4 sm:p-5">
        <PracticeQuestion
          :question="question"
          :picked="attempt.answers[question.id] ?? []"
          :revealed="attempt.revealed.includes(question.id)"
          :number="attempt.current + 1"
          :total="exam.questions.length"
          :skill-label="attempt.mode === 'study' ? domainTitle(question.domain) : undefined"
          @toggle="toggle"
        />
      </section>

      <!-- The question grid and the submit step fold away so the question keeps the screen. -->
      <section
        v-if="panelOpen"
        id="question-panel"
        class="card scroll-mt-24 space-y-3 p-4"
        aria-label="All questions"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span class="text-ink-600 dark:text-ink-300">
            {{ answeredCount }} of {{ exam.questions.length }} answered,
            {{ attempt.flagged.length }} flagged
          </span>
          <span class="text-ink-500 dark:text-ink-400">Filled: answered. Dot: flagged.</span>
        </div>
        <ol class="grid grid-cols-5 gap-2 sm:grid-cols-10">
          <li v-for="(q, index) in exam.questions" :key="q.id">
            <button
              type="button"
              class="relative grid min-h-11 w-full place-items-center rounded-lg border
              border-ink-200 font-mono text-sm dark:border-ink-700"
              :class="navClass(index)"
              :aria-label="`Question ${index + 1}${isAnswered(attempt, q) ? ', answered' : ''}${attempt.flagged.includes(q.id) ? ', flagged' : ''}`"
              :aria-current="attempt.current === index ? 'step' : undefined"
              @click="jump(index)"
            >
              {{ index + 1 }}
              <span
                v-if="attempt.flagged.includes(q.id)"
                class="absolute right-1 top-1 h-2 w-2 rounded-full bg-degraded"
                aria-hidden="true"
              />
            </button>
          </li>
        </ol>
        <div
          class="space-y-3 rounded-xl border-l-4 border-l-degraded bg-ink-100 p-3 dark:bg-ink-800/60"
          role="group"
          aria-labelledby="confirm-title"
        >
          <p id="confirm-title" class="text-sm font-semibold">
            {{ attempt.mode === 'exam' ? 'Submit the exam' : 'Finish studying' }}
          </p>
          <p class="text-sm text-ink-600 dark:text-ink-300">
            {{ exam.questions.length - answeredCount }} unanswered. Unanswered questions score as
            wrong.
          </p>
          <button
            v-if="!confirming"
            class="btn-primary w-full sm:w-auto"
            type="button"
            @click="confirming = true"
          >
            Submit and score
          </button>
          <div v-else class="grid grid-cols-2 gap-2 sm:flex">
            <button class="btn-primary" type="button" @click="finish">Yes, submit</button>
            <button class="btn-quiet" type="button" @click="confirming = false">Keep going</button>
          </div>
        </div>
      </section>

      <PracticeDisclosure compact />

      <!-- Thumb-reach controls: pinned to the bottom of the screen on every width. -->
      <nav
        class="sticky bottom-0 z-20 -mx-3 border-t border-ink-200 bg-ink-50/95 px-3 pt-2
        pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-xl
        sm:border dark:border-ink-800 dark:bg-ink-950/95"
        aria-label="Question navigation"
      >
        <div class="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <button
            class="btn-quiet px-3"
            type="button"
            :disabled="attempt.current === 0"
            aria-label="Previous question"
            @click="move(attempt.current - 1)"
          >
            Back
          </button>
          <button
            v-if="attempt.mode === 'study' && !attempt.revealed.includes(question.id)"
            class="btn-primary"
            type="button"
            :disabled="!isAnswered(attempt, question)"
            @click="check"
          >
            Check answer
          </button>
          <button
            v-else-if="attempt.current < exam.questions.length - 1"
            class="btn-primary"
            type="button"
            @click="move(attempt.current + 1)"
          >
            Next question
          </button>
          <button v-else class="btn-primary" type="button" @click="openPanel">
            Review and submit
          </button>
          <button
            class="btn-quiet flex-col gap-0 px-3 py-1 leading-tight"
            type="button"
            :aria-expanded="panelOpen"
            aria-controls="question-panel"
            @click="togglePanel"
          >
            <span class="font-mono text-xs tabular-nums">
              {{ attempt.current + 1 }}/{{ exam.questions.length }}
            </span>
            <span
              v-if="timeLeft !== null"
              class="font-mono text-xs tabular-nums"
              :class="timeLeft < 5 * 60_000 ? 'text-broken' : 'text-ink-500 dark:text-ink-400'"
              role="timer"
              :aria-label="`Time left ${formatClock(timeLeft)}`"
            >
              {{ formatClock(timeLeft) }}
            </span>
            <span v-else class="text-xs text-ink-500 dark:text-ink-400">All</span>
          </button>
        </div>
      </nav>
    </template>

    <!-- Results -->
    <template v-else-if="submitted && attempt && result">
      <header class="space-y-1">
        <p class="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">Results</p>
        <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">{{ exam.title }}</h1>
      </header>

      <section
        class="card space-y-4 border-l-4 p-4 sm:p-5"
        :class="result.passed ? 'border-l-healthy' : 'border-l-broken'"
      >
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p class="font-mono text-3xl font-semibold tabular-nums">{{ result.percent }}%</p>
          <p class="text-sm">
            {{ result.correct }} of {{ result.total }} correct.
            <strong>{{ result.passed ? 'Above' : 'Below' }}</strong>
            the {{ exam.passing_percent }}% practice pass mark.
          </p>
        </div>
        <p class="text-xs text-ink-500 dark:text-ink-400">
          The real exam reports a scaled score out of 1000 with 700 to pass; a percentage on a
          practice exam is a rough guide, not a prediction.
        </p>
        <ul class="space-y-2">
          <li v-for="domain in result.by_domain" :key="domain.domain" class="space-y-1">
            <div class="flex justify-between gap-2 text-sm">
              <span class="min-w-0">{{ domainTitle(domain.domain) }}</span>
              <span class="shrink-0 font-mono tabular-nums">
                {{ domain.correct }}/{{ domain.total }}
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
              <div
                class="h-full rounded-full"
                :class="
                  domain.correct / domain.total >= exam.passing_percent / 100
                    ? 'bg-healthy'
                    : 'bg-degraded'
                "
                :style="{ width: `${(domain.correct / domain.total) * 100}%` }"
              />
            </div>
          </li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <button class="btn-primary" type="button" @click="retake">Take it again</button>
          <RouterLink to="/practice" class="btn-quiet">Another exam</RouterLink>
        </div>
      </section>

      <PracticeDisclosure compact />

      <section class="space-y-3" aria-labelledby="review-title">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="review-title" class="text-base font-semibold">Review every question</h2>
          <div class="flex gap-1" role="group" aria-label="Filter questions">
            <button
              v-for="option in (['all', 'wrong', 'flagged'] as const)"
              :key="option"
              type="button"
              class="btn-quiet px-3"
              :class="filter === option && 'border-signal-500 text-signal-600 dark:text-signal-400'"
              :aria-pressed="filter === option"
              @click="filter = option"
            >
              {{ { all: 'All', wrong: 'Missed', flagged: 'Flagged' }[option] }}
            </button>
          </div>
        </div>
        <p class="text-xs text-ink-500 dark:text-ink-400">
          Tap a question to see the answer, the explanation and its Microsoft Learn source.
        </p>
        <p v-if="!reviewList.length" class="card p-4 text-sm text-ink-500">Nothing here.</p>
        <ol class="space-y-2">
          <li v-for="{ q, index } in reviewList" :key="q.id">
            <details class="card group">
              <summary
                class="flex min-h-11 cursor-pointer list-none items-start gap-3 p-4
                [&::-webkit-details-marker]:hidden"
              >
                <span
                  class="mt-0.5 grid h-6 min-w-8 shrink-0 place-items-center rounded-md px-1
                  font-mono text-xs"
                  :class="isCorrect(attempt, q) ? 'bg-healthy/20' : 'bg-broken/20'"
                >
                  {{ index + 1 }}
                </span>
                <span class="min-w-0 grow">
                  <span class="block text-xs text-ink-500 dark:text-ink-400">
                    {{ isCorrect(attempt, q) ? 'Correct' : (attempt.answers[q.id] ?? []).length ? 'Missed' : 'Not answered' }}
                    <template v-if="attempt.flagged.includes(q.id)"> - flagged</template>
                  </span>
                  <span class="block text-sm font-medium">{{ q.skill }}</span>
                  <span class="mt-0.5 line-clamp-2 text-sm text-ink-600 group-open:hidden dark:text-ink-300">
                    {{ q.stem }}
                  </span>
                </span>
                <span
                  class="mt-0.5 shrink-0 text-ink-400 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                >&gt;</span>
              </summary>
              <div class="border-t border-ink-200 p-4 sm:p-5 dark:border-ink-800">
                <PracticeQuestion
                  :question="q"
                  :picked="attempt.answers[q.id] ?? []"
                  revealed
                  :number="index + 1"
                  :total="exam.questions.length"
                />
              </div>
            </details>
          </li>
        </ol>
      </section>
    </template>

    <!-- Start screen -->
    <template v-else>
      <header class="space-y-2">
        <p class="font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
          {{ exam.exam }}
        </p>
        <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">{{ exam.title }}</h1>
        <p class="text-sm text-ink-600 dark:text-ink-300">
          {{ exam.questions.length }} questions, {{ exam.time_limit_minutes }} minutes when timed,
          {{ exam.passing_percent }}% to pass. Written by {{ exam.author }} on
          {{ exam.written_on }}.
        </p>
      </header>

      <PracticeDisclosure />

      <section class="grid gap-3 sm:grid-cols-2">
        <div class="card flex flex-col gap-3 p-4 sm:p-5">
          <h2 class="text-base font-semibold">Timed exam</h2>
          <p class="grow text-sm text-ink-600 dark:text-ink-300">
            A clock of {{ exam.time_limit_minutes }} minutes, no feedback until you submit, then a
            score by domain and a full review. Closing the tab keeps your place; the clock keeps
            running.
          </p>
          <button class="btn-primary" type="button" @click="start('exam')">Start timed exam</button>
        </div>
        <div class="card flex flex-col gap-3 p-4 sm:p-5">
          <h2 class="text-base font-semibold">Study mode</h2>
          <p class="grow text-sm text-ink-600 dark:text-ink-300">
            No clock. Check each answer as you go and read the explanation and the Microsoft Learn
            source before moving on.
          </p>
          <button class="btn-quiet" type="button" @click="start('study')">Start studying</button>
        </div>
      </section>

      <section v-if="history.length" class="card space-y-2 p-4 sm:p-5">
        <h2 class="text-base font-semibold">Your past scores</h2>
        <ul class="space-y-1 text-sm">
          <li v-for="entry in history" :key="entry.submitted_at" class="flex justify-between gap-2">
            <span>
              {{ formatDate(entry.submitted_at) }}
              <span class="text-ink-500 dark:text-ink-400">
                ({{ entry.mode === 'exam' ? 'timed' : 'study' }})
              </span>
            </span>
            <span
              class="font-mono tabular-nums"
              :class="entry.passed ? 'text-healthy' : 'text-broken'"
            >
              {{ entry.percent }}%
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
