import { useCallback } from 'react'
import type { Node } from 'reactflow'
import type { ReactFlowInstance } from 'reactflow'
import modules from '../modules'
import nodeConfigs, { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, canOutputNodeBeDeleted } from '../nodeConfigs'
import { getNodeLabel } from '../utils/nodeUtils'
import { getBranchingLayoutConstants, calculateOutputNodePosition, repositionOutputNodes } from '../utils/branchingNodeHelpers'
import { createNodeFromConfig } from '../utils/nodeCreation'
import { getId } from '../utils/nodeUtils'
import { isStartModule } from '../utils/moduleHelpers'
import type { MenuState, MenuActions } from './useMenuState'

export interface NodeManipulation {
  handleNodeDataUpdate: (nodeId: string, updatedData: any) => void
  handleDeleteNode: (nodeId: string) => void
  handleDuplicateNodes: () => void
}

export function useNodeManipulation(
  nodes: Node[],
  edges: any[],
  setNodes: (updater: (nodes: Node[]) => Node[]) => void,
  setEdges: (updater: (edges: any[]) => any[]) => void,
  reactFlowInstance: ReactFlowInstance | null,
  viewportState: { setViewport: (viewport: { x: number; y: number; zoom: number }) => void },
  saveHistoryBeforeChange: (changeType?: 'param' | 'other') => void,
  isLocked: boolean,
  menuState: MenuState & MenuActions,
  highestZIndexRef: React.MutableRefObject<number>
): NodeManipulation {
  const handleNodeDataUpdate = useCallback(
    (nodeId: string, updatedData: any) => {
      // Don't save history for param changes - only node add/remove and connections are in history
      // Also preserve viewport position to prevent view from jumping
      const currentViewport = reactFlowInstance?.getViewport()

      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId)
        if (!node) return nds

        const nodeType = node.data?.nodeType as NodeType | undefined
        const isOutputNode = nodeType && isBranchingOutputNodeType(nodeType)
        const parentNodeId = node.data?.parentNodeId

        // If this is an output node and the value is being updated, also update parent's listParam array
        if (isOutputNode && parentNodeId && updatedData.params?.value !== undefined) {
          const parentNode = nds.find((n) => n.id === parentNodeId)
          if (parentNode) {
            const module = parentNode.data?.moduleName ? modules.find((m) => m.name === parentNode.data.moduleName) : undefined
            if (module?.outputConfig?.type === 'listParam') {
              const listParamName = module.outputConfig.listParamName
              const outputIndex = typeof node.data?.outputIndex === 'number' ? node.data.outputIndex : 0
              const currentArray = Array.isArray(parentNode.data?.params?.[listParamName])
                ? [...parentNode.data.params[listParamName]]
                : []

              // Ensure array is long enough
              while (currentArray.length <= outputIndex) {
                currentArray.push('')
              }

              // Update the value at the output index
              currentArray[outputIndex] = updatedData.params.value

              // Update parent node's params
              return nds.map((n) => {
                if (n.id === parentNodeId) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      params: {
                        ...n.data.params,
                        [listParamName]: currentArray,
                      },
                    },
                  }
                }
                if (n.id === nodeId) {
                  const updatedNode = {
                    ...n,
                    data: {
                      ...n.data,
                      ...updatedData,
                    },
                  }

                  // Recalculate label if module info is available
                  if (updatedNode.data.moduleName) {
                    const module = modules.find((m) => m.name === updatedNode.data.moduleName)
                    const nodeType = updatedNode.data?.nodeType as NodeType | undefined
                    updatedNode.data.label = getNodeLabel(module, updatedNode.data, nodeType)
                  }

                  return updatedNode
                }
                return n
              })
            }
          }
        }

        // Regular update for non-output nodes or non-value updates
        return nds.map((node) => {
          if (node.id === nodeId) {
            const updatedNode = {
              ...node,
              data: {
                ...node.data,
                ...updatedData,
              },
            }

            // Recalculate label if module info is available
            if (updatedNode.data.moduleName) {
              const module = modules.find((m) => m.name === updatedNode.data.moduleName)
              const nodeType = updatedNode.data?.nodeType as NodeType | undefined
              updatedNode.data.label = getNodeLabel(module, updatedNode.data, nodeType)
            }

            return updatedNode
          }
          return node
        })
      })

      // Restore viewport position after update to prevent view from jumping
      if (currentViewport && reactFlowInstance) {
        requestAnimationFrame(() => {
          viewportState.setViewport(currentViewport)
        })
      }
    },
    [setNodes, reactFlowInstance, viewportState]
  )

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (isLocked) return

      // Check if this is an output node that shouldn't be deleted
      const nodeToDelete = nodes.find((n) => n.id === nodeId)
      const nodeType = nodeToDelete?.data?.nodeType as NodeType | undefined
      const moduleName = nodeToDelete?.data?.moduleName

      // Prevent deletion of start node
      if (isStartModule(moduleName)) {
        return
      }

      // Prevent deletion of non-deletable output nodes (using config)
      if (nodeType && isBranchingOutputNodeType(nodeType)) {
        if (!canOutputNodeBeDeleted(nodeType)) {
          return // Don't delete non-deletable output nodes
        }
      }

      // Collect all edges that will be deleted BEFORE deletion (for atomic operation)
      const edgesToDelete = new Set<string>()

      // If it's a branching node, collect edges connected to its output nodes
      if (nodeType && isBranchingNodeType(nodeType)) {
        const outputNodeIds = nodes
          .filter((n) => {
            const nType = n.data?.nodeType as NodeType | undefined
            return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === nodeId
          })
          .map((n) => n.id)

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useNodeManipulation.ts:handleDeleteNode', message: 'Deleting branching node - collecting edges', data: { nodeId, nodeType, outputNodeIds, outputNodeCount: outputNodeIds.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'branching-debug', hypothesisId: 'H2' }) }).catch(() => { });
        // #endregion

        // Collect edges connected to output nodes
        edges.forEach((edge) => {
          if (outputNodeIds.includes(edge.source) || outputNodeIds.includes(edge.target)) {
            edgesToDelete.add(edge.id)
          }
        })
      }

      // Collect edges connected to the node itself
      edges.forEach((edge) => {
        if (edge.source === nodeId || edge.target === nodeId) {
          edgesToDelete.add(edge.id)
        }
      })

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'useNodeManipulation.ts:handleDeleteNode', message: 'Edges to delete collected', data: { nodeId, edgesToDeleteCount: edgesToDelete.size, edgesToDeleteIds: Array.from(edgesToDelete) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'branching-debug', hypothesisId: 'H2' }) }).catch(() => { });
      // #endregion

      // NOTE: History is now saved in handleNodesChange when 'remove' change is detected
      // This ensures history is saved BEFORE the deletion is processed
      // No need to save here as it would be redundant and could cause timing issues

      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId)
        if (!node) return nds

        // If it's an output node, handle parent branching node updates
        const nodeType = node.data?.nodeType as NodeType | undefined
        if (nodeType && isBranchingOutputNodeType(nodeType) && node.data?.parentNodeId) {
          const parentId = node.data.parentNodeId
          const branchingNode = nds.find((n) => n.id === parentId)
          if (!branchingNode) return nds.filter((n) => n.id !== nodeId)

          const module = branchingNode.data?.moduleName ? modules.find((m) => m.name === branchingNode.data.moduleName) : undefined
          if (!module?.outputConfig || module.outputConfig.type !== 'listParam') {
            // For non-listParam branching nodes, just remove the output node
            return nds.filter((n) => n.id !== nodeId)
          }

          // Remove the deleted output node
          let updatedNodes = nds.filter((n) => n.id !== nodeId)

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

          const deletedIndex = typeof node.data?.outputIndex === 'number' ? node.data.outputIndex : -1
          const updatedArray = [...currentArray]
          if (deletedIndex >= 0 && deletedIndex < updatedArray.length) {
            updatedArray.splice(deletedIndex, 1)
          }

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

          // Update branching node params and outputCount
          const layoutConstants = getBranchingLayoutConstants()
          const newOutputCount = remainingOutputNodes.length

          const branchingIndex = updatedNodes.findIndex((n) => n.id === parentId)
          if (branchingIndex >= 0) {
            updatedNodes[branchingIndex] = {
              ...updatedNodes[branchingIndex],
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

          // Reposition remaining output nodes and update branching node height
          // repositionOutputNodes now automatically updates height
          updatedNodes = repositionOutputNodes(updatedNodes, parentId, layoutConstants)

          return updatedNodes
        }

        // If it's a branching node, also remove its output nodes
        if (nodeType && isBranchingNodeType(nodeType)) {
          const outputNodeIds = nds
            .filter((n) => {
              const nType = n.data?.nodeType as NodeType | undefined
              return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === nodeId
            })
            .map((n) => n.id)

          // Remove output nodes and the branching node
          return nds.filter((n) => n.id !== nodeId && !outputNodeIds.includes(n.id))
        }

        // For other nodes, just remove the node
        return nds.filter((n) => n.id !== nodeId)
      })

      // Remove all collected edges atomically (already collected above)
      setEdges((eds) => eds.filter((e) => !edgesToDelete.has(e.id)))

      // Close menu if the deleted node's menu was open
      if (menuState.openMenuNodeId === nodeId) {
        menuState.setOpenMenuNodeId(null)
        menuState.setMenuPosition(null)
      }
    },
    [isLocked, saveHistoryBeforeChange, setNodes, setEdges, menuState, nodes, edges]
  )

  const handleDuplicateNodes = useCallback(() => {
    if (isLocked) return

    saveHistoryBeforeChange()

    setNodes((nds) => {
      // Helper function to check if a node can be duplicated
      const canNodeBeDuplicated = (node: Node): boolean => {
        const moduleName = node.data?.moduleName
        if (!moduleName) return true // Default to true if no module name

        const module = modules.find((m) => m.name === moduleName)
        if (!module) return true // Default to true if module not found

        // Check if module explicitly disallows duplication
        if (module.canDuplicate === false) return false

        // For output nodes, check if parent is an internal branching node
        if (node.data?.parentNodeId) {
          const parentNode = nds.find((n) => n.id === node.data.parentNodeId)
          if (parentNode) {
            const parentModuleName = parentNode.data?.moduleName
            if (parentModuleName) {
              const parentModule = modules.find((m) => m.name === parentModuleName)
              if (parentModule) {
                // If parent has internal outputConfig or canDuplicate is false, don't duplicate output
                if (parentModule.canDuplicate === false || parentModule.outputConfig?.type === 'internal') {
                  return false
                }
              }
            }
          }
        }

        return true
      }

      // Get all selected nodes and filter out those that can't be duplicated
      const selectedNodes = nds.filter((n) => n.selected && canNodeBeDuplicated(n))
      if (selectedNodes.length === 0) return nds

      // Check if any selected node is an output node from a listParam branching node
      // If so, handle it specially by adding it to the parent instead of duplicating separately
      const outputNodeFromListParam = selectedNodes.find((node) => {
        if (!node.data?.parentNodeId) return false
        const nodeType = node.data?.nodeType as NodeType | undefined
        if (!nodeType || !isBranchingOutputNodeType(nodeType)) return false

        const parentNode = nds.find((n) => n.id === node.data.parentNodeId)
        if (!parentNode) return false

        const parentModuleName = parentNode.data?.moduleName
        if (!parentModuleName) return false

        const parentModule = modules.find((m) => m.name === parentModuleName)
        if (!parentModule || parentModule.outputConfig?.type !== 'listParam') return false
        // Check if the module has duplicateOutputAddsToParent enabled (default: true)
        return parentModule.duplicateOutputAddsToParent !== false
      })

      // Special handling for output nodes from listParam branching nodes
      if (outputNodeFromListParam && selectedNodes.length === 1) {
        const outputNode = outputNodeFromListParam
        const parentNode = nds.find((n) => n.id === outputNode.data?.parentNodeId)
        if (!parentNode) return nds

        const module = parentNode.data?.moduleName ? modules.find((m) => m.name === parentNode.data.moduleName) : undefined
        if (!module?.outputConfig || module.outputConfig.type !== 'listParam') return nds

        const listParamName = module.outputConfig.listParamName
        const currentArray = Array.isArray(parentNode.data?.params?.[listParamName])
          ? [...parentNode.data.params[listParamName]]
          : []

        // Get the value from the output node being duplicated
        const duplicatedValue = outputNode.data?.params?.value ?? ''

        // Add new value to array (duplicate the value)
        const updatedArray = [...currentArray, duplicatedValue]

        // Update the branching node's params
        let updatedNodes = nds.map((node) => {
          if (node.id === parentNode.id) {
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
          return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === parentNode.id
        })

        const layoutConstants = getBranchingLayoutConstants()
        const newIndex = existingOutputNodes.length
        const branchingPos = parentNode.position || { x: 0, y: 0 }

        // Get the output node type from branching node config
        const branchingNodeType = parentNode.data?.nodeType as NodeType | undefined
        const branchingConfig = branchingNodeType ? nodeConfigs[branchingNodeType] : undefined
        const outputNodeType = branchingConfig?.outputNodeType

        if (!outputNodeType) {
          console.error(`Branching node ${branchingNodeType} does not specify outputNodeType`)
          return nds
        }

        // Create new output node
        const newOutputNode = createNodeFromConfig(
          outputNodeType,
          calculateOutputNodePosition(branchingPos, newIndex, layoutConstants),
          {
            moduleName: parentNode.data?.moduleName,
            parentNodeId: parentNode.id,
            connectingFrom: null,
            params: { value: duplicatedValue },
            outputIndex: newIndex,
          }
        )
        // Set label - use value if available, otherwise "_"
        newOutputNode.data.label =
          duplicatedValue !== null && duplicatedValue !== undefined && duplicatedValue !== '' ? String(duplicatedValue) : '_'

        // Add the new output node first, then reposition (so repositionOutputNodes sees all nodes)
        updatedNodes = updatedNodes.concat(newOutputNode)

        // Reposition all output nodes to ensure correct order and update height
        updatedNodes = repositionOutputNodes(updatedNodes, parentNode.id, layoutConstants)

        // Deselect all nodes and select the new output node
        updatedNodes = updatedNodes.map((node) => ({
          ...node,
          selected: node.id === newOutputNode.id,
        }))

        return updatedNodes
      }

      // Regular duplication logic for other nodes
      // For branching nodes, also include their output nodes
      const nodesToDuplicate: Node[] = []
      const processedIds = new Set<string>()

      selectedNodes.forEach((node) => {
        if (processedIds.has(node.id)) return
        processedIds.add(node.id)

        const nodeType = node.data?.nodeType as NodeType | undefined
        if (nodeType && isBranchingNodeType(nodeType)) {
          // Add branching node
          nodesToDuplicate.push(node)
          // Add all output nodes for this branching node (only if they can be duplicated)
          const outputNodes = nds.filter((n) => {
            const nType = n.data?.nodeType as NodeType | undefined
            return (
              nType &&
              isBranchingOutputNodeType(nType) &&
              n.data?.parentNodeId === node.id &&
              canNodeBeDuplicated(n)
            )
          })
          outputNodes.forEach((outputNode) => {
            if (!processedIds.has(outputNode.id)) {
              nodesToDuplicate.push(outputNode)
              processedIds.add(outputNode.id)
            }
          })
        } else {
          // Regular node - check if it's an output node that's already handled
          if (node.data?.parentNodeId && processedIds.has(node.data.parentNodeId)) {
            return // Skip - parent is being duplicated
          }
          nodesToDuplicate.push(node)
        }
      })

      if (nodesToDuplicate.length === 0) return nds

      // Calculate offset (to the right and down) - same as overlap offset when adding nodes
      const offsetX = 30
      const offsetY = 30

      // Create ID mapping for duplicated nodes
      const idMap = new Map<string, string>()
      nodesToDuplicate.forEach((node) => {
        idMap.set(node.id, getId(node.data?.moduleName, node.data?.nodeType as string))
      })

      // Create duplicated nodes
      const duplicatedNodes: Node[] = nodesToDuplicate.map((node) => {
        const newNodeId = idMap.get(node.id)!

        // Update parentNodeId if this is an output node
        const newParentNodeId = node.data?.parentNodeId
          ? idMap.get(node.data.parentNodeId) || node.data.parentNodeId
          : undefined

        return {
          ...node,
          id: newNodeId,
          position: {
            x: node.position.x + offsetX,
            y: node.position.y + offsetY,
          },
          selected: true, // Select the duplicated nodes
          data: {
            ...node.data,
            ...(newParentNodeId && { parentNodeId: newParentNodeId }),
          },
        }
      })

      // Calculate max z-index for new nodes
      const maxZIndex = nds.reduce((max, n) => {
        const z = typeof n.zIndex === 'number' ? n.zIndex : 0
        return Math.max(max, z)
      }, highestZIndexRef.current)
      const baseZIndex = maxZIndex + 1

      // Apply z-index to duplicated nodes and ensure selected is always boolean
      const duplicatedNodesWithZIndex = duplicatedNodes.map((node, idx) => ({
        ...node,
        zIndex: baseZIndex + idx,
        selected: node.selected ?? false,
      }))

      // Deselect all existing nodes
      const clearedNodes = nds.map((node) => ({ ...node, selected: false }))

      // Update highest z-index ref
      highestZIndexRef.current = baseZIndex + duplicatedNodes.length

      return clearedNodes.concat(duplicatedNodesWithZIndex)
    })
  }, [isLocked, saveHistoryBeforeChange, setNodes, highestZIndexRef])

  return {
    handleNodeDataUpdate,
    handleDeleteNode,
    handleDuplicateNodes,
  }
}
