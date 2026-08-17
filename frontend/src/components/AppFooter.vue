<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <footer class="border-t border-[var(--rule)] px-4 py-5 text-[0.75rem] text-[var(--ink-muted)]">
    <div class="mx-auto max-w-4xl space-y-2">
      <p>
        The Runbook is an independent study aid. It is not affiliated with, endorsed by, or
        sponsored by Microsoft. Azure, AZ-104, AZ-305, and Microsoft are trademarks of the
        Microsoft group of companies. Meridian Logistics and everyone who works there are
        fictional.
      </p>
      <nav class="flex flex-wrap gap-x-4 gap-y-1">
        <RouterLink to="/privacy" class="underline underline-offset-2">Privacy</RouterLink>
        <RouterLink to="/terms" class="underline underline-offset-2">Terms</RouterLink>
      </nav>
    </div>
  </footer>
</template>
