import type { Cluster, Domain, Manifest } from './types'

/**
 * The skill tree is derived, never stored as truth: a cluster is lit when every
 * objective in it has been cleared. Clearing an encounter lights whatever that
 * implies, so the tree doubles as an exam-readiness view.
 */
export function deriveLitClusters(manifest: Manifest, clearedObjectiveIds: string[]): string[] {
  const cleared = new Set(clearedObjectiveIds)
  const lit: string[] = []

  for (const cluster of allClusters(manifest)) {
    const objectives = cluster.objectives.map((objective) => objective.id)
    if (objectives.length > 0 && objectives.every((id) => cleared.has(id))) {
      lit.push(cluster.id)
    }
  }

  return lit
}

export function allClusters(manifest: Manifest): Cluster[] {
  return allDomains(manifest).flatMap((domain) => domain.clusters)
}

export function allDomains(manifest: Manifest): Domain[] {
  return manifest.exams.flatMap((exam) => exam.domains)
}

export function clusterById(manifest: Manifest, clusterId: string): Cluster | undefined {
  return allClusters(manifest).find((cluster) => cluster.id === clusterId)
}

/** Fraction of a cluster's objectives cleared, for partial progress display. */
export function clusterProgress(
  cluster: Cluster,
  clearedObjectiveIds: string[],
): { cleared: number; total: number } {
  const cleared = new Set(clearedObjectiveIds)
  return {
    cleared: cluster.objectives.filter((objective) => cleared.has(objective.id)).length,
    total: cluster.objectives.length,
  }
}

/** A cluster is reachable when every prerequisite cluster is lit. */
export function isClusterUnlocked(cluster: Cluster, litClusterIds: string[]): boolean {
  const lit = new Set(litClusterIds)
  return cluster.requires.every((required) => lit.has(required))
}
