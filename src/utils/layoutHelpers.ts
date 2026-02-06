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
  sourceHandle?: string // e.g., 'bottom-source', 'left-source', 'right-source', 'top-source'
  targetHandle?: string // e.g., 'top-target', 'bottom-target', 'left-target', 'right-target'
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
 * @param nodes - All nodes in the flow
 * @param edges - All edges in the flow
 * @param rootModuleId - Optional root module ID to start layout from
 * @param selectedNodeIds - Optional set of selected node IDs. If provided, only layout selected nodes.
 */
export function autoLayout(
  nodes: Node[],
  edges: Edge[],
  rootModuleId?: string,
  selectedNodeIds?: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges }

  const nodeById = new Map<string, Node>()
  nodes.forEach((n) => nodeById.set(n.id, n))

  // 1) Identify module IDs (exclude branching output nodes)
  // If selectedNodeIds is provided, only include selected nodes
  const moduleIds = new Set<string>()

  for (const node of nodes) {
    const nodeType = node.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingOutputNodeType(nodeType)) continue
    
    // If selectedNodeIds is provided, only include selected nodes
    if (selectedNodeIds && !selectedNodeIds.has(node.id)) continue
    
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
      sourceHandle: edge.sourceHandle || undefined, // Preserve source handle to respect connection direction
      targetHandle: edge.targetHandle || undefined, // Preserve target handle to respect connection direction
    })

    incomingCount.set(toId, (incomingCount.get(toId) ?? 0) + 1)
  }

  // 3) Determine connected components (clusters) so we can space them apart horizontally
  const componentById = new Map<string, number>()
  const adjacency = new Map<string, Set<string>>()

  moduleEdges.forEach((edge) => {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set())
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set())
    adjacency.get(edge.from)!.add(edge.to)
    adjacency.get(edge.to)!.add(edge.from)
  })

  let currentComponent = 0
  moduleIds.forEach((id) => {
    if (componentById.has(id)) return
    const queue: string[] = [id]
    componentById.set(id, currentComponent)
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      const neighbors = adjacency.get(nodeId)
      if (!neighbors) continue
      neighbors.forEach((neighborId) => {
        if (!moduleIds.has(neighborId)) return
        if (!componentById.has(neighborId)) {
          componentById.set(neighborId, currentComponent)
          queue.push(neighborId)
        }
      })
    }
    currentComponent++
  })

  // 4) Assign layers using BFS (simple forward flow)
  const levelByModule = new Map<string, number>()
  const visited = new Set<string>()

  // Prefer explicit rootModuleId if provided, otherwise use all nodes with no incoming edges as roots.
  const roots: string[] =
    rootModuleId && moduleIds.has(rootModuleId)
      ? [rootModuleId]
      : Array.from(moduleIds).filter((id) => (incomingCount.get(id) ?? 0) === 0)

  const bfsQueue: Array<{ id: string; level: number }> = roots.map((id) => ({
    id,
    level: 0,
  }))

  roots.forEach((id) => {
    levelByModule.set(id, 0)
    visited.add(id)
  })

  while (bfsQueue.length > 0) {
    const { id: current, level: currentLevel } = bfsQueue.shift()!

    for (const edge of moduleEdges) {
      if (edge.from === current && !visited.has(edge.to)) {
        const nextLevel = currentLevel + 1
        const existingLevel = levelByModule.get(edge.to)
        if (existingLevel === undefined || nextLevel > existingLevel) {
          levelByModule.set(edge.to, nextLevel)
          visited.add(edge.to)
          bfsQueue.push({ id: edge.to, level: nextLevel })
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
  // Also group nodes by their source node to maintain source relationships
  const sortedLevels = Array.from(layers.keys()).sort((a, b) => a - b)
  const sortedLayers = new Map<number, string[]>()

  for (const level of sortedLevels) {
    const layer = layers.get(level) || []

    // Separate nodes into groups:
    // 1. Nodes connected from branching outputs (ordered by output index)
    // 2. Nodes grouped by their source node (to maintain source relationships)
    // 3. Other nodes
    const fromBranching: Array<{ id: string; outputIndex: number }> = []
    const bySource = new Map<string, string[]>() // sourceId -> target nodeIds
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
        // Group by source node - this maintains source relationships
        const incomingEdges = moduleEdges.filter(e => e.to === nodeId)
        if (incomingEdges.length > 0) {
          const sourceId = incomingEdges[0].from
          if (!bySource.has(sourceId)) {
            bySource.set(sourceId, [])
          }
          bySource.get(sourceId)!.push(nodeId)
        } else {
          others.push(nodeId)
        }
      }
    }

    // Sort by output index
    fromBranching.sort((a, b) => a.outputIndex - b.outputIndex)

    // Sort source groups by source's level (earlier levels first) to maintain topological order
    // Within same level, sort by source ID for stability
    const sortedBySource = Array.from(bySource.entries()).sort((a, b) => {
      const levelA = levelByModule.get(a[0]) ?? 999
      const levelB = levelByModule.get(b[0]) ?? 999
      if (levelA !== levelB) {
        return levelA - levelB
      }
      return a[0].localeCompare(b[0])
    })

    // Combine: branching-connected nodes first (by index), then nodes grouped by source, then others
    sortedLayers.set(level, [
      ...fromBranching.map(n => n.id),
      ...sortedBySource.flatMap(([_, nodeIds]) => nodeIds),
      ...others,
    ])
  }

  /**
   * 6) Reduce edge crossings by reordering nodes within each layer
   *
   * We apply a simple barycenter-based heuristic:
   * - For each layer > 0, compute the average index of each node's predecessors
   *   in the previous layer.
   * - Sort nodes in the current layer by this average index.
   *
   * This keeps children roughly aligned with their parents and helps avoid
   * unnecessary edge crossings while preserving the existing grouping logic
   * (branching outputs first, then source groups, then others) as a baseline.
   */
  const crossingReducedLayers = new Map<number, string[]>()

  for (const level of sortedLevels) {
    const originalLayer = sortedLayers.get(level) || []

    // Nothing to reorder in the root layer
    if (level === 0) {
      crossingReducedLayers.set(level, [...originalLayer])
      continue
    }

    const prevLevel = level - 1
    const prevLayer =
      crossingReducedLayers.get(prevLevel) ||
      sortedLayers.get(prevLevel) ||
      []

    const indexInPrev = new Map<string, number>()
    prevLayer.forEach((id, idx) => {
      indexInPrev.set(id, idx)
    })

    const nodesWithBarycenter = originalLayer.map((nodeId, originalIndex) => {
      // Only consider predecessors from the immediately previous level
      const predecessors = moduleEdges.filter(
        (e) => e.to === nodeId && (levelByModule.get(e.from) ?? -1) === prevLevel
      )

      if (predecessors.length === 0) {
        // No predecessors from previous layer: keep relative order
        return {
          nodeId,
          barycenter: originalIndex + 0.5,
          originalIndex,
        }
      }

      const sum = predecessors.reduce((acc, edge) => {
        const idx = indexInPrev.get(edge.from)
        return acc + (idx !== undefined ? idx : originalIndex)
      }, 0)

      const barycenter = sum / predecessors.length

      return {
        nodeId,
        barycenter,
        originalIndex,
      }
    })

    nodesWithBarycenter.sort((a, b) => {
      if (a.barycenter !== b.barycenter) {
        return a.barycenter - b.barycenter
      }
      // Stable fallback to original ordering within the layer
      return a.originalIndex - b.originalIndex
    })

    crossingReducedLayers.set(
      level,
      nodesWithBarycenter.map((n) => n.nodeId)
    )
  }

  // 7) Simple grid layout with overlap detection and resolution
  const positions = new Map<string, { x: number; y: number }>()
  const GRID_X_SPACING = 300
  const GRID_Y_SPACING = 150
  const COMPONENT_X_SPACING_MULTIPLIER = 4 // How many grid steps to separate clusters
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

  // Build a map of incoming edges for each node to determine positioning relative to source
  const incomingEdgesByNode = new Map<string, LayoutEdge[]>()
  moduleEdges.forEach((edge) => {
    if (!incomingEdgesByNode.has(edge.to)) {
      incomingEdgesByNode.set(edge.to, [])
    }
    incomingEdgesByNode.get(edge.to)!.push(edge)
  })

  for (const level of sortedLevels) {
    const layer =
      crossingReducedLayers.get(level) ||
      sortedLayers.get(level) ||
      []

    for (let j = 0; j < layer.length; j++) {
      const nodeId = layer[j]
      const node = nodeById.get(nodeId)
      if (!node) continue

      const nodeDims = getNodeDimensions(node)

      // Determine initial position based on source handle direction
      const componentIndex = componentById.get(nodeId) ?? 0
      const baseX =
        VIEWPORT_OFFSET_X +
        (level + componentIndex * COMPONENT_X_SPACING_MULTIPLIER) * GRID_X_SPACING
      let candidateX = baseX
      let candidateY = VIEWPORT_OFFSET_Y + j * GRID_Y_SPACING

      // Check incoming edges to respect both source and target handle directions
      const incomingEdges = incomingEdgesByNode.get(nodeId) || []
      let handleBasedPositionApplied = false

      if (incomingEdges.length > 0) {
        // Use the first incoming edge's handles to determine direction
        const firstEdge = incomingEdges[0]
        const sourcePos = positions.get(firstEdge.from)

        if (sourcePos) {
          const sourceNode = nodeById.get(firstEdge.from)
          const sourceDims = sourceNode ? getNodeDimensions(sourceNode) : { width: 220, height: 60 }
          const sourceHandle = firstEdge.sourceHandle || 'bottom-source'
          const targetHandle = firstEdge.targetHandle || 'top-target'

          // Position target relative to source based on both handle directions
          // Rules:
          // source.bottom → target.top    = source above target
          // source.top → target.bottom    = source below target
          // source.right → target.left    = source left of target
          // source.left → target.right    = source right of target
          //
          // source.bottom → target.left   = source above and left of target
          // source.bottom → target.right  = source above and right of target
          // source.top → target.left      = source below and left of target
          // source.top → target.right     = source below and right of target
          //
          // source.left → target.top      = source above and right of target
          // source.left → target.bottom   = source below and right of target
          // source.right → target.top     = source above and left of target
          // source.right → target.bottom  = source below and left of target

          const sourceDir = sourceHandle.includes('bottom-source') ? 'bottom'
            : sourceHandle.includes('top-source') ? 'top'
            : sourceHandle.includes('left-source') ? 'left'
            : sourceHandle.includes('right-source') ? 'right'
            : 'bottom'

          const targetDir = targetHandle.includes('top-target') ? 'top'
            : targetHandle.includes('bottom-target') ? 'bottom'
            : targetHandle.includes('left-target') ? 'left'
            : targetHandle.includes('right-target') ? 'right'
            : 'top'

          // Determine position based on handle combination
          if (sourceDir === 'bottom' && targetDir === 'top') {
            // source above target
            candidateY = sourcePos.y + sourceDims.height + GRID_Y_SPACING
            candidateX = sourcePos.x
            handleBasedPositionApplied = true
          } else if (sourceDir === 'top' && targetDir === 'bottom') {
            // source below target
            candidateY = sourcePos.y - nodeDims.height - GRID_Y_SPACING
            candidateX = sourcePos.x
            handleBasedPositionApplied = true
          } else if (sourceDir === 'right' && targetDir === 'left') {
            // source left of target
            candidateX = sourcePos.x + sourceDims.width + GRID_X_SPACING
            candidateY = sourcePos.y
            handleBasedPositionApplied = true
          } else if (sourceDir === 'left' && targetDir === 'right') {
            // source right of target
            candidateX = sourcePos.x - nodeDims.width - GRID_X_SPACING
            candidateY = sourcePos.y
            handleBasedPositionApplied = true
          } else if (sourceDir === 'bottom' && targetDir === 'left') {
            // source above, target left handle -> target bottom-right of source (minimize overlap)
            candidateY = sourcePos.y + sourceDims.height + GRID_Y_SPACING
            candidateX = sourcePos.x + sourceDims.width + GRID_X_SPACING
            handleBasedPositionApplied = true
          } else if (sourceDir === 'bottom' && targetDir === 'right') {
            // source above, target right handle -> target bottom-left of source (minimize overlap)
            candidateY = sourcePos.y + sourceDims.height + GRID_Y_SPACING
            candidateX = sourcePos.x - nodeDims.width - GRID_X_SPACING
            handleBasedPositionApplied = true
          } else if (sourceDir === 'top' && targetDir === 'left') {
            // source below, target left handle -> target top-right of source (minimize overlap)
            candidateY = sourcePos.y - nodeDims.height - GRID_Y_SPACING
            candidateX = sourcePos.x + sourceDims.width + GRID_X_SPACING
            handleBasedPositionApplied = true
          } else if (sourceDir === 'top' && targetDir === 'right') {
            // source below, target right handle -> target top-left of source (minimize overlap)
            candidateY = sourcePos.y - nodeDims.height - GRID_Y_SPACING
            candidateX = sourcePos.x - nodeDims.width - GRID_X_SPACING
            handleBasedPositionApplied = true
          } else if (sourceDir === 'left' && targetDir === 'top') {
            // source above and left of target (minimize overlap)
            candidateY = sourcePos.y + sourceDims.height + GRID_Y_SPACING
            candidateX = sourcePos.x - nodeDims.width - GRID_X_SPACING
            handleBasedPositionApplied = true
          } else if (sourceDir === 'left' && targetDir === 'bottom') {
            // source below and left of target (minimize overlap)
            candidateY = sourcePos.y - nodeDims.height - GRID_Y_SPACING
            candidateX = sourcePos.x - nodeDims.width - GRID_X_SPACING
            handleBasedPositionApplied = true
          } else if (sourceDir === 'right' && targetDir === 'top') {
            // source above and right of target (minimize overlap)
            candidateY = sourcePos.y + sourceDims.height + GRID_Y_SPACING
            candidateX = sourcePos.x + sourceDims.width + GRID_X_SPACING
            handleBasedPositionApplied = true
          } else if (sourceDir === 'right' && targetDir === 'bottom') {
            // source below and right of target (minimize overlap)
            candidateY = sourcePos.y - nodeDims.height - GRID_Y_SPACING
            candidateX = sourcePos.x + sourceDims.width + GRID_X_SPACING
            handleBasedPositionApplied = true
          }
        }
      }

      // For nodes connected from branching outputs, arrange in parallel column
      // BUT only if handle-based positioning was NOT applied (to preserve handle direction)
      const fromBranchingEdges = incomingEdges.filter(e => e.outputIndex !== undefined)
      if (fromBranchingEdges.length > 0 && !handleBasedPositionApplied) {
        // Find the source node position
        const sourceEdge = fromBranchingEdges[0]
        const sourcePos = positions.get(sourceEdge.from)
        if (sourcePos) {
          const sourceNode = nodeById.get(sourceEdge.from)
          const sourceDims = sourceNode ? getNodeDimensions(sourceNode) : { width: 220, height: 60 }
          const outputIndex = sourceEdge.outputIndex ?? 0

          // Arrange in parallel column to the right of source
          candidateX = sourcePos.x + sourceDims.width + GRID_X_SPACING
          candidateY = sourcePos.y + (outputIndex * GRID_Y_SPACING)
        }
      }

      // Check for overlaps with previously positioned nodes
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
            { x: candidateX, y: candidateY },
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

      positions.set(nodeId, { x: candidateX, y: candidateY })
    }
  }

  // 7) Apply positions to module nodes
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
