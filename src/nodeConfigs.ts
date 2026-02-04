export interface NodeConfig {
  name: string
  type: 'single' | 'branching' | 'branchingOutput'
  description: string
  hasSourceHandles: boolean
  hasTargetHandles: boolean
  canStartConnection: boolean
  className?: string
  // Whether this node type should be available as a module (false for auto-generated types)
  isModuleType?: boolean
  // Layout properties
  defaultWidth?: number
  defaultHeight?: number
  zIndex?: number
  // Branching node specific layout
  padding?: number
  headerHeight?: number
  outputSpacing?: number
  outputNodeWidth?: number
  outputNodeHeight?: number
  defaultOutputCount?: number
  // For branching nodes: specifies which output node type to use
  outputNodeType?: NodeType
  // For output nodes: whether they can be deleted
  canBeDeleted?: boolean
}

export const nodeConfigs: Record<string, NodeConfig> = {
  single: {
    name: 'Single',
    type: 'single',
    description: 'Standard node with input and output capabilities',
    hasSourceHandles: true,
    hasTargetHandles: true,
    canStartConnection: true,
    isModuleType: true,
    defaultWidth: 150,
    defaultHeight: 80,
    zIndex: 2,
  },
  branchingInternal: {
    name: 'Branching Internal',
    type: 'branching',
    description: 'Branching node with internal handling (outputs cannot be deleted)',
    hasSourceHandles: false,
    hasTargetHandles: true,
    canStartConnection: false,
    isModuleType: true,
    className: 'branching-node',
    padding: 20,
    headerHeight: 50,
    outputSpacing: 10,
    outputNodeWidth: 130,
    outputNodeHeight: 60,
    defaultOutputCount: 1,
    zIndex: 1,
    outputNodeType: 'branchingOutputInternal', // Specifies which output node type to use
  },
  branchingListParam: {
    name: 'Branching List Param',
    type: 'branching',
    description: 'Branching node with list param (outputs can be deleted)',
    hasSourceHandles: false,
    hasTargetHandles: true,
    canStartConnection: false,
    isModuleType: true,
    className: 'branching-node',
    padding: 20,
    headerHeight: 50,
    outputSpacing: 10,
    outputNodeWidth: 130,
    outputNodeHeight: 60,
    defaultOutputCount: 1,
    zIndex: 1,
    outputNodeType: 'branchingOutputListParam', // Specifies which output node type to use
  },
  branchingOutputInternal: {
    name: 'Branching Output Internal',
    type: 'branchingOutput',
    description: 'Output node for internal branching (cannot be deleted)',
    hasSourceHandles: true,
    hasTargetHandles: false,
    canStartConnection: true,
    isModuleType: false, // Auto-generated, not available as module
    className: 'branching-node-output',
    defaultWidth: 130,
    defaultHeight: 60,
    zIndex: 2,
    canBeDeleted: false, // Cannot be deleted
  },
  branchingOutputListParam: {
    name: 'Branching Output List Param',
    type: 'branchingOutput',
    description: 'Output node for list param branching (can be deleted)',
    hasSourceHandles: true,
    hasTargetHandles: false,
    canStartConnection: true,
    isModuleType: false, // Auto-generated, not available as module
    className: 'branching-node-output',
    defaultWidth: 130,
    defaultHeight: 60,
    zIndex: 2,
    canBeDeleted: true, // Can be deleted
  },
}

export type NodeType = keyof typeof nodeConfigs

// Helper to get excluded node types (types that should not be available as modules)
// Derived from nodeConfigs where isModuleType is false or undefined
export const getExcludedModuleTypes = (): NodeType[] => {
  return Object.entries(nodeConfigs)
    .filter(([_, config]) => config.isModuleType === false)
    .map(([type, _]) => type as NodeType)
}

// Get node type keys from configs (single source of truth)
const BRANCHING_INTERNAL_NODE_TYPE: NodeType = 'branchingInternal'
const BRANCHING_LIST_PARAM_NODE_TYPE: NodeType = 'branchingListParam'
const BRANCHING_OUTPUT_INTERNAL_NODE_TYPE: NodeType = 'branchingOutputInternal'
const BRANCHING_OUTPUT_LIST_PARAM_NODE_TYPE: NodeType = 'branchingOutputListParam'
const SINGLE_NODE_TYPE: NodeType = 'single'

// Helper to check if a node type is branching (either internal or listParam)
export const isBranchingNodeType = (nodeType: NodeType): boolean => {
  return nodeType === BRANCHING_INTERNAL_NODE_TYPE || nodeType === BRANCHING_LIST_PARAM_NODE_TYPE
}

// Helper to check if a node type is internal branching (outputs cannot be deleted)
export const isBranchingInternalNodeType = (nodeType: NodeType): boolean => {
  return nodeType === BRANCHING_INTERNAL_NODE_TYPE
}

// Helper to check if a node type is list param branching (outputs can be deleted)
export const isBranchingListParamNodeType = (nodeType: NodeType): boolean => {
  return nodeType === BRANCHING_LIST_PARAM_NODE_TYPE
}

// Helper to check if a node type is any branching output
export const isBranchingOutputNodeType = (nodeType: NodeType): boolean => {
  return nodeType === BRANCHING_OUTPUT_INTERNAL_NODE_TYPE || nodeType === BRANCHING_OUTPUT_LIST_PARAM_NODE_TYPE
}

// Helper to check if an output node can be deleted
export const canOutputNodeBeDeleted = (nodeType: NodeType | undefined): boolean => {
  if (!nodeType) return false
  const config = nodeConfigs[nodeType]
  return config?.canBeDeleted === true
}

// Helper to check if a node type is single
export const isSingleNodeType = (nodeType: NodeType): boolean => {
  return nodeType === SINGLE_NODE_TYPE
}

// Export constants for use in node creation
export const NODE_TYPES = {
  BRANCHING_INTERNAL: BRANCHING_INTERNAL_NODE_TYPE,
  BRANCHING_LIST_PARAM: BRANCHING_LIST_PARAM_NODE_TYPE,
  BRANCHING_OUTPUT_INTERNAL: BRANCHING_OUTPUT_INTERNAL_NODE_TYPE,
  BRANCHING_OUTPUT_LIST_PARAM: BRANCHING_OUTPUT_LIST_PARAM_NODE_TYPE,
  SINGLE: SINGLE_NODE_TYPE,
} as const

export default nodeConfigs
