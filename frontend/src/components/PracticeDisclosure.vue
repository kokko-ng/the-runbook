<script setup lang="ts">
import { PRACTICE_AUTHOR, PRACTICE_MODEL_ID } from '@/practice'
</script>

<template>
  <!-- A footnote, not a banner: it closes every practice page, quietly. -->
  <p
    class="border-t border-ink-200 pt-3 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400"
    aria-label="Who wrote these practice exams"
  >
    Written by {{ PRACTICE_AUTHOR }}, an AI model made by Anthropic
    (<span class="font-mono">{{ PRACTICE_MODEL_ID }}</span>), from pages on learn.microsoft.com.
    Not official Microsoft exam content and not endorsed by Microsoft. AI-written material can be
    wrong: when an answer surprises you, trust the linked source over the explanation.
  </p>
</template>
