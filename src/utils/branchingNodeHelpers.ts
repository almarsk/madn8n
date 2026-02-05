import { type Node } from 'reactflow'
import nodeConfigs, { type NodeType, isBranchingOutputNodeType } from '../nodeConfigs'

// Get branching node layout constants
// Use the first branching config found (both should have same layout values)
export const getBranchingLayoutConstants = () => {
  const branchingConfig = nodeConfigs.branchingInternal || nodeConfigs.branchingListParam
  // Extra spacing for the first output to avoid crossing the header border line
  const firstOutputExtraSpacing = 20
  if (!branchingConfig) {
    return {
      padding: 20,
      headerHeight: 50,
      outputSpacing: 10,
      outputNodeWidth: 220,
      outputNodeHeight: 60,
      firstOutputExtraSpacing,
    }
  }
  return {
    padding: branchingConfig.padding || 20,
    headerHeight: branchingConfig.headerHeight || 50,
    outputSpacing: branchingConfig.outputSpacing || 10,
    outputNodeWidth: branchingConfig.outputNodeWidth || 220,
    outputNodeHeight: branchingConfig.outputNodeHeight || 60,
    firstOutputExtraSpacing,
  }
}

// Calculate output node position based on index and branching node position
export const calculateOutputNodePosition = (
  branchingPos: { x: number; y: number },
  index: number,
  layoutConstants = getBranchingLayoutConstants()
) => {
  const { padding, headerHeight, outputSpacing, outputNodeHeight, firstOutputExtraSpacing } = layoutConstants
  // Consistent spacing formula:
  // Base position: headerHeight + outputSpacing + firstOutputExtraSpacing (applies to all nodes)
  // Each node: base + index * (nodeHeight + spacing)
  // This ensures: node0 at base, node1 at base+height+spacing, node2 at base+2*(height+spacing), etc.
  const baseY = branchingPos.y + headerHeight + outputSpacing + firstOutputExtraSpacing
  const y = baseY + index * (outputNodeHeight + outputSpacing)
  return {
    x: branchingPos.x + padding,
    y,
  }
}

// Reposition all output nodes for a branching node
export const repositionOutputNodes = (
  nodes: Node[],
  branchingNodeId: string,
  layoutConstants?: ReturnType<typeof getBranchingLayoutConstants>
): Node[] => {
  const constants = layoutConstants || getBranchingLayoutConstants()
  const branchingNode = nodes.find((n) => n.id === branchingNodeId)
  if (!branchingNode) return nodes

  const outputNodes = nodes.filter((n) => {
    const nodeType = n.data?.nodeType as NodeType | undefined
    return nodeType && isBranchingOutputNodeType(nodeType) && n.data.parentNodeId === branchingNodeId
  })

  // Sort output nodes by their outputIndex to ensure correct ordering
  const sortedOutputNodes = [...outputNodes].sort((a, b) => {
    const indexA = typeof a.data?.outputIndex === 'number' ? a.data.outputIndex : 0
    const indexB = typeof b.data?.outputIndex === 'number' ? b.data.outputIndex : 0
    return indexA - indexB
  })

  const branchingPos = branchingNode.position || { x: 0, y: 0 }

  return nodes.map((node) => {
    const nodeType = node.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingOutputNodeType(nodeType) && node.data.parentNodeId === branchingNodeId) {
      const index = sortedOutputNodes.findIndex((n) => n.id === node.id)
      if (index >= 0) {
        return {
          ...node,
          position: calculateOutputNodePosition(branchingPos, index, constants),
          data: {
            ...node.data,
            outputIndex: index, // Ensure outputIndex matches position
          },
        }
      }
    }
    return node
  })
}
