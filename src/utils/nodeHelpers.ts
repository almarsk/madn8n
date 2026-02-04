import { type Node } from 'reactflow'
import { type Module } from '../modules'
import nodeConfigs, { type NodeType, isBranchingNodeType, NODE_TYPES } from '../nodeConfigs'
import modules from '../modules'

// Helper to derive node type from module
export const getNodeTypeFromModule = (module: Module): NodeType => {
  // If module has outputConfig, it's a branching node
  if (module.outputConfig) {
    return 'branching'
  }
  // Otherwise, it's a single node
  return 'single'
}

// Helper to check if a module is branching
export const isBranchingModule = (module: Module): boolean => {
  return module.outputConfig !== undefined
}

// Helper to get node config for a module
export const getNodeConfigForModule = (module: Module) => {
  const nodeType = getNodeTypeFromModule(module)
  return nodeConfigs[nodeType]
}
