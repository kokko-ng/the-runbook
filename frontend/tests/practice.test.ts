import { describe, expect, it } from 'vitest'

import {
  formatClock,
  isAnswered,
  isExpired,
  reveal,
  score,
  startAttempt,
  submit,
  timeLeftMs,
  toggleFlag,
  toggleOption,
} from '../src/practice'
import type { PracticeExam, PracticeQuestion } from '../src/practice'

const NOW = Date.UTC(2026, 8, 24, 9, 0, 0)

const single: PracticeQuestion = {
  id: 'q01',
  domain: 'AZ104-1',
  skill: 'Create users and groups',
  kind: 'single',
  stem: 'Which one?',
  options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `option ${id}` })),
  answer: ['c'],
  explanation: 'Because.',
  sources: ['https://learn.microsoft.com/en-us/entra/'],
}

const multiple: PracticeQuestion = {
  ...single,
  id: 'q02',
  domain: 'AZ104-2',
  kind: 'multiple',
  stem: 'Which two? Choose two.',
  options: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, text: `option ${id}` })),
  answer: ['a', 'd'],
}

const exam: PracticeExam = {
  id: 'az-104-1',
  exam: 'AZ-104',
  number: 1,
  title: 'AZ-104 practice exam 1',
  author: 'Opus 5.5',
  model_id: 'claude-opus-5-5',
  written_on: '2026-09-24',
  time_limit_minutes: 100,
  passing_percent: 70,
  questions: [single, multiple],
}

describe('practice exams', () => {
  it('times an exam-mode attempt and leaves study mode untimed', () => {
    const timed = startAttempt(exam, 'exam', NOW)
    expect(timeLeftMs(timed, NOW)).toBe(100 * 60_000)
    expect(isExpired(timed, NOW + 100 * 60_000)).toBe(true)
    const study = startAttempt(exam, 'study', NOW)
    expect(timeLeftMs(study, NOW)).toBeNull()
    expect(isExpired(study, NOW + 10 ** 9)).toBe(false)
  })

  it('swaps a single answer and caps a multiple answer at its answer count', () => {
    let attempt = startAttempt(exam, 'exam', NOW)
    attempt = toggleOption(attempt, single, 'a')
    attempt = toggleOption(attempt, single, 'b')
    expect(attempt.answers.q01).toEqual(['b'])

    attempt = toggleOption(attempt, multiple, 'a')
    attempt = toggleOption(attempt, multiple, 'b')
    attempt = toggleOption(attempt, multiple, 'c')
    expect(attempt.answers.q02).toEqual(['a', 'b'])
    attempt = toggleOption(attempt, multiple, 'b')
    expect(attempt.answers.q02).toEqual(['a'])
    expect(isAnswered(attempt, multiple)).toBe(false)
  })

  it('scores all or nothing per question and breaks the score down by domain', () => {
    let attempt = startAttempt(exam, 'exam', NOW)
    attempt = toggleOption(attempt, single, 'c')
    attempt = toggleOption(attempt, multiple, 'a')
    attempt = toggleOption(attempt, multiple, 'b')
    const result = score(exam, attempt)
    expect(result.correct).toBe(1)
    expect(result.percent).toBe(50)
    expect(result.passed).toBe(false)
    expect(result.by_domain).toEqual([
      { domain: 'AZ104-1', correct: 1, total: 1 },
      { domain: 'AZ104-2', correct: 0, total: 1 },
    ])
  })

  it('reveals only answered questions, only in study mode, and then locks them', () => {
    let study = startAttempt(exam, 'study', NOW)
    expect(reveal(study, single).revealed).toEqual([])
    study = reveal(toggleOption(study, single, 'a'), single)
    expect(study.revealed).toEqual(['q01'])
    expect(toggleOption(study, single, 'c').answers.q01).toEqual(['a'])

    const timed = toggleOption(startAttempt(exam, 'exam', NOW), single, 'a')
    expect(reveal(timed, single).revealed).toEqual([])
  })

  it('locks answers once submitted, and submitting twice keeps the first time', () => {
    const attempt = submit(startAttempt(exam, 'exam', NOW), NOW + 1000)
    expect(submit(attempt, NOW + 5000).submitted_at).toBe(NOW + 1000)
    expect(toggleOption(attempt, single, 'c').answers).toEqual({})
    expect(isExpired(attempt, NOW + 10 ** 9)).toBe(false)
  })

  it('toggles flags and formats the clock', () => {
    const attempt = toggleFlag(startAttempt(exam, 'exam', NOW), 'q01')
    expect(attempt.flagged).toEqual(['q01'])
    expect(toggleFlag(attempt, 'q01').flagged).toEqual([])
    expect(formatClock(100 * 60_000)).toBe('1:40:00')
    expect(formatClock(59_500)).toBe('1:00')
    expect(formatClock(9 * 60_000 + 5_000)).toBe('9:05')
  })
})
