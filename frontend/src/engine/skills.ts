/**
 * The skill trees.
 *
 * One tree per exam domain, one node per skill group. Nodes light up on their
 * own as encounters are cleared, which is what makes the tree double as an
 * exam-readiness view. It tells the truth in two shades: an objective cleared
 * without a wrong turn is mastered, one recovered on a later attempt is only
 * covered, and a covered objective is a study lead, not a done deal.
 */

import type { ContentIndex, SaveState } from './types'

export type ObjectiveState = 'dark' | 'covered' | 'mastered'
export type NodeState = 'dark' | 'partial' | 'covered' | 'mastered'

export interface SkillNode {
  id: string
  title: string
  state: NodeState
  covered: number
  mastered: number
  total: number
  objectives: { id: string; text: string; state: ObjectiveState }[]
}

export interface SkillTree {
  id: string
  exam: string
  title: string
  weight: string
  chapter: string
  covered: number
  mastered: number
  total: number
  nodes: SkillNode[]
}

export function buildTrees(index: ContentIndex, state: SaveState): SkillTree[] {
  const lit = new Set(state.progress.objectives)
  const solid = new Set(state.progress.mastered)
  const trees: SkillTree[] = []
  for (const exam of index.exams) {
    for (const domain of exam.domains) {
      const nodes: SkillNode[] = domain.groups.map((group) => {
        const objectives = group.objectives.map((objective) => ({
          ...objective,
          state: solid.has(objective.id)
            ? ('mastered' as const)
            : lit.has(objective.id)
              ? ('covered' as const)
              : ('dark' as const),
        }))
        const covered = objectives.filter((objective) => objective.state !== 'dark').length
        const mastered = objectives.filter((objective) => objective.state === 'mastered').length
        const nodeState: NodeState =
          covered === 0
            ? 'dark'
            : covered < objectives.length
              ? 'partial'
              : mastered === objectives.length
                ? 'mastered'
                : 'covered'
        return {
          id: group.id,
          title: group.title,
          covered,
          mastered,
          total: objectives.length,
          state: nodeState,
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
        mastered: nodes.reduce((sum, node) => sum + node.mastered, 0),
        total: nodes.reduce((sum, node) => sum + node.total, 0),
        nodes,
      })
    }
  }
  return trees
}

export interface ExamReadiness {
  exam: string
  covered: number
  mastered: number
  total: number
  percent: number
  solid_percent: number
}

export interface Readiness {
  covered: number
  mastered: number
  total: number
  percent: number
  solid_percent: number
  byExam: ExamReadiness[]
}

export function readiness(index: ContentIndex, state: SaveState): Readiness {
  const trees = buildTrees(index, state)
  const byExam = index.exams.map((exam) => {
    const own = trees.filter((tree) => tree.exam === exam.exam)
    const covered = own.reduce((sum, tree) => sum + tree.covered, 0)
    const mastered = own.reduce((sum, tree) => sum + tree.mastered, 0)
    const total = own.reduce((sum, tree) => sum + tree.total, 0)
    return {
      exam: exam.exam,
      covered,
      mastered,
      total,
      percent: total ? Math.round((covered / total) * 100) : 0,
      solid_percent: total ? Math.round((mastered / total) * 100) : 0,
    }
  })
  const covered = byExam.reduce((sum, entry) => sum + entry.covered, 0)
  const mastered = byExam.reduce((sum, entry) => sum + entry.mastered, 0)
  const total = byExam.reduce((sum, entry) => sum + entry.total, 0)
  return {
    covered,
    mastered,
    total,
    percent: total ? Math.round((covered / total) * 100) : 0,
    solid_percent: total ? Math.round((mastered / total) * 100) : 0,
    byExam,
  }
}
