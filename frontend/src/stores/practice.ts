import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'

import { ApiError, api } from '@/lib/api'
import { loadPractice, normalizePractice, persistPractice } from '@/lib/storage'
import type { PracticeStore } from '@/lib/storage'
import {
  HISTORY_LIMIT,
  mergePractice,
  score,
  startAttempt,
  submit as submitAttempt,
} from '@/practice'
import type { Attempt, AttemptMode, PracticeExam, PracticeIndex, PracticeRecord } from '@/practice'
import { useAccountStore } from './account'

/** Answers arrive a click at a time; wait for a pause before sending them up. */
const PUSH_DELAY_MS = 2000
/** After a failed push (offline, server down), try again this much later. */
const RETRY_DELAY_MS = 30_000

/** An ISO stamp later than now and than every stamp given, so it always wins. */
function stampAfter(...stamps: string[]): string {
  const floor = Math.max(0, ...stamps.map((stamp) => Date.parse(stamp) || 0))
  return new Date(Math.max(Date.now(), floor + 1)).toISOString()
}

/** Compare two records by content, ignoring key order and the change stamp. */
function sameRecord(a: PracticeRecord, b: PracticeRecord): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
          )
        : value
  const strip = ({ attempts, history, discarded }: PracticeRecord) => ({
    attempts,
    history,
    discarded,
  })
  return JSON.stringify(canonical(strip(a))) === JSON.stringify(canonical(strip(b)))
}

/**
 * Practice exams are compiled to static JSON beside the game content. The
 * store fetches them, owns the in-progress attempt for each exam and the score
 * history, and persists both to localStorage and, when the player is signed
 * in, to their account on the server. The rules live in `@/practice`.
 */
export const usePracticeStore = defineStore('practice', () => {
  const index = shallowRef<PracticeIndex | null>(null)
  const exams = shallowRef<Record<string, PracticeExam>>({})
  const error = ref<string | null>(null)
  const saved = ref<PracticeStore>(loadPractice())

  async function loadIndex(): Promise<PracticeIndex | null> {
    if (index.value) return index.value
    try {
      const response = await fetch('/content/practice_exams/index.json', { cache: 'no-cache' })
      if (!response.ok) throw new Error(`practice index returned ${response.status}`)
      index.value = markRaw((await response.json()) as PracticeIndex)
      error.value = null
    } catch (cause) {
      error.value = 'The practice exams could not be loaded. Check your connection and reload.'
      console.error(cause)
    }
    return index.value
  }

  async function loadExam(id: string): Promise<PracticeExam | null> {
    const cached = exams.value[id]
    if (cached) return cached
    try {
      const response = await fetch(`/content/practice_exams/${id}.json`, { cache: 'no-cache' })
      if (!response.ok) throw new Error(`practice exam ${id} returned ${response.status}`)
      const exam = markRaw((await response.json()) as PracticeExam)
      exams.value = { ...exams.value, [id]: exam }
      error.value = null
      return exam
    } catch (cause) {
      error.value = `Practice exam "${id}" could not be loaded.`
      console.error(cause)
      return null
    }
  }

  let pushTimer: ReturnType<typeof setTimeout> | undefined

  function persist(): void {
    saved.value = { ...saved.value, updated_at: stampAfter(saved.value.updated_at) }
    persistPractice(saved.value)
    schedulePush()
  }

  function schedulePush(delay = PUSH_DELAY_MS): void {
    if (!useAccountStore().signedIn) return
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void push(), delay)
  }

  /** Send the local record up. A newer copy on the server is merged in instead. */
  async function push(): Promise<void> {
    clearTimeout(pushTimer)
    pushTimer = undefined
    if (!useAccountStore().signedIn || !saved.value.updated_at) return
    try {
      await api.putPractice(saved.value)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        await pull()
        return
      }
      // The local copy is safe either way; a refusal other than 409 will not improve.
      if (!(cause instanceof ApiError) || cause.status >= 500) schedulePush(RETRY_DELAY_MS)
    }
  }

  /** Merge the server copy into the local one, and send the result back if it differs. */
  async function pull(): Promise<void> {
    if (!useAccountStore().signedIn) return
    try {
      const remote = await api.getPractice()
      const theirs = normalizePractice(remote.blob)
      const merged = mergePractice(saved.value, theirs)
      const localChanged = !sameRecord(merged, saved.value)
      const remoteChanged = !sameRecord(merged, theirs)
      if (!localChanged && !remoteChanged) return
      saved.value = {
        ...merged,
        updated_at: stampAfter(saved.value.updated_at, theirs.updated_at, remote.updated_at),
      }
      if (localChanged) persistPractice(saved.value)
      if (remoteChanged) await api.putPractice(saved.value)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) await push()
    }
  }

  // Leaving the tab sends any answers still waiting out the debounce.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && pushTimer !== undefined) void push()
    })
  }

  function attempt(examId: string): Attempt | null {
    return saved.value.attempts[examId] ?? null
  }

  function setAttempt(next: Attempt): void {
    const stamped = { ...next, updated_at: Date.now() }
    saved.value = { ...saved.value, attempts: { ...saved.value.attempts, [next.exam_id]: stamped } }
    persist()
  }

  function start(exam: PracticeExam, mode: AttemptMode): Attempt {
    const fresh = startAttempt(exam, mode, Date.now())
    setAttempt(fresh)
    return fresh
  }

  function discard(examId: string): void {
    const attempts = { ...saved.value.attempts }
    delete attempts[examId]
    const discarded = { ...saved.value.discarded, [examId]: Date.now() }
    saved.value = { ...saved.value, attempts, discarded }
    persist()
  }

  /** Close the attempt and record its score. Submitting twice records once. */
  function finish(exam: PracticeExam): void {
    const current = attempt(exam.id)
    if (!current || current.submitted_at !== null) return
    const closed = { ...submitAttempt(current, Date.now()), updated_at: Date.now() }
    const result = score(exam, closed)
    const entry = {
      mode: closed.mode,
      percent: result.percent,
      passed: result.passed,
      submitted_at: closed.submitted_at ?? Date.now(),
    }
    const history = [entry, ...(saved.value.history[exam.id] ?? [])].slice(0, HISTORY_LIMIT)
    saved.value = {
      ...saved.value,
      attempts: { ...saved.value.attempts, [exam.id]: closed },
      history: { ...saved.value.history, [exam.id]: history },
    }
    persist()
  }

  function history(examId: string) {
    return saved.value.history[examId] ?? []
  }

  return {
    index,
    exams,
    error,
    loadIndex,
    loadExam,
    attempt,
    setAttempt,
    start,
    discard,
    finish,
    history,
    push,
    pull,
  }
})
