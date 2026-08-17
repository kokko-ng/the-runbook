<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'

import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

onMounted(() => ui.init())
</script>

<template>
  <RouterView />
</template>
