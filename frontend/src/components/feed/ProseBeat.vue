<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string }>()

/** Authored beats use blank lines as paragraph breaks. */
const paragraphs = computed(() =>
  props.text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean),
)
</script>

<template>
  <div class="prose-beat">
    <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
  </div>
</template>
