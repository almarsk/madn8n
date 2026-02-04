import { type Node, type Edge } from 'reactflow'
import { type NodeType } from '../nodeConfigs'

// Export node data to JSON format (only module logic, no config)
export const exportNodeToJson = (node: Node): any => {
  const nodeType = node.data?.nodeType as NodeType | undefined
  return {
    id: node.id,
    type: nodeType || 'single', // Use actual nodeType instead of 'nodeFactory'
    position: node.position,
    data: {
      moduleName: node.data?.moduleName,
      params: node.data?.params || {},
      ...(node.data?.parentNodeId && { parentNodeId: node.data.parentNodeId }),
      ...(node.data?.outputCount !== undefined && { outputCount: node.data.outputCount }),
    },
  }
}

// Export edge data to JSON format
export const exportEdgeToJson = (edge: Edge): any => {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle && { sourceHandle: edge.sourceHandle }),
    ...(edge.targetHandle && { targetHandle: edge.targetHandle }),
  }
}

// Export entire flow to JSON
export const exportFlowToJson = (nodes: Node[], edges: Edge[]) => {
  return {
    nodes: nodes.map(exportNodeToJson),
    edges: edges.map(exportEdgeToJson),
  }
}
