import { type Node, type Edge } from 'reactflow'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType } from '../nodeConfigs'
import { getBranchingLayoutConstants, repositionOutputNodes } from './branchingNodeHelpers'

/**
 * Simple grid-based autolayout algorithm
 * - Nodes are arranged in a grid based on their layer (distance from root)
 * - Nodes connecting to branching outputs are ordered by output index
 * - Simple and predictable, easy to manually adjust
 */

interface LayoutEdge {
  from: string
  to: string
  outputIndex?: number
}

/**
 * Get node dimensions (width and height)
 */
function getNodeDimensions(node: Node): { width: number; height: number } {
  const defaultWidth = 220
  const defaultHeight = 60

  if (node.width && node.height) {
    return { width: node.width, height: node.height }
  }

  if (node.style) {
    const style = node.style as any
    const width = typeof style.width === 'number' ? style.width : defaultWidth
    const height = typeof style.height === 'number' ? style.height : defaultHeight
    return { width, height }
  }

  return { width: defaultWidth, height: defaultHeight }
}

/**
 * Main autolayout function
 */
export function autoLayout(
  nodes: Node[],
  edges: Edge[],
  rootModuleId?: string
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges }

  const nodeById = new Map<string, Node>()
  nodes.forEach((n) => nodeById.set(n.id, n))

  // 1) Identify module IDs (exclude branching output nodes and Start node)
  const moduleIds = new Set<string>()
  const startNode = nodes.find((n) => n.data?.moduleName === 'Start')

  for (const node of nodes) {
    const nodeType = node.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingOutputNodeType(nodeType)) continue
    if (node.id === startNode?.id) continue
    moduleIds.add(node.id)
  }

  if (moduleIds.size === 0) {
    return { nodes, edges }
  }

  // 2) Build module-level graph (collapse branching outputs to their parent)
  const moduleEdges: LayoutEdge[] = []
  const incomingCount = new Map<string, number>()
  const outputNodeToParent = new Map<string, { parentId: string; index: number }>()

  moduleIds.forEach((id) => incomingCount.set(id, 0))

  // Map output nodes to parents
  for (const node of nodes) {
    const nodeType = node.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingOutputNodeType(nodeType)) {
      const parentId = node.data?.parentNodeId as string | undefined
      const outputIndex = typeof node.data?.outputIndex === 'number' ? node.data.outputIndex : 0
      if (parentId) {
        outputNodeToParent.set(node.id, { parentId, index: outputIndex })
      }
    }
  }

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source)
    const targetNode = nodeById.get(edge.target)
    if (!sourceNode || !targetNode) continue

    if (sourceNode.data?.moduleName === 'Start') continue

    const sourceType = sourceNode.data?.nodeType as NodeType | undefined
    const targetType = targetNode.data?.nodeType as NodeType | undefined

    let fromId = sourceNode.id
    let toId = targetNode.id

    // Collapse branching output to parent
    if (sourceType && isBranchingOutputNodeType(sourceType)) {
      const parentInfo = outputNodeToParent.get(sourceNode.id)
      if (parentInfo && moduleIds.has(parentInfo.parentId)) {
        fromId = parentInfo.parentId
      }
    }

    if (targetType && isBranchingOutputNodeType(targetType)) {
      const parentInfo = outputNodeToParent.get(targetNode.id)
      if (parentInfo && moduleIds.has(parentInfo.parentId)) {
        toId = parentInfo.parentId
      }
    }

    if (!moduleIds.has(fromId) || !moduleIds.has(toId)) continue
    if (fromId === toId) continue

    const outputIndex = sourceType && isBranchingOutputNodeType(sourceType)
      ? outputNodeToParent.get(sourceNode.id)?.index ?? 0
      : 0

    moduleEdges.push({
      from: fromId,
      to: toId,
      outputIndex,
    })

    incomingCount.set(toId, (incomingCount.get(toId) ?? 0) + 1)
  }

  // 3) Determine root module
  let rootId: string | undefined
  if (rootModuleId && moduleIds.has(rootModuleId)) {
    rootId = rootModuleId
  } else {
    const noIncoming = Array.from(moduleIds).filter(
      (id) => (incomingCount.get(id) ?? 0) === 0
    )
    rootId = noIncoming[0] ?? Array.from(moduleIds)[0]
  }

  // 4) Assign layers using BFS (simple forward flow)
  const levelByModule = new Map<string, number>()
  const visited = new Set<string>()

  if (rootId) {
    const queue: Array<{ id: string; level: number }> = [{ id: rootId, level: 0 }]
    levelByModule.set(rootId, 0)
    visited.add(rootId)

    while (queue.length > 0) {
      const { id: current, level: currentLevel } = queue.shift()!

      for (const edge of moduleEdges) {
        if (edge.from === current && !visited.has(edge.to)) {
          const nextLevel = currentLevel + 1
          const existingLevel = levelByModule.get(edge.to)
          if (existingLevel === undefined || nextLevel > existingLevel) {
            levelByModule.set(edge.to, nextLevel)
            visited.add(edge.to)
            queue.push({ id: edge.to, level: nextLevel })
          }
        }
      }
    }
  }

  // Assign level 0 to unvisited nodes
  moduleIds.forEach((id) => {
    if (!levelByModule.has(id)) {
      levelByModule.set(id, 0)
    }
  })

  // 5) Group nodes by level and sort by output index for branching connections
  const layers = new Map<number, string[]>()
  levelByModule.forEach((level, id) => {
    if (!layers.has(level)) layers.set(level, [])
    layers.get(level)!.push(id)
  })

  // Sort nodes in each layer: nodes connected from branching outputs first, ordered by output index
  const sortedLevels = Array.from(layers.keys()).sort((a, b) => a - b)
  const sortedLayers = new Map<number, string[]>()

  for (const level of sortedLevels) {
    const layer = layers.get(level) || []

    // Separate nodes into two groups:
    // 1. Nodes connected from branching outputs (ordered by output index)
    // 2. Other nodes
    const fromBranching: Array<{ id: string; outputIndex: number }> = []
    const others: string[] = []

    for (const nodeId of layer) {
      const incomingFromBranching = moduleEdges
        .filter(e => e.to === nodeId && e.outputIndex !== undefined)
        .sort((a, b) => (a.outputIndex ?? 0) - (b.outputIndex ?? 0))

      if (incomingFromBranching.length > 0) {
        fromBranching.push({
          id: nodeId,
          outputIndex: incomingFromBranching[0].outputIndex ?? 0
        })
      } else {
        others.push(nodeId)
      }
    }

    // Sort by output index
    fromBranching.sort((a, b) => a.outputIndex - b.outputIndex)

    // Combine: branching-connected nodes first (by index), then others
    sortedLayers.set(level, [
      ...fromBranching.map(n => n.id),
      ...others
    ])
  }

  // 6) Simple grid layout with overlap detection and resolution
  const positions = new Map<string, { x: number; y: number }>()
  const GRID_X_SPACING = 300
  const GRID_Y_SPACING = 150
  const VIEWPORT_OFFSET_X = 1280
  const VIEWPORT_OFFSET_Y = 720
  const MIN_NODE_SPACING = 20 // Minimum spacing between nodes to prevent overlap

  /**
   * Check if two nodes overlap
   */
  function nodesOverlap(
    pos1: { x: number; y: number },
    dims1: { width: number; height: number },
    pos2: { x: number; y: number },
    dims2: { width: number; height: number }
  ): boolean {
    return (
      pos1.x < pos2.x + dims2.width + MIN_NODE_SPACING &&
      pos1.x + dims1.width + MIN_NODE_SPACING > pos2.x &&
      pos1.y < pos2.y + dims2.height + MIN_NODE_SPACING &&
      pos1.y + dims1.height + MIN_NODE_SPACING > pos2.y
    )
  }

  for (const level of sortedLevels) {
    const layer = sortedLayers.get(level) || []
    const baseX = VIEWPORT_OFFSET_X + level * GRID_X_SPACING

    for (let j = 0; j < layer.length; j++) {
      const nodeId = layer[j]
      const node = nodeById.get(nodeId)
      if (!node) continue

      const nodeDims = getNodeDimensions(node)
      let candidateY = VIEWPORT_OFFSET_Y + j * GRID_Y_SPACING

      // Check for overlaps with previously positioned nodes in this layer
      let hasOverlap = true
      let attempts = 0
      const maxAttempts = 100

      while (hasOverlap && attempts < maxAttempts) {
        hasOverlap = false

        // Check against all previously positioned nodes (including from other layers)
        for (const [existingId, existingPos] of positions.entries()) {
          const existingNode = nodeById.get(existingId)
          if (!existingNode) continue

          const existingDims = getNodeDimensions(existingNode)

          if (nodesOverlap(
            { x: baseX, y: candidateY },
            nodeDims,
            existingPos,
            existingDims
          )) {
            hasOverlap = true
            // Move down by the height of the overlapping node plus spacing
            candidateY = existingPos.y + existingDims.height + MIN_NODE_SPACING
            break
          }
        }

        attempts++
      }

      positions.set(nodeId, { x: baseX, y: candidateY })
    }
  }

  // 7) Handle Start node positioning
  if (startNode && rootId) {
    const rootPos = positions.get(rootId)
    if (rootPos) {
      const startDims = getNodeDimensions(startNode)
      positions.set(startNode.id, {
        x: rootPos.x,
        y: rootPos.y - startDims.height - GRID_Y_SPACING,
      })
    }
  }

  // 8) Apply positions to module nodes
  const updatedNodes: Node[] = nodes.map((node) => {
    const nodeType = node.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingOutputNodeType(nodeType)) {
      return node
    }
    const pos = positions.get(node.id)
    if (!pos) return node
    return {
      ...node,
      position: { x: pos.x, y: pos.y },
    }
  })

  // 9) Reposition branching outputs relative to their parents
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

  return { nodes: resultNodes, edges }
}
