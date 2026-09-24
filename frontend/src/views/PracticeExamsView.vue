<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

import PracticeDisclosure from '@/components/PracticeDisclosure.vue'
import { usePracticeStore } from '@/stores/practice'

const practice = usePracticeStore()
const certifications = computed(() => practice.index?.certifications ?? [])

function status(examId: string): { label: string; tone: string } {
  const attempt = practice.attempt(examId)
  const best = Math.max(-1, ...practice.history(examId).map((entry) => entry.percent))
  if (attempt && attempt.submitted_at === null) {
    return { label: 'In progress', tone: 'text-degraded' }
  }
  if (best >= 0) return { label: `Best ${best}%`, tone: 'text-ink-600 dark:text-ink-300' }
  return { label: 'Not taken', tone: 'text-ink-400' }
}

onMounted(() => practice.loadIndex())
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <header class="space-y-2">
      <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">Practice exams</h1>
      <p class="prose-beat text-ink-700 dark:text-ink-200">
        Five full-length practice exams each for AZ-104, AZ-700 and AZ-305. Each one follows the
        domain weights on the official study guide. Take them timed with results at the end, or in
        study mode with the explanation after every question.
      </p>
    </header>

    <PracticeDisclosure />

    <p v-if="practice.error" class="card border-broken/40 p-4 text-sm text-broken" role="alert">
      {{ practice.error }}
    </p>
    <div v-else-if="!practice.index" class="card p-6 text-sm text-ink-500">
      Loading the practice exams...
    </div>

    <section
      v-for="cert in certifications"
      :key="cert.exam"
      class="card space-y-4 p-4 sm:p-5"
      :aria-labelledby="`cert-${cert.exam}`"
    >
      <div class="space-y-1">
        <h2 :id="`cert-${cert.exam}`" class="text-base font-semibold">
          <span class="font-mono">{{ cert.exam }}</span>
          <span class="text-ink-500 dark:text-ink-400"> - </span>
          {{ cert.title }}
        </h2>
        <p class="text-xs text-ink-500 dark:text-ink-400">
          {{ cert.exams[0]?.question_count ?? 0 }} questions per exam,
          {{ cert.time_limit_minutes }} minutes, pass mark {{ cert.passing_percent }}%.
          Blueprint from the
          <a
            :href="cert.study_guide_url"
            class="text-signal-600 underline dark:text-signal-400"
            rel="noreferrer noopener"
            target="_blank"
          >study guide</a>
          (skills measured as of {{ cert.skills_measured_as_of }}).
        </p>
      </div>

      <ul class="flex flex-wrap gap-1.5 text-xs" aria-label="Domains and weights">
        <li
          v-for="domain in cert.domains"
          :key="domain.id"
          class="rounded-full border border-ink-200 px-2.5 py-1 text-ink-600 dark:border-ink-700
          dark:text-ink-300"
        >
          {{ domain.title }} <span class="font-mono">{{ domain.weight }}</span>
        </li>
      </ul>

      <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <li v-for="exam in cert.exams" :key="exam.id">
          <RouterLink
            :to="`/practice/${exam.id}`"
            class="flex h-full min-h-11 flex-col justify-between gap-1 rounded-xl border
            border-ink-200 bg-white px-4 py-3 text-sm hover:border-signal-500
            dark:border-ink-700 dark:bg-ink-900 dark:hover:border-signal-400"
          >
            <span class="font-medium">Exam {{ exam.number }}</span>
            <span class="text-xs" :class="status(exam.id).tone">{{ status(exam.id).label }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
