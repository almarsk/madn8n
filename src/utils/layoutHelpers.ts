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
      sourceHandle: edge.sourceHandle || undefined, // Preserve source handle to respect connection direction
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

  // Build a map of incoming edges for each node to determine positioning relative to source
  const incomingEdgesByNode = new Map<string, LayoutEdge[]>()
  moduleEdges.forEach((edge) => {
    if (!incomingEdgesByNode.has(edge.to)) {
      incomingEdgesByNode.set(edge.to, [])
    }
    incomingEdgesByNode.get(edge.to)!.push(edge)
  })

  for (const level of sortedLevels) {
    const layer = sortedLayers.get(level) || []
    const baseX = VIEWPORT_OFFSET_X + level * GRID_X_SPACING

    for (let j = 0; j < layer.length; j++) {
      const nodeId = layer[j]
      const node = nodeById.get(nodeId)
      if (!node) continue

      const nodeDims = getNodeDimensions(node)

      // Determine initial position based on source handle direction
      let candidateX = baseX
      let candidateY = VIEWPORT_OFFSET_Y + j * GRID_Y_SPACING

      // Check incoming edges to respect source handle direction
      const incomingEdges = incomingEdgesByNode.get(nodeId) || []
      let handleBasedPositionApplied = false

      if (incomingEdges.length > 0) {
        // Use the first incoming edge's source handle to determine direction
        const firstEdge = incomingEdges[0]
        const sourcePos = positions.get(firstEdge.from)

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'layoutHelpers.ts:303', message: 'Checking incoming edges for handle-based positioning', data: { nodeId, incomingEdgeCount: incomingEdges.length, firstEdgeFrom: firstEdge.from, firstEdgeSourceHandle: firstEdge.sourceHandle, hasSourcePos: !!sourcePos }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => { });
        // #endregion

        if (sourcePos) {
          const sourceNode = nodeById.get(firstEdge.from)
          const sourceDims = sourceNode ? getNodeDimensions(sourceNode) : { width: 220, height: 60 }
          const sourceHandle = firstEdge.sourceHandle || 'bottom-source'

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'layoutHelpers.ts:312', message: 'Before handle-based positioning', data: { nodeId, sourceHandle, sourcePos, candidateX, candidateY, sourceDims, nodeDims }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => { });
          // #endregion

          // Position target relative to source based on handle direction
          // Final spec:
          // - bottom handle  -> source node ABOVE target node -> target BELOW source
          // - top handle     -> source node UNDER target node -> target ABOVE source
          // - left handle    -> source node RIGHT of target   -> target LEFT of source
          // - right handle   -> source node LEFT of target    -> target RIGHT of source

          // Bottom handle: source node above target node -> target below source
          if (sourceHandle.includes('bottom-source')) {
            candidateY = sourcePos.y + sourceDims.height + GRID_Y_SPACING
            candidateX = sourcePos.x
            handleBasedPositionApplied = true
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'layoutHelpers.ts:316', message: 'Applied bottom-source positioning', data: { nodeId, candidateX, candidateY }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => { });
            // #endregion
            // Top handle: source node under target node -> target above source
          } else if (sourceHandle.includes('top-source')) {
            candidateY = sourcePos.y - nodeDims.height - GRID_Y_SPACING
            candidateX = sourcePos.x
            handleBasedPositionApplied = true
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'layoutHelpers.ts:320', message: 'Applied top-source positioning', data: { nodeId, candidateX, candidateY }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => { });
            // #endregion
            // Left handle: source node right of target node -> target left of source
          } else if (sourceHandle.includes('left-source')) {
            candidateX = sourcePos.x - nodeDims.width - GRID_X_SPACING
            candidateY = sourcePos.y
            handleBasedPositionApplied = true
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'layoutHelpers.ts:324', message: 'Applied left-source positioning', data: { nodeId, candidateX, candidateY }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => { });
            // #endregion
            // Right handle: source node left of target node -> target right of source
          } else if (sourceHandle.includes('right-source')) {
            candidateX = sourcePos.x + sourceDims.width + GRID_X_SPACING
            candidateY = sourcePos.y
            handleBasedPositionApplied = true
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'layoutHelpers.ts:328', message: 'Applied right-source positioning', data: { nodeId, candidateX, candidateY }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => { });
            // #endregion
          } else {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'layoutHelpers.ts:331', message: 'No matching handle - using default positioning', data: { nodeId, sourceHandle, candidateX, candidateY }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => { });
            // #endregion
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
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'layoutHelpers.ts:379', message: 'Applied branching output positioning (no handle-based)', data: { nodeId, candidateX, candidateY, outputIndex }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4' }) }).catch(() => { });
          // #endregion
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
