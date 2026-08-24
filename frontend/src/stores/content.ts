import { defineStore } from 'pinia'
import { computed, markRaw, ref, shallowRef } from 'vue'

import type { Chapter, ContentIndex, Quest } from '@/engine'

/** Content is compiled to static JSON at build time and fetched from the same origin. */
export const useContentStore = defineStore('content', () => {
  const index = shallowRef<ContentIndex | null>(null)
  const quests = shallowRef<Record<string, Quest>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<ContentIndex | null> {
    if (index.value || loading.value) return index.value
    loading.value = true
    error.value = null
    try {
      const response = await fetch('/content/index.json', { cache: 'no-cache' })
      if (!response.ok) throw new Error(`content index returned ${response.status}`)
      index.value = markRaw((await response.json()) as ContentIndex)
    } catch (cause) {
      error.value =
        'The story files could not be loaded. Check your connection and reload the page.'
      console.error(cause)
    } finally {
      loading.value = false
    }
    return index.value
  }

  async function loadQuest(id: string): Promise<Quest | null> {
    const cached = quests.value[id]
    if (cached) return cached
    try {
      const response = await fetch(`/content/quests/${id}.json`, { cache: 'no-cache' })
      if (!response.ok) throw new Error(`quest ${id} returned ${response.status}`)
      const quest = markRaw((await response.json()) as Quest)
      quests.value = { ...quests.value, [id]: quest }
      return quest
    } catch (cause) {
      console.error(cause)
      error.value = `Quest "${id}" could not be loaded.`
      return null
    }
  }

  const chapters = computed<Chapter[]>(() =>
    [...(index.value?.chapters ?? [])].sort((a, b) => a.order - b.order),
  )

  const acts = computed(() =>
    (index.value?.acts ?? []).map((act) => ({
      ...act,
      chapterList: chapters.value.filter((chapter) => chapter.act === act.id),
    })),
  )

  function chapterById(id: string): Chapter | undefined {
    return chapters.value.find((chapter) => chapter.id === id)
  }

  function rankTitle(id: string): string {
    return index.value?.ranks.find((rank) => rank.id === id)?.title ?? ''
  }

  return { index, quests, loading, error, load, loadQuest, chapters, acts, chapterById, rankTitle }
})
