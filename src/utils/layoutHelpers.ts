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
 * 
 * Performance optimizations:
 * - Use Maps for O(1) lookups
 * - Limit BFS iterations
 * - Batch node updates
 */
export function autoLayout(
  nodes: Node[],
  edges: Edge[],
  rootModuleId?: string
): Node[] {
  if (nodes.length === 0) return nodes

  // Check if nodes are already well-positioned (not all at origin or very close together)
  // If so, preserve more of their relative positions
  const isWellPositioned = (() => {
    if (nodes.length <= 1) return false
    
    const positions = nodes
      .filter(n => {
        const nodeType = n.data?.nodeType as NodeType | undefined
        return !isBranchingOutputNodeType(nodeType)
      })
      .map(n => n.position)
    
    if (positions.length === 0) return false
    
    // Calculate spread of positions
    const xs = positions.map(p => p.x)
    const ys = positions.map(p => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    
    const spreadX = maxX - minX
    const spreadY = maxY - minY
    
    // Consider well-positioned if nodes are spread out (not all at origin or clustered)
    // Threshold: at least 200px spread in either direction
    return spreadX > 200 || spreadY > 200
  })()

  const nodeById = new Map<string, Node>()
  nodes.forEach((n) => nodeById.set(n.id, n))

  // 1) Identify module ids (exclude branching output nodes and Start node)
  const moduleIds = new Set<string>()
  const startNode = nodes.find((n) => n.data?.moduleName === 'Start')
  for (const node of nodes) {
    const nodeType = node.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingOutputNodeType(nodeType)) continue
    // Exclude Start node from module layout - it will be positioned separately
    if (node.id === startNode?.id) continue
    moduleIds.add(node.id)
  }

  if (moduleIds.size === 0) {
    // Nothing to layout in module-space, return as-is
    return nodes
  }

  // 2) Build module-level edges (collapse branching outputs to their parent)
  // Exclude Start node edges from level calculation - Start node is positioned separately
  type ModuleEdge = { from: string; to: string }
  const moduleEdges: ModuleEdge[] = []
  const incomingCount = new Map<string, number>()
  moduleIds.forEach((id) => incomingCount.set(id, 0))

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source)
    const targetNode = nodeById.get(edge.target)
    if (!sourceNode || !targetNode) continue

    // Skip edges from Start node - it's positioned separately
    if (sourceNode.data?.moduleName === 'Start') continue

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
  // Handle cycles by limiting how many times we can update a node's level
  const levelByModule = new Map<string, number>()
  const levelUpdateCount = new Map<string, number>() // Track how many times each node's level was updated

  if (rootId) {
    const queue: Array<{ id: string; level: number }> = [{ id: rootId, level: 0 }]
    levelByModule.set(rootId, 0)
    levelUpdateCount.set(rootId, 1)

    while (queue.length > 0) {
      const { id: current, level: currentLevel } = queue.shift()!
      
      for (const e of moduleEdges) {
        if (e.from === current) {
          const next = e.to
          const existing = levelByModule.get(next)
          const nextLevel = currentLevel + 1
          const updateCount = levelUpdateCount.get(next) || 0
          
          // Only update if:
          // 1. First visit, OR
          // 2. Longer path found AND we haven't updated this node too many times (prevents cycle loops)
          const MAX_UPDATES = 10 // Prevent infinite updates from cycles
          if (existing === undefined || (nextLevel > existing && updateCount < MAX_UPDATES)) {
            levelByModule.set(next, nextLevel)
            levelUpdateCount.set(next, updateCount + 1)
            queue.push({ id: next, level: nextLevel })
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

  // 5) Group by level and compute positions in a grid pattern
  // For nodes at the same level, arrange them in a grid (multiple rows)
  // Nodes with multiple inputs are positioned based on their source positions
  const groups = new Map<number, string[]>()
  levelByModule.forEach((level, id) => {
    if (!groups.has(level)) groups.set(level, [])
    groups.get(level)!.push(id)
  })

  const LEVEL_X_SPACING = 350 // Horizontal spacing between levels (reduced to minimize long connections)
  const NODE_Y_SPACING = 180 // Vertical spacing between nodes in same level
  const NODE_X_SPACING = 250 // Horizontal spacing between nodes in same level (reduced)
  
  // Calculate optimal grid dimensions based on node count
  // Use a square-ish grid that grows organically
  const calculateGridDimensions = (nodeCount: number): { cols: number; rows: number } => {
    if (nodeCount === 0) return { cols: 0, rows: 0 }
    if (nodeCount === 1) return { cols: 1, rows: 1 }
    
    // Aim for roughly square grids, but allow some flexibility
    // For small counts, use compact grids
    if (nodeCount <= 4) {
      return { cols: Math.ceil(Math.sqrt(nodeCount)), rows: Math.ceil(nodeCount / Math.ceil(Math.sqrt(nodeCount))) }
    }
    
    // For larger counts, use a more rectangular grid that grows organically
    // Try to keep aspect ratio reasonable (not too wide, not too tall)
    const cols = Math.ceil(Math.sqrt(nodeCount * 1.2)) // Slightly wider than square
    const rows = Math.ceil(nodeCount / cols)
    return { cols, rows }
  }

  // Calculate offset to position at 2/3 top-right of viewport
  // Assuming viewport is roughly 1920x1080, we want nodes at 2/3 right (1280px) and 2/3 down from top (720px)
  const VIEWPORT_OFFSET_X = 1280 // 2/3 of typical viewport width (1920 * 2/3)
  const VIEWPORT_OFFSET_Y = 720 // 2/3 down from top (1080 * 2/3)

  const positions = new Map<string, { x: number; y: number }>()

  // Build maps for positioning nodes based on their inputs
  // Track handle positions: 'top', 'bottom', 'left', 'right', or undefined (default)
  const incomingEdges = new Map<string, Array<{ sourceId: string; outputIndex: number; sourceHandle?: string; targetHandle?: string }>>()
  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source)
    const targetNode = nodeById.get(edge.target)
    if (!sourceNode || !targetNode) continue

    const sourceType = sourceNode.data?.nodeType as NodeType | undefined
    const targetType = targetNode.data?.nodeType as NodeType | undefined

    // Get the actual module IDs (collapse output nodes to parents)
    let sourceModuleId = sourceNode.id
    let targetModuleId = targetNode.id

    if (sourceType && isBranchingOutputNodeType(sourceType)) {
      const parentId = sourceNode.data?.parentNodeId as string | undefined
      if (parentId && moduleIds.has(parentId)) {
        sourceModuleId = parentId
      }
    }

    if (targetType && isBranchingOutputNodeType(targetType)) {
      const parentId = targetNode.data?.parentNodeId as string | undefined
      if (parentId && moduleIds.has(parentId)) {
        targetModuleId = parentId
      }
    }

    if (!moduleIds.has(sourceModuleId) || !moduleIds.has(targetModuleId)) continue
    if (sourceModuleId === targetModuleId) continue

    // Track incoming edges for each target module
    const outputIndex = sourceType && isBranchingOutputNodeType(sourceType)
      ? (typeof sourceNode.data?.outputIndex === 'number' ? sourceNode.data.outputIndex : 0)
      : 0

    if (!incomingEdges.has(targetModuleId)) {
      incomingEdges.set(targetModuleId, [])
    }
    incomingEdges.get(targetModuleId)!.push({ 
      sourceId: sourceModuleId, 
      outputIndex,
      sourceHandle: edge.sourceHandle || undefined,
      targetHandle: edge.targetHandle || undefined,
    })
  }

  // Process levels in order, positioning nodes based on their inputs
  const sortedLevels = Array.from(groups.keys()).sort((a, b) => a - b)
  
  for (const level of sortedLevels) {
    let ids = groups.get(level) || []
    
    // Sort nodes: prioritize nodes with inputs from previous levels
    // For nodes with multiple inputs, we'll position them based on average source Y position
    ids.sort((a, b) => {
      const aInputs = incomingEdges.get(a) || []
      const bInputs = incomingEdges.get(b) || []
      
      // Nodes with inputs from previous levels come first
      const aHasInputs = aInputs.length > 0
      const bHasInputs = bInputs.length > 0
      if (aHasInputs !== bHasInputs) {
        return aHasInputs ? -1 : 1
      }
      
      // If both have inputs, sort by output index of first input
      if (aHasInputs && bHasInputs) {
        const aFirstIndex = aInputs[0]?.outputIndex ?? Infinity
        const bFirstIndex = bInputs[0]?.outputIndex ?? Infinity
        if (aFirstIndex !== bFirstIndex) {
          return aFirstIndex - bFirstIndex
        }
      }
      
      return a.localeCompare(b)
    })
    
    // Arrange in grid: calculate positions with organic growth
    const count = ids.length
    const { cols, rows } = calculateGridDimensions(count)
    const baseX = VIEWPORT_OFFSET_X + level * LEVEL_X_SPACING
    
    // Calculate base Y position for this level (center the grid vertically)
    const totalGridHeight = (rows - 1) * NODE_Y_SPACING
    const baseY = VIEWPORT_OFFSET_Y - totalGridHeight / 2
    
    // Calculate grid width to center horizontally within the level
    const totalGridWidth = (cols - 1) * NODE_X_SPACING
    const gridStartX = baseX - totalGridWidth / 2

    ids.forEach((id, index) => {
      const row = Math.floor(index / cols)
      const col = index % cols
      
      // Default grid position
      let x = gridStartX + col * NODE_X_SPACING
      let y = baseY + row * NODE_Y_SPACING
      
      // If nodes are already well-positioned, try to preserve relative positions
      if (isWellPositioned && level > 0) {
        const originalNode = nodeById.get(id)
        if (originalNode) {
          // Calculate relative position within the level
          const originalX = originalNode.position.x
          const originalY = originalNode.position.y
          
          // Find min/max positions of nodes at this level in original layout
          const levelNodes = Array.from(moduleIds)
            .filter(moduleId => (levelByModule.get(moduleId) ?? 0) === level)
            .map(moduleId => nodeById.get(moduleId))
            .filter(n => n !== undefined) as Node[]
          
          if (levelNodes.length > 0) {
            const levelXs = levelNodes.map(n => n.position.x)
            const levelYs = levelNodes.map(n => n.position.y)
            const levelMinX = Math.min(...levelXs)
            const levelMaxX = Math.max(...levelXs)
            const levelMinY = Math.min(...levelYs)
            const levelMaxY = Math.max(...levelYs)
            
            const levelWidth = levelMaxX - levelMinX || 1
            const levelHeight = levelMaxY - levelMinY || 1
            
            // Calculate relative position (0-1) in original layout
            const relX = (originalX - levelMinX) / levelWidth
            const relY = (originalY - levelMinY) / levelHeight
            
            // Map to new grid position, preserving relative order
            const newGridWidth = (cols - 1) * NODE_X_SPACING
            const newGridHeight = (rows - 1) * NODE_Y_SPACING
            
            // Blend: 60% preserve relative position, 40% use grid
            const preservedX = gridStartX + relX * newGridWidth
            const preservedY = baseY + relY * newGridHeight
            x = x * 0.4 + preservedX * 0.6
            y = y * 0.4 + preservedY * 0.6
          }
        }
      }
      
      // For nodes with inputs, position them based on handle positions to minimize edge length and crossings
      const inputs = incomingEdges.get(id) || []
      if (inputs.length > 0 && level > 0) {
        // Determine primary handle direction from inputs
        let verticalHandles = 0 // top/bottom handles
        let horizontalHandles = 0 // left/right handles
        
        for (const input of inputs) {
          const sourceHandle = input.sourceHandle || ''
          const targetHandle = input.targetHandle || ''
          
          // Count vertical handles (top/bottom)
          if (sourceHandle.includes('top') || sourceHandle.includes('bottom') || 
              targetHandle.includes('top') || targetHandle.includes('bottom')) {
            verticalHandles++
          }
          // Count horizontal handles (left/right)
          if (sourceHandle.includes('left') || sourceHandle.includes('right') || 
              targetHandle.includes('left') || targetHandle.includes('right')) {
            horizontalHandles++
          }
        }
        
        // If primarily vertical handles (top/bottom), arrange vertically
        // If primarily horizontal handles (left/right), arrange horizontally
        // Otherwise use default grid
        
        if (verticalHandles > horizontalHandles && inputs.length === 1) {
          // Arrange vertically - position directly below/above source
          const sourcePos = positions.get(inputs[0].sourceId)
          if (sourcePos) {
            const sourceHandle = inputs[0].sourceHandle || ''
            const targetHandle = inputs[0].targetHandle || ''
            
            // Position directly aligned with source X, but at correct level
            x = sourcePos.x
            // Keep Y at grid position but adjust based on handle
            if (sourceHandle.includes('bottom') || targetHandle.includes('top')) {
              y = sourcePos.y + NODE_Y_SPACING * 1.5 // Position below source
            } else if (sourceHandle.includes('top') || targetHandle.includes('bottom')) {
              y = sourcePos.y - NODE_Y_SPACING * 1.5 // Position above source
            } else {
              y = baseY + row * NODE_Y_SPACING // Default grid position
            }
          }
        } else if (horizontalHandles > verticalHandles && inputs.length === 1) {
          // Arrange horizontally - position directly left/right of source
          const sourcePos = positions.get(inputs[0].sourceId)
          if (sourcePos) {
            const sourceHandle = inputs[0].sourceHandle || ''
            const targetHandle = inputs[0].targetHandle || ''
            
            // Position directly aligned with source Y, but at correct level
            y = sourcePos.y
            // Keep X at grid position but adjust based on handle
            if (sourceHandle.includes('right') || targetHandle.includes('left')) {
              x = sourcePos.x + NODE_X_SPACING * 1.5 // Position to the right of source
            } else if (sourceHandle.includes('left') || targetHandle.includes('right')) {
              x = sourcePos.x - NODE_X_SPACING * 1.5 // Position to the left of source
            } else {
              x = gridStartX + col * NODE_X_SPACING // Default grid position
            }
          }
        } else {
          // Default: use grid with slight adjustments based on handles
          let totalSourceX = 0
          let totalSourceY = 0
          let validSources = 0
          let handleOffsetX = 0
          let handleOffsetY = 0
          
          for (const input of inputs) {
            const sourcePos = positions.get(input.sourceId)
            if (sourcePos) {
              totalSourceX += sourcePos.x
              totalSourceY += sourcePos.y
              validSources++
              
              // Adjust based on handle positions
              if (input.sourceHandle === 'bottom-source' || input.targetHandle === 'top-target') {
                handleOffsetY += NODE_Y_SPACING * 0.5
              } else if (input.sourceHandle === 'top-source' || input.targetHandle === 'bottom-target') {
                handleOffsetY -= NODE_Y_SPACING * 0.5
              }
              if (input.sourceHandle === 'right-source' || input.targetHandle === 'left-target') {
                handleOffsetX += NODE_X_SPACING * 0.3
              } else if (input.sourceHandle === 'left-source' || input.targetHandle === 'right-target') {
                handleOffsetX -= NODE_X_SPACING * 0.3
              }
            }
          }
          
          if (validSources > 0) {
            const avgSourceX = totalSourceX / validSources
            const avgSourceY = totalSourceY / validSources
            const rowCenterY = baseY + row * NODE_Y_SPACING
            const handleAdjustedOffsetY = handleOffsetY / validSources
            const handleAdjustedOffsetX = handleOffsetX / validSources
            
            const baseAdjustmentY = avgSourceY - rowCenterY
            const adjustmentRange = NODE_Y_SPACING * 0.8
            const totalAdjustmentY = baseAdjustmentY + handleAdjustedOffsetY
            const yAdjustment = Math.max(-adjustmentRange, Math.min(adjustmentRange, totalAdjustmentY))
            
            y = rowCenterY + yAdjustment
            
            if (validSources === 1) {
              const sourceX = totalSourceX
              const targetX = baseX
              const xAdjustment = handleAdjustedOffsetX
              if (Math.abs(sourceX - targetX) > LEVEL_X_SPACING * 0.2) {
                x = Math.max(gridStartX, Math.min(gridStartX + (cols - 1) * NODE_X_SPACING, targetX + xAdjustment))
              }
            }
          }
        }
      }
      
      positions.set(id, { x, y })
    })
  }

  // 6) Handle Start node positioning - place it to the left of root module
  // Start node is excluded from level-based layout, so position it after root is positioned
  if (startNode && rootId) {
    const rootPos = positions.get(rootId)
    if (rootPos) {
      // Check if there are other nodes at the same Y level that might overlap
      // Find the leftmost node at root's level to avoid overlap
      const rootLevel = levelByModule.get(rootId) ?? 0
      let minXAtRootLevel = rootPos.x
      
      for (const [id, pos] of positions.entries()) {
        const nodeLevel = levelByModule.get(id) ?? 0
        if (nodeLevel === rootLevel && id !== rootId) {
          minXAtRootLevel = Math.min(minXAtRootLevel, pos.x)
        }
      }
      
      // Position Start node to the left, ensuring it doesn't overlap with other nodes
      // Use closer spacing (70% of level spacing) and ensure it's to the left of any other nodes
      const startX = Math.min(rootPos.x - LEVEL_X_SPACING * 0.7, minXAtRootLevel - NODE_X_SPACING * 1.5)
      positions.set(startNode.id, {
        x: startX,
        y: rootPos.y,
      })
    }
  }

  // 7) Special handling for nodes that connect to branching nodes via output nodes
  // Position them closer to the branching node's output connection point
  // This handles both forward connections and cycles (nodes connecting back to branching nodes)
  const nodesConnectingToBranching = new Map<string, { branchingId: string; outputIndex: number }>()
  
  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source)
    const targetNode = nodeById.get(edge.target)
    if (!sourceNode || !targetNode) continue

    const sourceType = sourceNode.data?.nodeType as NodeType | undefined
    const targetType = targetNode.data?.nodeType as NodeType | undefined

    // Check if source is a branching output node
    if (sourceType && isBranchingOutputNodeType(sourceType)) {
      const parentId = sourceNode.data?.parentNodeId as string | undefined
      if (parentId && moduleIds.has(parentId)) {
        // This edge comes from a branching node's output
        const outputIndex = typeof sourceNode.data?.outputIndex === 'number' 
          ? sourceNode.data.outputIndex 
          : 0
        
        // Get the target module ID
        let targetModuleId = targetNode.id
        if (targetType && isBranchingOutputNodeType(targetType)) {
          const targetParentId = targetNode.data?.parentNodeId as string | undefined
          if (targetParentId && moduleIds.has(targetParentId)) {
            targetModuleId = targetParentId
          }
        }
        
        if (moduleIds.has(targetModuleId)) {
          // Track that this target node connects to a branching node
          nodesConnectingToBranching.set(targetModuleId, {
            branchingId: parentId,
            outputIndex,
          })
        }
      }
    }
  }

  // Adjust positions for nodes that connect to branching nodes
  // Position them closer to the branching node's output connection area
  for (const [targetId, { branchingId, outputIndex }] of nodesConnectingToBranching.entries()) {
    const branchingPos = positions.get(branchingId)
    const targetPos = positions.get(targetId)
    if (!branchingPos || !targetPos) continue

    // Calculate where the output node would be positioned
    // This approximates the output node's Y position based on the branching layout constants
    const layoutConstants = getBranchingLayoutConstants()
    const outputY = branchingPos.y + layoutConstants.headerHeight + layoutConstants.outputSpacing + 
                    layoutConstants.firstOutputExtraSpacing + 
                    outputIndex * (layoutConstants.outputNodeHeight + layoutConstants.outputSpacing)

    // Adjust target node's Y to be closer to the output connection point
    // Blend the output Y position with the current grid position
    const blendFactor = 0.7 // 70% towards output position, 30% keep grid position
    const adjustedY = targetPos.y * (1 - blendFactor) + outputY * blendFactor
    positions.set(targetId, { ...targetPos, y: adjustedY })
  }

  // 8) Apply positions to module nodes
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

  return resultNodes
}

