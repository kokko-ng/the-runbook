<script setup lang="ts">
defineProps<{
  command: string
  output: string
  note?: string
}>()
</script>

<template>
  <div>
    <!-- The pane scrolls inside itself; wide CLI output must never widen the page. -->
    <div class="terminal">
      <pre><span class="text-[var(--color-hivis-400)]">$</span> {{ command }}
{{ output }}</pre>
    </div>
    <p v-if="note" class="mt-1.5 text-[0.8125rem] leading-snug text-[var(--ink-muted)]">
      {{ note }}
    </p>
  </div>
</template>
