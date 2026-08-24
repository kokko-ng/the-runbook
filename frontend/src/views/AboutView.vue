<script setup lang="ts">
import { computed } from 'vue'

import { useContentStore } from '@/stores/content'

const content = useContentStore()
const exams = computed(() => content.index?.exams ?? [])
</script>

<template>
  <article class="mx-auto max-w-2xl space-y-6 pb-8">
    <header class="space-y-2">
      <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">About The Runbook</h1>
      <p class="prose-beat text-ink-700 dark:text-ink-200">
        A text-based career RPG that teaches Azure administration and architecture the way the job
        teaches it: tickets, outages, design reviews, and the consequences of your own decisions.
      </p>
    </header>

    <section class="space-y-2">
      <h2 class="text-base font-semibold">How it works</h2>
      <ul class="ml-5 list-disc space-y-1 text-sm">
        <li>Every input is a choice. Nothing is ever typed, on any screen.</li>
        <li>
          Wrong answers cost reputation and come with the reason they are wrong, then you choose
          again from what is left.
        </li>
        <li>
          Incidents run on a time budget: dialogue is free, diagnostics cost time, and closing
          early is worth something.
        </li>
        <li>
          The skill tree lights itself as you clear encounters, so it doubles as a readiness view.
        </li>
        <li>
          There is no language model behind any of this. Every scenario is written by hand and
          checked by a linter that refuses to ship a dead end.
        </li>
      </ul>
    </section>

    <section class="space-y-2">
      <h2 class="text-base font-semibold">Coverage</h2>
      <p class="text-sm text-ink-600 dark:text-ink-300">
        Objectives are transcribed from the official study guides and every one of them is mapped
        to at least one encounter. The build fails if that stops being true.
      </p>
      <ul class="space-y-1 text-sm">
        <li v-for="exam in exams" :key="exam.exam">
          <span class="font-medium">{{ exam.exam }}</span> &mdash; {{ exam.title }}, skills measured
          as of {{ exam.skills_measured_as_of }}
          (<a class="text-signal-600 underline dark:text-signal-400" :href="exam.source_url" rel="noreferrer noopener">study guide</a>)
        </li>
      </ul>
    </section>

    <section class="space-y-2">
      <h2 class="text-base font-semibold">Cost</h2>
      <p class="text-sm text-ink-600 dark:text-ink-300">
        Nothing. Both acts are free, there is no payment code anywhere in the project, and there
        never will be a paywall on the content.
      </p>
    </section>

    <section class="space-y-2">
      <h2 class="text-base font-semibold">Not affiliated with Microsoft</h2>
      <p class="text-sm text-ink-600 dark:text-ink-300">
        The Runbook is an independent study aid. It is not affiliated with, endorsed by, or
        sponsored by Microsoft Corporation. Microsoft, Azure, Microsoft Entra and the exam codes
        AZ-104 and AZ-305 are trademarks of the Microsoft group of companies. Passing an exam
        needs hands-on practice in a real subscription as well; this is preparation, not a
        substitute.
      </p>
    </section>
  </article>
</template>
