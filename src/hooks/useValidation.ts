import { useCallback } from 'react'
import { type Node, type Edge } from 'reactflow'
import nodeConfigs, { type NodeType, isBranchingOutputNodeType } from '../nodeConfigs'
import modules from '../modules'
import { parseType } from '../utils/nodeUtils'

export interface ValidationStatus {
  isValid: boolean | null
  message: string
}

// Helper to check if a value is empty (null, undefined, empty string, empty array, empty object)
const isEmpty = (value: any): boolean => {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  if (typeof value === 'object' && Object.keys(value).length === 0) return true
  return false
}

export function useValidation(nodes: Node[], edges: Edge[]) {
  const validate = useCallback((): ValidationStatus => {
    const errors: string[] = []

    // Check if all nodes with source handles have outgoing edges
    const nodesWithSourceHandles = nodes.filter((node) => {
      const nodeType = node.data?.nodeType as NodeType | undefined
      if (!nodeType) return false
      const config = nodeConfigs[nodeType]
      return config?.hasSourceHandles === true
    })

    const unconnectedNodes = nodesWithSourceHandles.filter((node) => {
      const hasOutgoingEdge = edges.some((edge) => edge.source === node.id)
      return !hasOutgoingEdge
    })

    if (unconnectedNodes.length > 0) {
      const nodeLabels = unconnectedNodes.map((n) => {
        const label = n.data?.label || n.id
        if (n.data?.parentNodeId) {
          const parentNode = nodes.find((parent) => parent.id === n.data.parentNodeId)
          const parentLabel = parentNode?.data?.label || n.data.parentNodeId
          return `${label} (parent: ${parentLabel})`
        }
        return label
      }).join(', ')
      errors.push(`${unconnectedNodes.length} node(s) with outputs are not connected: ${nodeLabels}`)
    }

    // Check if all obligatory params are filled
    const nodesWithMissingParams: Array<{ node: Node; missingParams: string[] }> = []
    
    nodes.forEach((node) => {
      const module = node.data?.moduleName ? modules.find((m) => m.name === node.data.moduleName) : undefined
      if (!module) return

      const nodeParams = node.data?.params || {}
      const missingParams: string[] = []

      module.params.forEach((param) => {
        // Default to obligatory if not specified (backwards compatibility)
        const isObligatory = param.obligatory !== false
        
        if (isObligatory) {
          const paramValue = nodeParams[param.name]
          if (isEmpty(paramValue)) {
            missingParams.push(param.name)
          }
        }
      })

      // For output nodes linked to listParam, check if value is filled
      if (isBranchingOutputNodeType(node.data?.nodeType as NodeType) && module.outputConfig?.type === 'listParam') {
        const outputValue = nodeParams.value
        if (isEmpty(outputValue)) {
          missingParams.push('value')
        }
      }

      if (missingParams.length > 0) {
        nodesWithMissingParams.push({ node, missingParams })
      }
    })

    if (nodesWithMissingParams.length > 0) {
      const missingParamsMessages = nodesWithMissingParams.map(({ node, missingParams }) => {
        const label = node.data?.label || node.id
        if (node.data?.parentNodeId) {
          const parentNode = nodes.find((parent) => parent.id === node.data.parentNodeId)
          const parentLabel = parentNode?.data?.label || node.data.parentNodeId
          return `${label} (parent: ${parentLabel}): missing ${missingParams.join(', ')}`
        }
        return `${label}: missing ${missingParams.join(', ')}`
      }).join('; ')
      errors.push(`Missing obligatory params: ${missingParamsMessages}`)
    }

    if (errors.length === 0) {
      return {
        isValid: true,
        message: 'All validations passed',
      }
    } else {
      return {
        isValid: false,
        message: errors.join('; '),
      }
    }
  }, [nodes, edges])

  return { validate }
}
