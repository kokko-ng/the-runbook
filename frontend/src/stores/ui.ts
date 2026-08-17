/** Presentation state only: theme, breakpoint, and which overlays are open. */

import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'runbook.theme'

export const useUiStore = defineStore('ui', () => {
  const width = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
  const mapOpen = ref(false)
  const skillsOpen = ref(false)
  const theme = ref<Theme>('light')

  const isPhone = computed(() => width.value < 640)
  const isTablet = computed(() => width.value >= 640 && width.value < 1024)
  const isDesktop = computed(() => width.value >= 1024)

  /** Tablet keeps the map panel collapsible; desktop always shows it. */
  const mapPanelVisible = ref(true)

  function onResize() {
    width.value = window.innerWidth
  }

  function init() {
    if (typeof window === 'undefined') return

    window.addEventListener('resize', onResize, { passive: true })
    onScopeDispose(() => window.removeEventListener('resize', onResize))

    const stored = window.localStorage?.getItem(THEME_KEY) as Theme | null
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    setTheme(stored ?? (prefersDark ? 'dark' : 'light'))
  }

  function setTheme(next: Theme) {
    theme.value = next
    document.documentElement.setAttribute('data-theme', next)
    try {
      window.localStorage?.setItem(THEME_KEY, next)
    } catch {
      // A blocked storage API only costs the preference, not the theme.
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function openMap() {
    mapOpen.value = true
  }

  function closeMap() {
    mapOpen.value = false
  }

  function toggleMapPanel() {
    mapPanelVisible.value = !mapPanelVisible.value
  }

  function toggleSkills() {
    skillsOpen.value = !skillsOpen.value
  }

  function closeSkills() {
    skillsOpen.value = false
  }

  return {
    width,
    isPhone,
    isTablet,
    isDesktop,
    mapOpen,
    mapPanelVisible,
    skillsOpen,
    theme,
    init,
    setTheme,
    toggleTheme,
    openMap,
    closeMap,
    toggleMapPanel,
    toggleSkills,
    closeSkills,
  }
})
