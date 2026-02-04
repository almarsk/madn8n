import { type Node } from 'reactflow'
import nodeConfigs, { type NodeType, isBranchingOutputNodeType } from '../nodeConfigs'

// Get branching node layout constants
export const getBranchingLayoutConstants = () => {
  const branchingConfig = nodeConfigs.branching
  if (!branchingConfig) {
    return {
      padding: 20,
      headerHeight: 50,
      outputSpacing: 10,
      outputNodeWidth: 130,
      outputNodeHeight: 60,
    }
  }
  return {
    padding: branchingConfig.padding || 20,
    headerHeight: branchingConfig.headerHeight || 50,
    outputSpacing: branchingConfig.outputSpacing || 10,
    outputNodeWidth: branchingConfig.outputNodeWidth || 130,
    outputNodeHeight: branchingConfig.outputNodeHeight || 60,
  }
}

// Calculate output node position based on index and branching node position
export const calculateOutputNodePosition = (
  branchingPos: { x: number; y: number },
  index: number,
  layoutConstants = getBranchingLayoutConstants()
) => {
  const { padding, headerHeight, outputSpacing, outputNodeHeight } = layoutConstants
  return {
    x: branchingPos.x + padding,
    y: branchingPos.y + headerHeight + outputSpacing + index * (outputNodeHeight + outputSpacing),
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
