import { useCallback } from 'react'
import type { Node } from 'reactflow'
import modules from '../modules'
import nodeConfigs, { type NodeType, isBranchingOutputNodeType, canOutputNodeBeDeleted } from '../nodeConfigs'
import { getBranchingLayoutConstants, calculateOutputNodePosition } from '../utils/branchingNodeHelpers'
import { createNodeFromConfig } from '../utils/nodeCreation'
import { getDefaultValueForType } from '../utils/configHelpers'
import { updateBranchingNodeHeight } from '../utils/branchingNodeHelpers'

export interface BranchingOperations {
  onNodeDrag: (event: React.MouseEvent | React.TouchEvent, node: Node) => void
  onNodeDragStop: (event: React.MouseEvent | React.TouchEvent, node: Node) => void
  handleAddOutput: (nodeId: string) => void
}

export function useBranchingOperations(
  _nodes: Node[],
  setNodes: (updater: (nodes: Node[]) => Node[]) => void,
  saveHistoryBeforeChange: (changeType?: 'param' | 'other') => void,
  isLocked: boolean,
  highestZIndexRef: React.MutableRefObject<number>
): BranchingOperations {
  const onNodeDrag = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, node: Node) => {
      const nodeType = node.data?.nodeType as NodeType | undefined
      // Only handle list param output nodes (draggable ones)
      if (!nodeType || !isBranchingOutputNodeType(nodeType) || !canOutputNodeBeDeleted(nodeType) || !node.data?.parentNodeId) {
        return
      }

      const parentId = node.data.parentNodeId
      setNodes((nds) => {
        const branchingNode = nds.find((n) => n.id === parentId)
        if (!branchingNode) return nds

        const module = branchingNode.data?.moduleName ? modules.find((m) => m.name === branchingNode.data.moduleName) : undefined
        if (!module?.outputConfig || module.outputConfig.type !== 'listParam') return nds

        // Get all output nodes to calculate bounds
        const allOutputNodes = nds.filter((n) => {
          const nType = n.data?.nodeType as NodeType | undefined
          return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === parentId
        })

        // Lock X position to prevent horizontal dragging
        // Constrain Y movement to stay within branching node bounds
        const layoutConstants = getBranchingLayoutConstants()
        const { headerHeight, outputSpacing, outputNodeHeight, firstOutputExtraSpacing } = layoutConstants
        const branchingPos = branchingNode.position || { x: 0, y: 0 }
        const correctX = calculateOutputNodePosition(branchingPos, node.data?.outputIndex ?? 0, layoutConstants).x

        // Calculate valid Y bounds
        const baseY = branchingPos.y + headerHeight + outputSpacing + firstOutputExtraSpacing
        const step = outputNodeHeight + outputSpacing
        const minY = baseY
        const maxY = baseY + (allOutputNodes.length - 1) * step
        const constrainedY = Math.max(minY, Math.min(maxY, node.position.y))

        // Work out the "would be" index for the dragged node based on its vertical position
        const rawIndex = (constrainedY - baseY) / step
        const targetIndex = Math.max(0, Math.min(allOutputNodes.length - 1, Math.round(rawIndex)))

        // Build a temporary ordering with the dragged node inserted at the targetIndex
        const sortedByIndex = [...allOutputNodes].sort((a, b) => {
          const idxA = typeof a.data?.outputIndex === 'number' ? a.data.outputIndex : 0
          const idxB = typeof b.data?.outputIndex === 'number' ? b.data.outputIndex : 0
          return idxA - idxB
        })

        const withoutDragged = sortedByIndex.filter((n) => n.id !== node.id)
        const provisionalOrder = [
          ...withoutDragged.slice(0, targetIndex),
          node,
          ...withoutDragged.slice(targetIndex),
        ]

        // Update positions:
        // - dragged node follows cursor vertically (constrainedY) and is locked in X
        // - other outputs snap to their provisional slots so they visually move out of the way
        return nds.map((n) => {
          const nType = n.data?.nodeType as NodeType | undefined
          const isOutputForParent = nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === parentId

          if (!isOutputForParent) {
            return n
          }

          if (n.id === node.id) {
            return {
              ...n,
              position: { x: correctX, y: constrainedY },
            }
          }

          const newIndex = provisionalOrder.findIndex((item) => item.id === n.id)
          if (newIndex === -1) {
            return n
          }

          const snappedPos = calculateOutputNodePosition(branchingPos, newIndex, layoutConstants)
          return {
            ...n,
            position: snappedPos,
          }
        })
      })
    },
    [setNodes]
  )

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, node: Node) => {
      const nodeType = node.data?.nodeType as NodeType | undefined
      // Only handle list param output nodes (draggable ones)
      if (!nodeType || !isBranchingOutputNodeType(nodeType) || !canOutputNodeBeDeleted(nodeType) || !node.data?.parentNodeId) {
        return
      }

      const parentId = node.data.parentNodeId
      setNodes((nds) => {
        const branchingNode = nds.find((n) => n.id === parentId)
        if (!branchingNode) return nds

        const module = branchingNode.data?.moduleName ? modules.find((m) => m.name === branchingNode.data.moduleName) : undefined
        if (!module?.outputConfig || module.outputConfig.type !== 'listParam') return nds

        // Get all output nodes for this parent
        const allOutputNodes = nds.filter((n) => {
          const nType = n.data?.nodeType as NodeType | undefined
          return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === parentId
        })

        // Calculate new indices based on Y position - snap to valid positions
        const layoutConstants = getBranchingLayoutConstants()
        const { headerHeight, outputSpacing, outputNodeHeight, firstOutputExtraSpacing } = layoutConstants
        const branchingPos = branchingNode.position || { x: 0, y: 0 }

        // Create array of all output nodes with their current Y positions
        // Snap Y positions to valid column positions
        const baseY = branchingPos.y + headerHeight + outputSpacing + firstOutputExtraSpacing
        const step = outputNodeHeight + outputSpacing
        const nodesWithTargetY = allOutputNodes.map((node) => {
          const currentY = node.position.y
          // Snap to column positions, but be a bit more eager to switch slots
          // The +0.2 bias makes neighbours move earlier as you cross the midpoint
          const slotIndex = Math.round((currentY - baseY) / step + 0.2)
          const snappedY = baseY + slotIndex * step
          // Clamp to valid range
          const minY = baseY
          const maxY = baseY + (allOutputNodes.length - 1) * step
          const targetY = Math.max(minY, Math.min(maxY, snappedY))
          return { node, targetY, currentIndex: node.data?.outputIndex ?? 0 }
        })

        // Sort by target Y position to determine final order
        nodesWithTargetY.sort((a, b) => a.targetY - b.targetY)

        // Update output indices and list param array
        const listParamName = module.outputConfig.listParamName
        const currentArray = Array.isArray(branchingNode.data?.params?.[listParamName])
          ? [...branchingNode.data.params[listParamName]]
          : []

        // Create new array in the new order
        const newArray = nodesWithTargetY.map((item) => {
          const oldIndex = item.currentIndex
          return oldIndex >= 0 && oldIndex < currentArray.length ? currentArray[oldIndex] : ''
        })

        // Update nodes with final positions and indices
        const updatedNodes = [...nds]
        nodesWithTargetY.forEach((item, newIndex) => {
          const nodeIndex = updatedNodes.findIndex((n) => n.id === item.node.id)
          if (nodeIndex >= 0) {
            const correctPosition = calculateOutputNodePosition(branchingPos, newIndex, layoutConstants)
            updatedNodes[nodeIndex] = {
              ...updatedNodes[nodeIndex],
              position: correctPosition,
              data: {
                ...updatedNodes[nodeIndex].data,
                outputIndex: newIndex,
                params: {
                  ...updatedNodes[nodeIndex].data.params,
                  value: newArray[newIndex] ?? '',
                },
              },
            }
          }
        })

        // Update branching node with reordered array
        const branchingIndex = updatedNodes.findIndex((n) => n.id === parentId)
        if (branchingIndex >= 0) {
          updatedNodes[branchingIndex] = {
            ...updatedNodes[branchingIndex],
            data: {
              ...updatedNodes[branchingIndex].data,
              params: {
                ...updatedNodes[branchingIndex].data.params,
                [listParamName]: newArray,
              },
            },
          }
        }

        return updatedNodes
      })
    },
    [setNodes]
  )

  const handleAddOutput = useCallback(
    (nodeId: string) => {
      // Save history before adding output node
      if (!isLocked) {
        saveHistoryBeforeChange('other')
      }
      setNodes((nds) => {
        const branchingNode = nds.find((n) => n.id === nodeId)
        if (!branchingNode) return nds

        const module = branchingNode.data?.moduleName ? modules.find((m) => m.name === branchingNode.data.moduleName) : undefined
        if (!module?.outputConfig || module.outputConfig.type !== 'listParam') {
          return nds
        }

        const listParamName = module.outputConfig.listParamName
        const currentArray = Array.isArray(branchingNode.data?.params?.[listParamName])
          ? [...branchingNode.data.params[listParamName]]
          : []

        // Add new empty value to array
        const listParam = module.params.find((p) => p.name === listParamName)
        const newValue = getDefaultValueForType(listParam?.type)

        const updatedArray = [...currentArray, newValue]

        // Update the branching node's params
        const updatedNodes = nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                params: {
                  ...node.data.params,
                  [listParamName]: updatedArray,
                },
              },
            }
          }
          return node
        })

        // Get existing output nodes
        const existingOutputNodes = updatedNodes.filter((n) => {
          const nType = n.data?.nodeType as NodeType | undefined
          return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === nodeId
        })

        const layoutConstants = getBranchingLayoutConstants()
        const newIndex = existingOutputNodes.length
        const branchingPos = branchingNode.position || { x: 0, y: 0 }
        const newOutputCount = newIndex + 1

        // Get the value from the array (should be the last element we just added)
        const outputValue = updatedArray[newIndex]

        // Get the output node type from branching node config
        const branchingNodeType = branchingNode.data?.nodeType as NodeType | undefined
        const branchingConfig = branchingNodeType ? nodeConfigs[branchingNodeType] : undefined
        const outputNodeType = branchingConfig?.outputNodeType

        if (!outputNodeType) {
          console.error(`Branching node ${branchingNodeType} does not specify outputNodeType`)
          return updatedNodes
        }

        const outputNode = createNodeFromConfig(
          outputNodeType,
          calculateOutputNodePosition(branchingPos, newIndex, layoutConstants),
          {
            moduleName: branchingNode.data?.moduleName,
            parentNodeId: nodeId,
            connectingFrom: null,
            params: { value: outputValue },
            outputIndex: newIndex, // Store index for reference
          }
        )
        // Set label - use value if available, otherwise "_"
        outputNode.data.label =
          outputValue !== null && outputValue !== undefined && outputValue !== '' ? String(outputValue) : '_'

        // Set z-index to appear on top - find highest z-index among all nodes
        const maxZIndex = updatedNodes.reduce((max, n) => {
          const z = typeof n.zIndex === 'number' ? n.zIndex : 0
          return Math.max(max, z)
        }, highestZIndexRef.current)
        const newZIndex = maxZIndex + 1
        highestZIndexRef.current = newZIndex
        outputNode.zIndex = newZIndex

        // Add the new output node
        const nodesWithNewOutput = updatedNodes.concat(outputNode)

        // Update branching node height using helper function
        const updatedWithHeight = updateBranchingNodeHeight(nodesWithNewOutput, nodeId, layoutConstants)

        // Also update outputCount in data
        return updatedWithHeight.map((node) =>
          node.id === nodeId
            ? {
              ...node,
              data: { ...node.data, outputCount: newOutputCount },
            }
            : node
        )
      })
    },
    [setNodes, saveHistoryBeforeChange, isLocked, highestZIndexRef]
  )

  return {
    onNodeDrag,
    onNodeDragStop,
    handleAddOutput,
  }
}
