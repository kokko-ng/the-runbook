<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <button
    type="button"
    class="btn btn-quiet btn-compact"
    :aria-label="`Switch to ${ui.theme === 'dark' ? 'light' : 'dark'} theme`"
    @click="ui.toggleTheme()"
  >
    {{ ui.theme === 'dark' ? 'Light' : 'Dark' }}
  </button>
</template>
