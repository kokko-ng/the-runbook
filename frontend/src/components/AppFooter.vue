<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <footer class="border-t border-ink-200 py-6 text-sm dark:border-ink-800">
    <div class="mx-auto w-full max-w-7xl space-y-3 px-3 sm:px-5">
      <p class="text-ink-500 dark:text-ink-400">
        The Runbook is an independent study aid. It is not affiliated with, endorsed by, or
        sponsored by Microsoft Corporation. Microsoft, Azure, Microsoft Entra and the exam codes
        AZ-104 and AZ-305 are trademarks of the Microsoft group of companies. Meridian Logistics
        and everyone who works there are fictional.
      </p>
      <nav class="flex flex-wrap gap-x-4 gap-y-2 text-ink-600 dark:text-ink-300" aria-label="Legal">
        <RouterLink to="/about">About</RouterLink>
        <RouterLink to="/privacy">Privacy</RouterLink>
        <RouterLink to="/terms">Terms</RouterLink>
        <a href="https://github.com/kokko-ng/the-runbook" rel="noreferrer noopener">Source</a>
        <span class="text-ink-400">Free, and staying free.</span>
      </nav>
    </div>
  </footer>
</template>
