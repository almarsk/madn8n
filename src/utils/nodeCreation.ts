import { type Node } from 'reactflow'
import nodeConfigs, { type NodeType, NODE_TYPES } from '../nodeConfigs'
import modules from '../modules'
import { parseType, getNodeLabel, getId } from './nodeUtils'
import { getBranchingLayoutConstants, calculateOutputNodePosition, calculateBranchingNodeHeight } from './branchingNodeHelpers'

// ReactFlow component type - all nodes use the NodeFactory component
export const REACTFLOW_NODE_TYPE = 'nodeFactory'

// Helper function to create a node based on nodeConfig
export const createNodeFromConfig = (
  nodeType: NodeType,
  position: { x: number; y: number },
  options: {
    moduleName?: string
    label?: string
    outputCount?: number
    parentNodeId?: string
    connectingFrom?: string | null
    params?: Record<string, any>
    outputIndex?: number
  } = {}
): Node => {
  const config = nodeConfigs[nodeType]
  if (!config) {
    throw new Error(`Unknown node type: ${nodeType}`)
  }

  const module = options.moduleName ? modules.find((m) => m.name === options.moduleName) : undefined

  // Initialize params from module if provided
  const initialParams: Record<string, any> = {}
  if (module) {
    module.params.forEach((param) => {
      // Set default value based on type
      const { base } = parseType(param.type)
      if (base === 'number' || base === 'int' || base === 'float') {
        initialParams[param.name] = 0
      } else if (base === 'boolean' || base === 'bool') {
        initialParams[param.name] = false
      } else if (base === 'list') {
        initialParams[param.name] = []
      } else if (base === 'dict') {
        initialParams[param.name] = {}
      } else {
        initialParams[param.name] = ''
      }
    })
  }

  // Merge with provided params
  const nodeParams = { ...initialParams, ...(options.params || {}) }

  // Calculate label
  const nodeData: any = {
    ...config,
    nodeType,
    connectingFrom: options.connectingFrom ?? null,
    moduleName: options.moduleName,
    params: nodeParams,
    ...(options.outputCount !== undefined && { outputCount: options.outputCount }),
    ...(options.parentNodeId && { parentNodeId: options.parentNodeId }),
    ...(options.outputIndex !== undefined && { outputIndex: options.outputIndex }),
  }

  // Set label using helper function
  nodeData.label = getNodeLabel(module, nodeData, nodeType)

  const node: Node = {
    id: getId(options.moduleName, nodeType),
    type: REACTFLOW_NODE_TYPE,
    position,
    data: nodeData,
    style: {
      width: config.defaultWidth ?? 180,
      height: config.defaultHeight ?? 80,
    },
    zIndex: config.zIndex ?? 2,
  }

  return node
}

// Helper function to create a branching node with its output nodes
export const createBranchingNodeWithOutputs = (
  position: { x: number; y: number },
  outputCount: number,
  moduleName?: string,
  nodeType: NodeType = NODE_TYPES.BRANCHING_LIST_PARAM
): Node[] => {
  const branchingConfig = nodeConfigs[nodeType]

  if (!branchingConfig) {
    throw new Error('Branching config not found')
  }

  // Get the output node type from branching config
  const outputNodeType = branchingConfig.outputNodeType
  if (!outputNodeType) {
    throw new Error(`Branching config for ${nodeType} does not specify outputNodeType`)
  }

  const outputConfig = nodeConfigs[outputNodeType]
  if (!outputConfig) {
    throw new Error(`Output config for ${outputNodeType} not found`)
  }

  const module = moduleName ? modules.find((m) => m.name === moduleName) : undefined

  // Use the same layout constants and helper that branchingNodeHelpers uses so
  // that initial creation and later repositioning are perfectly aligned.
  const layoutConstants = getBranchingLayoutConstants()

  const padding = branchingConfig.padding || 20
  const headerHeight = branchingConfig.headerHeight || 50
  const outputSpacing = branchingConfig.outputSpacing || 10
  const outputNodeWidth = branchingConfig.outputNodeWidth || 220
  const outputNodeHeight = branchingConfig.outputNodeHeight || 60

  // Calculate branching node size based on output count
  // Use the standard output node width (all nodes should be same width)
  const branchingNodeWidth = outputNodeWidth + padding * 2
  // Use helper function to calculate height
  const branchingNodeHeight = calculateBranchingNodeHeight(outputCount, layoutConstants)

  const branchingNodeId = getId(moduleName, nodeType)

  const branchingNodeData: any = {
    ...branchingConfig,
    nodeType: nodeType,
    moduleName: moduleName,
    connectingFrom: null,
    outputCount,
  }

  // Set label using helper function
  branchingNodeData.label = getNodeLabel(module, branchingNodeData, nodeType)

  const branchingNode: Node = {
    id: branchingNodeId,
    type: REACTFLOW_NODE_TYPE,
    position,
    data: branchingNodeData,
    style: {
      width: branchingNodeWidth,
      height: branchingNodeHeight,
    },
    zIndex: branchingConfig.zIndex,
  }

  const outputNodes: Node[] = []

  for (let i = 0; i < outputCount; i++) {
    let outputParams: Record<string, any> = {}

    if (module?.outputConfig) {
      if (module.outputConfig.type === 'listParam') {
        // For listParam type, we'll initialize the param but label stays default for now
        // The actual value will come from the menu
        const listParamName = module.outputConfig.type === 'listParam' ? module.outputConfig.listParamName : undefined
        const listParam = listParamName ? module.params.find(p => p.name === listParamName) : undefined
        if (listParam) {
          // Initialize based on list element type (assuming it's an array of the param type)
          // For now, just use string as default
          outputParams.value = ''
        }
      } else if (module.outputConfig.type === 'internal') {
        // For internal type, just use default label
      }
    }

    // Set label for output node - for internal handling, use predefined labels
    let outputLabel = '_'
    if (module?.outputConfig?.type === 'internal' && module.outputLabels) {
      outputLabel = module.outputLabels[i] || '_'
    } else {
      // For listParam, label will be set from params.value later, default to "_"
      outputLabel = '_'
    }

    const outputNodeData: any = {
      ...outputConfig,
      nodeType: outputNodeType, // Use the output node type from branching config
      parentNodeId: branchingNodeId,
      connectingFrom: null,
      moduleName: moduleName,
      params: outputParams,
      label: outputLabel,
      outputIndex: i, // Store index for reference
    }

    // Use the same spacing calculation as in branchingNodeHelpers for consistency
    const firstOutputExtraSpacing = i === 0 ? 20 : 0
    const outputPosition = calculateOutputNodePosition(position, i, layoutConstants)

    const outputNode: Node = {
      id: getId(moduleName, outputNodeType),
      type: REACTFLOW_NODE_TYPE,
      position: outputPosition,
      data: outputNodeData,
      style: {
        width: outputNodeWidth,
        height: outputNodeHeight,
      },
      zIndex: outputConfig.zIndex,
    }
    outputNodes.push(outputNode)
  }

  return [branchingNode, ...outputNodes]
}
