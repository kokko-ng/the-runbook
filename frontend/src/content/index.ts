/**
 * Content loading. The manifest is small and always needed, so it is imported
 * eagerly; quests are code-split and fetched when the player starts one, which
 * keeps the initial bundle to the chapter list rather than the whole game.
 */

import manifestJson from '@/generated/content/manifest.json'
import type { ChapterRef, Manifest, Quest, QuestRef } from '@/engine/types'

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

/** The next unplayed main-line quest in a chapter, or undefined when it is done. */
export function nextQuest(chapterId: string, completedQuestIds: string[]): QuestRef | undefined {
  return chapterQuests(chapterId).find((quest) => !completedQuestIds.includes(quest.id))
}

/**
 * The next unplayed quest anywhere, following chapter order. This is what
 * "carry on" means once a chapter runs out: the career continues into the next
 * domain rather than stopping.
 */
export function nextQuestAnywhere(completedQuestIds: string[]): QuestRef | undefined {
  for (const chapter of manifest.chapters) {
    const next = nextQuest(chapter.id, completedQuestIds)
    if (next) return next
  }
  return undefined
}

export interface ChapterProgress {
  chapter: ChapterRef
  total: number
  completed: number
  done: boolean
  started: boolean
  /** Bonus variants of quests the player has cleared, once rep allows them. */
  bonusAvailable: QuestRef[]
}

export function chapterProgress(
  chapterId: string,
  completedQuestIds: string[],
  bonusUnlocked: boolean,
): ChapterProgress | undefined {
  const chapter = chapterOf(chapterId)
  if (!chapter) return undefined

  const quests = chapterQuests(chapterId)
  const completed = quests.filter((quest) => completedQuestIds.includes(quest.id)).length

  // A hard variant only appears once its parent is cleared and standing is high
  // enough, so it reads as a reward rather than a wall.
  const bonusAvailable = bonusUnlocked
    ? bonusQuestsFor(chapterId).filter(
        (bonus) =>
          bonus.bonusVariantOf !== null &&
          completedQuestIds.includes(bonus.bonusVariantOf) &&
          !completedQuestIds.includes(bonus.id),
      )
    : []

  return {
    chapter,
    total: quests.length,
    completed,
    done: quests.length > 0 && completed === quests.length,
    started: completed > 0,
    bonusAvailable,
  }
}

export const chapters = manifest.chapters
