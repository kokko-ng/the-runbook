/**
 * Content loading. The manifest is small and always needed, so it is imported
 * eagerly; quests are code-split and fetched when the player starts one, which
 * keeps the initial bundle to the chapter list rather than the whole game.
 */

import manifestJson from '@/generated/content/manifest.json'
import type { Manifest, Quest, QuestRef } from '@/engine/types'

export const manifest = manifestJson as unknown as Manifest

const questModules = import.meta.glob<{ default: Quest }>('@/generated/content/quests/*.json')

const cache = new Map<string, Quest>()

export async function loadQuest(questId: string): Promise<Quest> {
  const cached = cache.get(questId)
  if (cached) return cached

  const key = Object.keys(questModules).find((path) => path.endsWith(`/${questId}.json`))
  if (!key) throw new Error(`No content shipped for quest ${questId}`)

  const module = await questModules[key]!()
  const quest = module.default
  cache.set(questId, quest)
  return quest
}

export function questRef(questId: string): QuestRef | undefined {
  return manifest.quests.find((quest) => quest.id === questId)
}

export function chapterOf(chapterId: string) {
  return manifest.chapters.find((chapter) => chapter.id === chapterId)
}

/** Main-line quests for a chapter, in play order. Bonus variants are listed separately. */
export function chapterQuests(chapterId: string): QuestRef[] {
  return manifest.quests
    .filter((quest) => quest.chapter === chapterId && !quest.bonusVariantOf)
    .sort((a, b) => a.order - b.order)
}

export function bonusQuestsFor(chapterId: string): QuestRef[] {
  return manifest.quests
    .filter((quest) => quest.chapter === chapterId && quest.bonusVariantOf)
    .sort((a, b) => a.order - b.order)
}

/** The next unplayed main-line quest, or undefined when the chapter is done. */
export function nextQuest(chapterId: string, completedQuestIds: string[]): QuestRef | undefined {
  return chapterQuests(chapterId).find((quest) => !completedQuestIds.includes(quest.id))
}

export const chapters = manifest.chapters
