import { type Node, type Edge } from 'reactflow'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType } from '../nodeConfigs'
import modules from '../modules'
import { REACTFLOW_NODE_TYPE } from './nodeCreation'

// Custom JSON format types
export interface CustomFlowMetadata {
  description: string
  language: string
  mchannels_bot_id: string
  name: string
  omnichannel_config?: {
    [key: string]: any
  }
  stickers?: {
    [key: string]: any
  }
}

export interface CustomNode {
  id: string
  moduleName: string
  nodeType: NodeType
  params: Record<string, any>
  position: { x: number; y: number }
  parentNodeId?: string
  outputIndex?: number
  outputCount?: number
}

export interface CustomEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

// The custom JSON shape is FLAT – metadata fields live at the top level
// alongside nodes and edges (no nested `metadata` property).
export interface CustomFlowJson extends CustomFlowMetadata {
  nodes: CustomNode[]
  edges: CustomEdge[]
}

// ReactFlow JSON format (what we currently export)
export interface ReactFlowJson {
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: {
      moduleName?: string
      params?: Record<string, any>
      parentNodeId?: string
      outputCount?: number
      nodeType?: NodeType
      [key: string]: any
    }
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
  }>
}

/**
 * Translate ReactFlow JSON to Custom JSON format
 */
export function translateReactFlowToCustom(
  reactFlowData: ReactFlowJson,
  metadata: CustomFlowMetadata
): CustomFlowJson {
  const customNodes: CustomNode[] = reactFlowData.nodes.map((node) => {
    const nodeType = (node.data?.nodeType || node.type) as NodeType
    
    return {
      id: node.id,
      moduleName: node.data?.moduleName || '',
      nodeType,
      params: node.data?.params || {},
      position: node.position,
      ...(node.data?.parentNodeId && { parentNodeId: node.data.parentNodeId }),
      ...(typeof node.data?.outputIndex === 'number' && { outputIndex: node.data.outputIndex }),
      ...(node.data?.outputCount !== undefined && { outputCount: node.data.outputCount }),
    }
  })

  const customEdges: CustomEdge[] = reactFlowData.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle && { sourceHandle: edge.sourceHandle }),
    ...(edge.targetHandle && { targetHandle: edge.targetHandle }),
  }))

  return {
    ...metadata,
    nodes: customNodes,
    edges: customEdges,
  }
}

/**
 * Translate Custom JSON format back to ReactFlow JSON
 */
export function translateCustomToReactFlow(customData: CustomFlowJson): {
  reactFlowData: ReactFlowJson
  metadata: CustomFlowMetadata
} {
  const reactFlowNodes = customData.nodes.map((node) => ({
    id: node.id,
    // Always use the NodeFactory ReactFlow type so styling and behavior are preserved
    type: REACTFLOW_NODE_TYPE,
    position: node.position,
    data: {
      moduleName: node.moduleName,
      nodeType: node.nodeType,
      params: node.params || {},
      ...(node.parentNodeId && { parentNodeId: node.parentNodeId }),
      ...(typeof node.outputIndex === 'number' && { outputIndex: node.outputIndex }),
      ...(node.outputCount !== undefined && { outputCount: node.outputCount }),
    },
  }))

  const reactFlowEdges = customData.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle && { sourceHandle: edge.sourceHandle }),
    ...(edge.targetHandle && { targetHandle: edge.targetHandle }),
  }))

  return {
    reactFlowData: {
      nodes: reactFlowNodes,
      edges: reactFlowEdges,
    },
    metadata: {
      description: customData.description,
      language: customData.language,
      mchannels_bot_id: customData.mchannels_bot_id,
      name: customData.name,
      omnichannel_config: customData.omnichannel_config,
      stickers: customData.stickers,
    },
  }
}

/**
 * Validate that custom JSON can be translated back to ReactFlow
 */
export function validateCustomJson(customData: CustomFlowJson): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Validate metadata
  if (typeof customData.description !== 'string') {
    errors.push('description must be a string')
  }
  if (typeof customData.language !== 'string') {
    errors.push('language must be a string')
  }
  if (typeof customData.mchannels_bot_id !== 'string') {
    errors.push('mchannels_bot_id must be a string')
  }
  if (typeof customData.name !== 'string') {
    errors.push('name must be a string')
  }

  // Validate nodes
  if (!Array.isArray(customData.nodes)) {
    errors.push('nodes must be an array')
  } else {
    customData.nodes.forEach((node, index) => {
      if (!node.id) {
        errors.push(`Node at index ${index} is missing id`)
      }
      if (!node.moduleName) {
        errors.push(`Node ${node.id || index} is missing moduleName`)
      }
      if (!node.nodeType) {
        errors.push(`Node ${node.id || index} is missing nodeType`)
      }
      if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        errors.push(`Node ${node.id || index} has invalid position`)
      }
      if (!node.params || typeof node.params !== 'object') {
        errors.push(`Node ${node.id || index} has invalid params`)
      }
    })
  }

  // Validate edges
  if (!Array.isArray(customData.edges)) {
    errors.push('edges must be an array')
  } else {
    customData.edges.forEach((edge, index) => {
      if (!edge.id) {
        errors.push(`Edge at index ${index} is missing id`)
      }
      if (!edge.source) {
        errors.push(`Edge ${edge.id || index} is missing source`)
      }
      if (!edge.target) {
        errors.push(`Edge ${edge.id || index} is missing target`)
      }
    })
  }

  // Validate edge references
  if (Array.isArray(customData.nodes) && Array.isArray(customData.edges)) {
    const nodeIds = new Set(customData.nodes.map((n) => n.id))
    customData.edges.forEach((edge) => {
      if (!nodeIds.has(edge.source)) {
        errors.push(`Edge ${edge.id} references non-existent source node: ${edge.source}`)
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`Edge ${edge.id} references non-existent target node: ${edge.target}`)
      }
    })
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
