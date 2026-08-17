import type { DiagramOp, DiagramState } from './types'

/** Deep copy of the diagram; every mutation goes through a fresh object. */
export function cloneDiagram(diagram: DiagramState): DiagramState {
  return {
    groups: diagram.groups.map((group) => ({ ...group })),
    nodes: diagram.nodes.map((node) => ({ ...node })),
    edges: diagram.edges.map((edge) => ({ ...edge })),
  }
}

/**
 * Apply authored diagram ops in order, returning a new diagram.
 *
 * Ops that name something absent are ignored rather than throwing: the content
 * linter is what guarantees ids resolve, and a player mid-quest should never see
 * the game break over a diagram detail.
 */
export function applyDiagramOps(diagram: DiagramState, ops: DiagramOp[]): DiagramState {
  if (ops.length === 0) return diagram

  const next = cloneDiagram(diagram)

  for (const op of ops) {
    switch (op.op) {
      case 'set_status': {
        const node = next.nodes.find((candidate) => candidate.id === op.node)
        if (node) node.status = op.status
        break
      }
      case 'set_edge_status': {
        const edge = next.edges.find((candidate) => candidate.id === op.edge)
        if (edge) edge.status = op.status
        break
      }
      case 'set_label': {
        const node = next.nodes.find((candidate) => candidate.id === op.node)
        if (node) node.label = op.label
        break
      }
      case 'add_node': {
        if (!next.nodes.some((candidate) => candidate.id === op.node.id)) {
          next.nodes.push({ ...op.node })
        }
        break
      }
      case 'add_edge': {
        // An edge to a node that is not on the map would dangle and break the
        // renderer, so it is skipped rather than added.
        const endpointsExist =
          next.nodes.some((node) => node.id === op.edge.source) &&
          next.nodes.some((node) => node.id === op.edge.target)
        if (endpointsExist && !next.edges.some((candidate) => candidate.id === op.edge.id)) {
          next.edges.push({ ...op.edge })
        }
        break
      }
      case 'remove_node': {
        next.nodes = next.nodes.filter((candidate) => candidate.id !== op.node)
        // An edge to a removed node would dangle, so it goes too.
        next.edges = next.edges.filter(
          (edge) => edge.source !== op.node && edge.target !== op.node,
        )
        break
      }
      case 'remove_edge': {
        next.edges = next.edges.filter((candidate) => candidate.id !== op.edge)
        break
      }
    }
  }

  return next
}
