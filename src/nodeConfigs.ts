export interface NodeConfig {
  name: string
  type: 'single' | 'branching' | 'branchingOutput'
  description: string
  hasSourceHandles: boolean
  hasTargetHandles: boolean
  canStartConnection: boolean
  className?: string
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
}

export const nodeConfigs: Record<string, NodeConfig> = {
  single: {
    name: 'Single',
    type: 'single',
    description: 'Standard node with input and output capabilities',
    hasSourceHandles: true,
    hasTargetHandles: true,
    canStartConnection: true,
    defaultWidth: 150,
    defaultHeight: 80,
    zIndex: 2,
  },
  branching: {
    name: 'Branching',
    type: 'branching',
    description: 'Branching node that contains output nodes',
    hasSourceHandles: false,
    hasTargetHandles: true,
    canStartConnection: false,
    className: 'branching-node',
    padding: 20,
    headerHeight: 50,
    outputSpacing: 10,
    outputNodeWidth: 130,
    outputNodeHeight: 60,
    defaultOutputCount: 1,
    zIndex: 1,
  },
  branchingOutput: {
    name: 'Branching Output',
    type: 'branchingOutput',
    description: 'Output node that belongs to a branching node',
    hasSourceHandles: true,
    hasTargetHandles: false,
    canStartConnection: true,
    className: 'branching-node-output',
    defaultWidth: 130,
    defaultHeight: 60,
    zIndex: 2,
  },
}

export type NodeType = keyof typeof nodeConfigs

// Get node type keys from configs (single source of truth)
const BRANCHING_NODE_TYPE: NodeType = 'branching'
const BRANCHING_OUTPUT_NODE_TYPE: NodeType = 'branchingOutput'
const SINGLE_NODE_TYPE: NodeType = 'single'

// Helper to check if a node type is branching
export const isBranchingNodeType = (nodeType: NodeType): boolean => {
  return nodeType === BRANCHING_NODE_TYPE
}

// Helper to check if a node type is branchingOutput
export const isBranchingOutputNodeType = (nodeType: NodeType): boolean => {
  return nodeType === BRANCHING_OUTPUT_NODE_TYPE
}

// Helper to check if a node type is single
export const isSingleNodeType = (nodeType: NodeType): boolean => {
  return nodeType === SINGLE_NODE_TYPE
}

// Export constants for use in node creation
export const NODE_TYPES = {
  BRANCHING: BRANCHING_NODE_TYPE,
  BRANCHING_OUTPUT: BRANCHING_OUTPUT_NODE_TYPE,
  SINGLE: SINGLE_NODE_TYPE,
} as const

export default nodeConfigs
