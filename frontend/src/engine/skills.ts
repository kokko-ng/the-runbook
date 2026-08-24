/**
 * The skill trees.
 *
 * One tree per exam domain, one node per skill group. Nodes light up on their
 * own as encounters are cleared, which is what makes the tree double as an
 * exam-readiness view: what is dark is what you have not been tested on yet.
 */

import type { ContentIndex, SaveState } from './types'

export type NodeState = 'dark' | 'partial' | 'lit'

export interface SkillNode {
  id: string
  title: string
  state: NodeState
  covered: number
  total: number
  objectives: { id: string; text: string; lit: boolean }[]
}

export interface SkillTree {
  id: string
  exam: string
  title: string
  weight: string
  chapter: string
  covered: number
  total: number
  nodes: SkillNode[]
}

export function buildTrees(index: ContentIndex, state: SaveState): SkillTree[] {
  const lit = new Set(state.progress.objectives)
  const trees: SkillTree[] = []
  for (const exam of index.exams) {
    for (const domain of exam.domains) {
      const nodes: SkillNode[] = domain.groups.map((group) => {
        const objectives = group.objectives.map((objective) => ({
          ...objective,
          lit: lit.has(objective.id),
        }))
        const covered = objectives.filter((objective) => objective.lit).length
        return {
          id: group.id,
          title: group.title,
          covered,
          total: objectives.length,
          state: covered === 0 ? 'dark' : covered === objectives.length ? 'lit' : 'partial',
          objectives,
        }
      })
      trees.push({
        id: domain.id,
        exam: exam.exam,
        title: domain.title,
        weight: domain.weight,
        chapter: domain.chapter,
        covered: nodes.reduce((sum, node) => sum + node.covered, 0),
        total: nodes.reduce((sum, node) => sum + node.total, 0),
        nodes,
      })
    }
  }
  return trees
}

export interface Readiness {
  covered: number
  total: number
  percent: number
  byExam: { exam: string; covered: number; total: number; percent: number }[]
}

export function readiness(index: ContentIndex, state: SaveState): Readiness {
  const trees = buildTrees(index, state)
  const byExam = index.exams.map((exam) => {
    const own = trees.filter((tree) => tree.exam === exam.exam)
    const covered = own.reduce((sum, tree) => sum + tree.covered, 0)
    const total = own.reduce((sum, tree) => sum + tree.total, 0)
    return { exam: exam.exam, covered, total, percent: total ? Math.round((covered / total) * 100) : 0 }
  })
  const covered = byExam.reduce((sum, entry) => sum + entry.covered, 0)
  const total = byExam.reduce((sum, entry) => sum + entry.total, 0)
  return { covered, total, percent: total ? Math.round((covered / total) * 100) : 0, byExam }
}
