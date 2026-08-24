import { defineStore } from 'pinia'
import { ref } from 'vue'

import { loadTheme, persistTheme, type ThemeChoice } from '@/lib/storage'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'good' | 'bad'
}

let nextToastId = 1

export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeChoice>('system')
  const mapSheetOpen = ref(false)
  const mapPanelOpen = ref(true)
  const drawerOpen = ref(false)
  const toasts = ref<Toast[]>([])

  function applyTheme(): void {
    const dark =
      theme.value === 'dark' ||
      (theme.value === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }

  function restoreTheme(): void {
    theme.value = loadTheme()
    applyTheme()
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => theme.value === 'system' && applyTheme())
  }

  function setTheme(choice: ThemeChoice): void {
    theme.value = choice
    persistTheme(choice)
    applyTheme()
  }

  function toast(text: string, tone: Toast['tone'] = 'info'): void {
    const id = nextToastId++
    toasts.value = [...toasts.value, { id, text, tone }]
    setTimeout(() => {
      toasts.value = toasts.value.filter((entry) => entry.id !== id)
    }, 4200)
  }

  return {
    theme,
    mapSheetOpen,
    mapPanelOpen,
    drawerOpen,
    toasts,
    restoreTheme,
    setTheme,
    toast,
  }
})
