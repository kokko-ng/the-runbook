import type { DiagramOp, DiagramSpec, DiagramState } from './types'

/** The diagram a new save starts with: whatever the registry marks as present. */
export function initialDiagram(specs: Record<string, DiagramSpec>): DiagramState {
  const state: DiagramState = { nodes: {}, edges: {} }
  for (const spec of Object.values(specs ?? {})) {
    for (const node of spec.nodes ?? []) {
      state.nodes[node.id] = {
        present: node.present ?? false,
        status: node.status ?? 'healthy',
        ...(node.detail ? { detail: node.detail } : {}),
      }
    }
    for (const edge of spec.edges ?? []) {
      state.edges[edge.id] = { present: edge.present ?? false, status: edge.status ?? 'healthy' }
    }
  }
  return state
}

/**
 * Apply the mutations an encounter outcome declares.
 *
 * Unknown ids are ignored rather than thrown on: the content linter already
 * refuses to ship an op that names something undeclared, and a player mid-quest
 * should never see a crash because a node was renamed under them.
 */
export function applyOps(state: DiagramState, ops: DiagramOp[] | undefined): DiagramState {
  if (!ops?.length) return state
  const next: DiagramState = {
    nodes: { ...state.nodes },
    edges: { ...state.edges },
  }
  for (const op of ops) {
    switch (op.op) {
      case 'add_node':
        if (op.node && next.nodes[op.node]) {
          next.nodes[op.node] = { ...next.nodes[op.node], present: true, status: op.status ?? 'healthy' }
        }
        break
      case 'remove_node':
        if (op.node && next.nodes[op.node]) {
          next.nodes[op.node] = { ...next.nodes[op.node], present: false }
        }
        break
      case 'set_status':
        if (op.node && next.nodes[op.node] && op.status) {
          next.nodes[op.node] = { ...next.nodes[op.node], present: true, status: op.status }
        }
        break
      case 'set_detail':
        if (op.node && next.nodes[op.node]) {
          next.nodes[op.node] = { ...next.nodes[op.node], detail: op.detail }
        }
        break
      case 'add_edge':
        if (op.edge && next.edges[op.edge]) {
          next.edges[op.edge] = { ...next.edges[op.edge], present: true, status: op.status ?? 'healthy' }
        }
        break
      case 'remove_edge':
        if (op.edge && next.edges[op.edge]) {
          next.edges[op.edge] = { ...next.edges[op.edge], present: false }
        }
        break
      case 'set_edge_status':
        if (op.edge && next.edges[op.edge] && op.status) {
          next.edges[op.edge] = { ...next.edges[op.edge], present: true, status: op.status }
        }
        break
    }
  }
  return next
}
