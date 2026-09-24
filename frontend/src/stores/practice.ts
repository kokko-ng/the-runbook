import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'

import { loadPractice, persistPractice } from '@/lib/storage'
import type { PracticeStore } from '@/lib/storage'
import {
  score,
  startAttempt,
  submit as submitAttempt,
} from '@/practice'
import type { Attempt, AttemptMode, PracticeExam, PracticeIndex } from '@/practice'

/** How many past scores to keep per exam. */
const HISTORY_LIMIT = 10

/**
 * Practice exams are compiled to static JSON beside the game content. The
 * store fetches them, owns the in-progress attempt for each exam and the score
 * history, and persists both to localStorage. The rules live in `@/practice`.
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

  function persist(): void {
    persistPractice(saved.value)
  }

  function attempt(examId: string): Attempt | null {
    return saved.value.attempts[examId] ?? null
  }

  function setAttempt(next: Attempt): void {
    saved.value = { ...saved.value, attempts: { ...saved.value.attempts, [next.exam_id]: next } }
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
    saved.value = { ...saved.value, attempts }
    persist()
  }

  /** Close the attempt and record its score. Submitting twice records once. */
  function finish(exam: PracticeExam): void {
    const current = attempt(exam.id)
    if (!current || current.submitted_at !== null) return
    const closed = submitAttempt(current, Date.now())
    const result = score(exam, closed)
    const entry = {
      mode: closed.mode,
      percent: result.percent,
      passed: result.passed,
      submitted_at: closed.submitted_at ?? Date.now(),
    }
    const history = [entry, ...(saved.value.history[exam.id] ?? [])].slice(0, HISTORY_LIMIT)
    saved.value = {
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
  }
})
