import { type Node } from 'reactflow'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES, nodeConfigs, canOutputNodeBeDeleted } from '../nodeConfigs'
import modules from '../modules'
import { createNodeFromConfig } from './nodeCreation'
import { getBranchingLayoutConstants, calculateOutputNodePosition, repositionOutputNodes } from './branchingNodeHelpers'
import { getDefaultValueForType } from './configHelpers'

// Helper to get output node params based on module config
export const getOutputNodeParams = (branchingModule: typeof modules[0] | undefined, index: number): Record<string, any> => {
  const outputParams: Record<string, any> = {}

  if (branchingModule?.outputConfig) {
    if (branchingModule.outputConfig.type === 'listParam') {
      const listParamName = branchingModule.outputConfig.listParamName
      const listParam = branchingModule.params.find(p => p.name === listParamName)
      if (listParam) {
        // Initialize based on param type using centralized helper
        outputParams.value = getDefaultValueForType(listParam.type)
      }
    }
  }

  return outputParams
}

// Helper to create output nodes for a branching node
export const createOutputNodes = (
  branchingNode: Node,
  startIndex: number,
  count: number,
  layoutConstants = getBranchingLayoutConstants()
): Node[] => {
  const nodesToAdd: Node[] = []
  const branchingPos = branchingNode.position || { x: 0, y: 0 }
  const branchingModule = branchingNode.data?.moduleName ? modules.find((m) => m.name === branchingNode.data.moduleName) : undefined

  // Get the output node type from branching node config
  const branchingNodeType = branchingNode.data?.nodeType as NodeType | undefined
  const branchingConfig = branchingNodeType ? nodeConfigs[branchingNodeType] : undefined
  const outputNodeType = branchingConfig?.outputNodeType

  if (!outputNodeType) {
    throw new Error(`Branching node ${branchingNodeType} does not specify outputNodeType`)
  }

  for (let i = startIndex; i < startIndex + count; i++) {
    const outputParams = getOutputNodeParams(branchingModule, i)

    // Use predefined labels for internal handling, otherwise use "_"
    let outputLabel = '_'
    if (branchingModule?.outputConfig?.type === 'internal' && branchingModule.outputLabels) {
      outputLabel = branchingModule.outputLabels[i] || '_'
    }

    const outputNode = createNodeFromConfig(outputNodeType, calculateOutputNodePosition(branchingPos, i, layoutConstants), {
      moduleName: branchingNode.data?.moduleName,
      parentNodeId: branchingNode.id,
      connectingFrom: null,
      params: outputParams,
      outputIndex: i, // Store index for reference
    })
    outputNode.data.label = outputLabel
    nodesToAdd.push(outputNode)
  }

  return nodesToAdd
}

// Helper to calculate branching node dimensions
export const calculateBranchingNodeSize = (outputCount: number, layoutConstants = getBranchingLayoutConstants()) => {
  const { outputNodeWidth, padding, headerHeight, outputSpacing, outputNodeHeight, firstOutputExtraSpacing } = layoutConstants
  return {
    width: outputNodeWidth + padding * 2,
    height: headerHeight + outputSpacing + firstOutputExtraSpacing + (outputCount * outputNodeHeight) + ((outputCount - 1) * outputSpacing) + padding,
  }
}


/**
 * Remove output nodes from a branching node and update the listParam array.
 * This centralizes all the logic for handling output node deletion.
 * 
 * @param nodes - Current nodes array
 * @param removedOutputNodeIds - Set of output node IDs to remove
 * @param parentNodeIdsToUpdate - Set of branching node IDs that need updating
 * @returns Updated nodes array with output nodes removed and branching nodes updated
 */
export const removeOutputNodes = (
  nodes: Node[],
  removedOutputNodeIds: Set<string>,
  parentNodeIdsToUpdate: Set<string>
): { nodes: Node[]; selectedNodeId: string | null } => {
  if (removedOutputNodeIds.size === 0 || parentNodeIdsToUpdate.size === 0) {
    return { nodes, selectedNodeId: null }
  }

  // First, remove the deleted output nodes
  let updatedNodes = nodes.filter((n) => !removedOutputNodeIds.has(n.id))
  let selectedNodeId: string | null = null

  parentNodeIdsToUpdate.forEach((parentId) => {
    const branchingNode = updatedNodes.find((n) => n.id === parentId)
    if (!branchingNode) return

    const module = branchingNode.data?.moduleName ? modules.find((m) => m.name === branchingNode.data.moduleName) : undefined
    if (!module?.outputConfig || module.outputConfig.type !== 'listParam') return

    // Get remaining output nodes (after deletion)
    const remainingOutputNodes = updatedNodes.filter((n) => {
      const nType = n.data?.nodeType as NodeType | undefined
      return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === parentId
    })

    // Update the list param array - remove the deleted output node's value
    const listParamName = module.outputConfig.listParamName
    const currentArray = Array.isArray(branchingNode.data?.params?.[listParamName])
      ? [...branchingNode.data.params[listParamName]]
      : []

    // Get deleted nodes from original nodes array to find their indices
    const deletedOutputNodes = nodes.filter((n) => removedOutputNodeIds.has(n.id) && n.data.parentNodeId === parentId)
    const deletedIndices = deletedOutputNodes
      .map((n) => n.data?.outputIndex)
      .filter((idx): idx is number => typeof idx === 'number')
      .sort((a, b) => b - a) // Sort descending to remove from end first

    const updatedArray = [...currentArray]
    deletedIndices.forEach((idx) => {
      if (idx >= 0 && idx < updatedArray.length) {
        updatedArray.splice(idx, 1)
      }
    })

    // Sort remaining output nodes by their current outputIndex to maintain order
    const sortedRemaining = [...remainingOutputNodes].sort((a, b) => {
      const idxA = typeof a.data?.outputIndex === 'number' ? a.data.outputIndex : 0
      const idxB = typeof b.data?.outputIndex === 'number' ? b.data.outputIndex : 0
      return idxA - idxB
    })

    // Update output indices to be sequential (0, 1, 2, ...)
    sortedRemaining.forEach((outputNode, newIndex) => {
      const nodeIndex = updatedNodes.findIndex((n) => n.id === outputNode.id)
      if (nodeIndex >= 0) {
        updatedNodes[nodeIndex] = {
          ...updatedNodes[nodeIndex],
          data: {
            ...updatedNodes[nodeIndex].data,
            outputIndex: newIndex,
          },
        }
      }
    })

    // Recalculate branching node size
    const layoutConstants = getBranchingLayoutConstants()
    const { outputNodeWidth, padding, headerHeight, outputSpacing, outputNodeHeight, firstOutputExtraSpacing } = layoutConstants
    const newOutputCount = remainingOutputNodes.length
    const branchingNodeWidth = outputNodeWidth + padding * 2
    const branchingNodeHeight = headerHeight + outputSpacing + firstOutputExtraSpacing + (newOutputCount * outputNodeHeight) + ((newOutputCount - 1) * outputSpacing) + padding

    // Update branching node
    const branchingIndex = updatedNodes.findIndex((n) => n.id === parentId)
    if (branchingIndex >= 0) {
      updatedNodes[branchingIndex] = {
        ...updatedNodes[branchingIndex],
        style: {
          ...updatedNodes[branchingIndex].style,
          width: branchingNodeWidth,
          height: branchingNodeHeight,
        },
        data: {
          ...updatedNodes[branchingIndex].data,
          params: {
            ...updatedNodes[branchingIndex].data.params,
            [listParamName]: updatedArray,
          },
          outputCount: newOutputCount,
        },
      }
    }

    // Reposition remaining output nodes - this will use the updated outputIndex values
    updatedNodes = repositionOutputNodes(updatedNodes, parentId, layoutConstants)

    // Select the node above the deleted one if it exists
    if (deletedIndices.length > 0 && sortedRemaining.length > 0) {
      // Find the highest deleted index
      const highestDeletedIndex = Math.max(...deletedIndices)
      // Select the node at the position of the deleted node (or the last one if deleted was last)
      const nodeToSelectIndex = Math.min(highestDeletedIndex, sortedRemaining.length - 1)
      if (nodeToSelectIndex >= 0 && nodeToSelectIndex < sortedRemaining.length) {
        const nodeToSelect = sortedRemaining[nodeToSelectIndex]
        const selectIndex = updatedNodes.findIndex((n) => n.id === nodeToSelect.id)
        if (selectIndex >= 0) {
          updatedNodes[selectIndex] = {
            ...updatedNodes[selectIndex],
            selected: true,
          }
          selectedNodeId = nodeToSelect.id
        }
      }
    }
  })

  return { nodes: updatedNodes, selectedNodeId }
}

/**
 * Get output node IDs that should be removed when a branching node is deleted.
 * 
 * @param nodes - Current nodes array
 * @param removedBranchingNodeIds - Set of branching node IDs being removed
 * @returns Set of output node IDs to remove
 */
export const getOutputNodesToRemoveForBranchingNodes = (
  nodes: Node[],
  removedBranchingNodeIds: Set<string>
): Set<string> => {
  const outputNodeIdsToRemove = new Set<string>()
  nodes.forEach((n) => {
    const nodeType = n.data?.nodeType as NodeType | undefined
    if (nodeType && isBranchingOutputNodeType(nodeType) && n.data.parentNodeId && removedBranchingNodeIds.has(n.data.parentNodeId)) {
      outputNodeIdsToRemove.add(n.id)
    }
  })
  return outputNodeIdsToRemove
}
