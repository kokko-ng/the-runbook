/**
 * Practice exams: the bundle's shapes and the pure rules for taking one.
 *
 * Kept apart from the game engine on purpose. A practice exam has no
 * reputation, no save state and no objective coverage; it is a timed sheet of
 * questions and a score. Everything here is a plain function of its inputs so
 * the store can own the clock and the storage.
 */

export const PRACTICE_AUTHOR = 'Opus 5.5'
export const PRACTICE_MODEL_ID = 'claude-opus-5-5'

export interface PracticeDomain {
  id: string
  title: string
  weight: string
  questions: number
}

export interface PracticeExamSummary {
  id: string
  number: number
  title: string
  question_count: number
}

export interface PracticeCertification {
  exam: string
  title: string
  study_guide_url: string
  skills_measured_as_of: string
  time_limit_minutes: number
  passing_percent: number
  domains: PracticeDomain[]
  exams: PracticeExamSummary[]
}

export interface PracticeIndex {
  author: string
  model_id: string
  certifications: PracticeCertification[]
}

export interface PracticeOption {
  id: string
  text: string
}

export interface PracticeQuestion {
  id: string
  domain: string
  skill: string
  kind: 'single' | 'multiple'
  stem: string
  options: PracticeOption[]
  answer: string[]
  explanation: string
  sources: string[]
}

export interface PracticeExam {
  id: string
  exam: string
  number: number
  title: string
  author: string
  model_id: string
  written_on: string
  time_limit_minutes: number
  passing_percent: number
  questions: PracticeQuestion[]
}

/**
 * Exam mode is the real thing: timed, no feedback until the end. Study mode is
 * untimed and shows the explanation as soon as an answer is locked in.
 */
export type AttemptMode = 'exam' | 'study'

export interface Attempt {
  exam_id: string
  mode: AttemptMode
  started_at: number
  /** Epoch ms when an exam-mode attempt runs out of time; null in study mode. */
  deadline: number | null
  current: number
  answers: Record<string, string[]>
  /** Study mode only: questions whose answer has been locked in and revealed. */
  revealed: string[]
  flagged: string[]
  submitted_at: number | null
}

export interface DomainScore {
  domain: string
  correct: number
  total: number
}

export interface Score {
  correct: number
  total: number
  percent: number
  passed: boolean
  by_domain: DomainScore[]
}

export interface HistoryEntry {
  mode: AttemptMode
  percent: number
  passed: boolean
  submitted_at: number
}

export function startAttempt(exam: PracticeExam, mode: AttemptMode, now: number): Attempt {
  return {
    exam_id: exam.id,
    mode,
    started_at: now,
    deadline: mode === 'exam' ? now + exam.time_limit_minutes * 60_000 : null,
    current: 0,
    answers: {},
    revealed: [],
    flagged: [],
    submitted_at: null,
  }
}

/**
 * Select or clear one option. A single-answer question swaps its choice; a
 * multiple-answer question toggles, and never holds more picks than it has
 * answers, which is how the real exam behaves.
 */
export function toggleOption(
  attempt: Attempt,
  question: PracticeQuestion,
  optionId: string,
): Attempt {
  if (attempt.submitted_at !== null || attempt.revealed.includes(question.id)) return attempt
  const picked = attempt.answers[question.id] ?? []
  let next: string[]
  if (question.kind === 'single') {
    next = picked[0] === optionId ? [] : [optionId]
  } else if (picked.includes(optionId)) {
    next = picked.filter((id) => id !== optionId)
  } else if (picked.length < question.answer.length) {
    next = [...picked, optionId]
  } else {
    return attempt
  }
  return { ...attempt, answers: { ...attempt.answers, [question.id]: next } }
}

export function toggleFlag(attempt: Attempt, questionId: string): Attempt {
  const flagged = attempt.flagged.includes(questionId)
    ? attempt.flagged.filter((id) => id !== questionId)
    : [...attempt.flagged, questionId]
  return { ...attempt, flagged }
}

export function goTo(attempt: Attempt, exam: PracticeExam, index: number): Attempt {
  const current = Math.max(0, Math.min(exam.questions.length - 1, index))
  return { ...attempt, current }
}

/** A question counts as answered once it holds as many picks as it has answers. */
export function isAnswered(attempt: Attempt, question: PracticeQuestion): boolean {
  return (attempt.answers[question.id] ?? []).length === question.answer.length
}

export function reveal(attempt: Attempt, question: PracticeQuestion): Attempt {
  if (attempt.mode !== 'study' || !isAnswered(attempt, question)) return attempt
  if (attempt.revealed.includes(question.id)) return attempt
  return { ...attempt, revealed: [...attempt.revealed, question.id] }
}

/** All or nothing per question: a multiple-answer question needs every pick right. */
export function isCorrect(attempt: Attempt, question: PracticeQuestion): boolean {
  const picked = [...(attempt.answers[question.id] ?? [])].sort()
  const answer = [...question.answer].sort()
  return picked.length === answer.length && picked.every((id, index) => id === answer[index])
}

export function score(exam: PracticeExam, attempt: Attempt): Score {
  const byDomain = new Map<string, DomainScore>()
  let correct = 0
  for (const question of exam.questions) {
    const entry = byDomain.get(question.domain) ?? { domain: question.domain, correct: 0, total: 0 }
    entry.total += 1
    if (isCorrect(attempt, question)) {
      entry.correct += 1
      correct += 1
    }
    byDomain.set(question.domain, entry)
  }
  const total = exam.questions.length
  const percent = total ? Math.round((correct / total) * 100) : 0
  return {
    correct,
    total,
    percent,
    passed: percent >= exam.passing_percent,
    by_domain: [...byDomain.values()],
  }
}

export function submit(attempt: Attempt, now: number): Attempt {
  return attempt.submitted_at === null ? { ...attempt, submitted_at: now } : attempt
}

export function timeLeftMs(attempt: Attempt, now: number): number | null {
  return attempt.deadline === null ? null : Math.max(0, attempt.deadline - now)
}

export function isExpired(attempt: Attempt, now: number): boolean {
  return attempt.deadline !== null && attempt.submitted_at === null && now >= attempt.deadline
}

export function formatClock(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
