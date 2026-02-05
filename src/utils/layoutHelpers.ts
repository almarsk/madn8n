import { type Node, type Edge } from 'reactflow'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType } from '../nodeConfigs'
import { getBranchingLayoutConstants, repositionOutputNodes } from './branchingNodeHelpers'

/**
 * Compute a sensible layout for the current graph.
 *
 * Strategy:
 * - Collapse branching output nodes into their parent "module" for layout purposes.
 * - Work on a module-level DAG built from edges.
 * - Assign horizontal "levels" based on distance from root.
 * - Within each level, vertically center nodes and space them evenly.
 * - After module positions are set, use branching helpers to reposition output nodes.
 */
export function autoLayout(
  nodes: Node[],
  edges: Edge[],
  rootModuleId?: string
): Node[] {
  if (nodes.length === 0) return nodes

  const nodeById = new Map<string, Node>()
  nodes.forEach((n) => nodeById.set(n.id, n))

  // 1) Identify module ids (exclude branching output nodes)
  const moduleIds = new Set<string>()
  for (const node of nodes) {
    const nodeType = node.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingOutputNodeType(nodeType)) continue
    moduleIds.add(node.id)
  }

  if (moduleIds.size === 0) {
    // Nothing to layout in module-space, return as-is
    return nodes
  }

  // 2) Build module-level edges (collapse branching outputs to their parent)
  type ModuleEdge = { from: string; to: string }
  const moduleEdges: ModuleEdge[] = []
  const incomingCount = new Map<string, number>()
  moduleIds.forEach((id) => incomingCount.set(id, 0))

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source)
    const targetNode = nodeById.get(edge.target)
    if (!sourceNode || !targetNode) continue

    const sourceType = sourceNode.data?.nodeType as NodeType | undefined
    const targetType = targetNode.data?.nodeType as NodeType | undefined

    let fromId = sourceNode.id
    let toId = targetNode.id

    // Source as module: collapse branching output to its parent
    if (sourceType && isBranchingOutputNodeType(sourceType)) {
      const parentId = sourceNode.data?.parentNodeId as string | undefined
      if (parentId && moduleIds.has(parentId)) {
        fromId = parentId
      }
    }

    // Target as module: also collapse outputs to parent for layout depth
    if (targetType && isBranchingOutputNodeType(targetType)) {
      const parentId = targetNode.data?.parentNodeId as string | undefined
      if (parentId && moduleIds.has(parentId)) {
        toId = parentId
      }
    }

    if (!moduleIds.has(fromId) || !moduleIds.has(toId)) continue
    if (fromId === toId) continue

    moduleEdges.push({ from: fromId, to: toId })
    incomingCount.set(toId, (incomingCount.get(toId) ?? 0) + 1)
  }

  // 3) Determine root module(s)
  let rootId: string | undefined
  if (rootModuleId && moduleIds.has(rootModuleId)) {
    rootId = rootModuleId
  } else {
    // Prefer modules with no incoming edges
    const noIncoming = Array.from(moduleIds).filter(
      (id) => (incomingCount.get(id) ?? 0) === 0
    )
    rootId = noIncoming[0] ?? Array.from(moduleIds)[0]
  }

  // 4) Compute levels via BFS from root; fall back to 0 for unreachable nodes
  const levelByModule = new Map<string, number>()

  if (rootId) {
    const queue: string[] = [rootId]
    levelByModule.set(rootId, 0)

    while (queue.length > 0) {
      const current = queue.shift()!
      const currentLevel = levelByModule.get(current) ?? 0
      for (const e of moduleEdges) {
        if (e.from === current) {
          const next = e.to
          const existing = levelByModule.get(next)
          const nextLevel = currentLevel + 1
          if (existing === undefined || nextLevel > existing) {
            levelByModule.set(next, nextLevel)
            queue.push(next)
          }
        }
      }
    }
  }

  // Any module not visited gets level 0 (separate components)
  moduleIds.forEach((id) => {
    if (!levelByModule.has(id)) {
      levelByModule.set(id, 0)
    }
  })

  // 5) Group by level and compute positions
  // For nodes at the same level, order them by their incoming edge's source output index
  // to prevent edge crossings
  const groups = new Map<number, string[]>()
  levelByModule.forEach((level, id) => {
    if (!groups.has(level)) groups.set(level, [])
    groups.get(level)!.push(id)
  })

  const LEVEL_X_SPACING = 380
  const NODE_Y_SPACING = 150

  const positions = new Map<string, { x: number; y: number }>()

  // Build a map of target -> source output index for ordering
  const targetToSourceOutputIndex = new Map<string, number>()
  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source)
    if (!sourceNode) continue
    
    const sourceType = sourceNode.data?.nodeType as NodeType | undefined
    if (sourceType && isBranchingOutputNodeType(sourceType)) {
      const outputIndex = typeof sourceNode.data?.outputIndex === 'number' 
        ? sourceNode.data.outputIndex 
        : 0
      const targetId = edge.target
      // If target is an output node, map to its parent
      const targetNode = nodeById.get(targetId)
      const targetType = targetNode?.data?.nodeType as NodeType | undefined
      const finalTargetId = targetType && isBranchingOutputNodeType(targetType)
        ? (targetNode.data?.parentNodeId as string | undefined) || targetId
        : targetId
      
      // Only set if not already set or if this output index is lower (prefer first output)
      if (!targetToSourceOutputIndex.has(finalTargetId) || 
          (targetToSourceOutputIndex.get(finalTargetId)! > outputIndex)) {
        targetToSourceOutputIndex.set(finalTargetId, outputIndex)
      }
    }
  }

  const sortedLevels = Array.from(groups.keys()).sort((a, b) => a - b)
  for (const level of sortedLevels) {
    let ids = groups.get(level) || []
    
    // Sort by source output index if available, then by id for stability
    ids.sort((a, b) => {
      const aIndex = targetToSourceOutputIndex.get(a) ?? Infinity
      const bIndex = targetToSourceOutputIndex.get(b) ?? Infinity
      if (aIndex !== bIndex) {
        return aIndex - bIndex
      }
      return a.localeCompare(b)
    })
    
    const count = ids.length
    const totalHeight = (count - 1) * NODE_Y_SPACING
    const startY = -totalHeight / 2
    const x = level * LEVEL_X_SPACING

    ids.forEach((id, index) => {
      const y = startY + index * NODE_Y_SPACING
      positions.set(id, { x, y })
    })
  }

  // 6) Apply positions to module nodes
  const updatedNodes: Node[] = nodes.map((node) => {
    const nodeType = node.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingOutputNodeType(nodeType)) {
      // Output nodes will be handled in the next step
      return node
    }
    const pos = positions.get(node.id)
    if (!pos) return node
    return {
      ...node,
      position: { x: pos.x, y: pos.y },
    }
  })

  // 7) Reposition branching outputs relative to their parents
  const branchingIds = new Set<string>()
  updatedNodes.forEach((node) => {
    const nodeType = node.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingNodeType(nodeType)) {
      branchingIds.add(node.id)
    }
  })

  let resultNodes = updatedNodes
  const layoutConstants = getBranchingLayoutConstants()
  branchingIds.forEach((parentId) => {
    resultNodes = repositionOutputNodes(resultNodes, parentId, layoutConstants)
  })

  return resultNodes
}

