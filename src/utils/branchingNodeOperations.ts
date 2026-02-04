import { type Node } from 'reactflow'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES, nodeConfigs } from '../nodeConfigs'
import modules from '../modules'
import { createNodeFromConfig } from './nodeCreation'
import { getBranchingLayoutConstants, calculateOutputNodePosition } from './branchingNodeHelpers'
import { parseType } from './nodeUtils'

// Helper to get output node params based on module config
export const getOutputNodeParams = (branchingModule: typeof modules[0] | undefined, index: number): Record<string, any> => {
  const outputParams: Record<string, any> = {}

  if (branchingModule?.outputConfig) {
    if (branchingModule.outputConfig.type === 'listParam') {
      const listParamName = branchingModule.outputConfig.listParamName
      const listParam = branchingModule.params.find(p => p.name === listParamName)
      if (listParam) {
        // Initialize based on param type - use parseType to get inner type
        const { inner } = parseType(listParam.type)
        const elementType = inner || listParam.type
        if (elementType === 'number' || elementType === 'int' || elementType === 'float') {
          outputParams.value = 0
        } else if (elementType === 'boolean' || elementType === 'bool') {
          outputParams.value = false
        } else {
          outputParams.value = ''
        }
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
  const { outputNodeWidth, padding, headerHeight, outputSpacing, outputNodeHeight } = layoutConstants
  return {
    width: outputNodeWidth + padding * 2,
    height: headerHeight + outputSpacing + (outputCount * outputNodeHeight) + ((outputCount - 1) * outputSpacing) + padding,
  }
}

// Helper to get default value for a param type
export const getDefaultValueForParamType = (paramType: string | undefined): any => {
  if (!paramType) return ''
  const { inner } = parseType(paramType)
  const elementType = inner || paramType
  if (elementType === 'number' || elementType === 'int' || elementType === 'float') {
    return 0
  } else if (elementType === 'boolean' || elementType === 'bool') {
    return false
  }
  return ''
}
