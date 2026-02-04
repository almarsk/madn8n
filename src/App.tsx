import { useCallback, useRef, useState, useEffect } from 'react'
import { ReactFlowInstance, useEdgesState, useNodesState, type Node } from 'reactflow'
import './App.css'
import modules from './modules'
import nodeConfigs, { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES, canOutputNodeBeDeleted } from './nodeConfigs'
import { useHistory } from './hooks/useHistory'
import { createNodeFromConfig, createBranchingNodeWithOutputs } from './utils/nodeCreation'
import { getNodeLabel } from './utils/nodeUtils'
import { useValidation } from './hooks/useValidation'
import { getBranchingLayoutConstants, calculateOutputNodePosition, repositionOutputNodes } from './utils/branchingNodeHelpers'
import { exportFlowToJson } from './utils/exportHelpers'
import { getDefaultValueForParamType } from './utils/branchingNodeOperations'

import Toolbar from './components/Toolbar'
import FlowCanvas from './components/FlowCanvas'
import Minimap from './Minimap'
import NodePopupMenu from './components/NodePopupMenu'
import ValidationBanner from './components/ValidationBanner'
import { useConnectionHandlers } from './hooks/useConnectionHandlers'

const initialNodes: Node[] = []
const initialEdges: any[] = []

function App() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [isFlowConfigMenuOpen, setIsFlowConfigMenuOpen] = useState(false)
  const [flowConfigMenuPosition, setFlowConfigMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [flowMetadata, setFlowMetadata] = useState({
    description: '',
    userInitialTimeout: 0,
    voice: 'Voice 1',
  })
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [validationStatus, setValidationStatus] = useState<{ isValid: boolean | null; message: string }>({
    isValid: null,
    message: '',
  })

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const history = useHistory()

  // Use refs to always get current state for history (avoid stale closures)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const openMenuNodeIdRef = useRef(openMenuNodeId)
  const menuPositionRef = useRef(menuPosition)

  // Keep refs in sync with state
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])
  useEffect(() => {
    openMenuNodeIdRef.current = openMenuNodeId
  }, [openMenuNodeId])
  useEffect(() => {
    menuPositionRef.current = menuPosition
  }, [menuPosition])

  const { isValidConnection, onConnectStart, onConnectEnd, onConnect: onConnectOriginal } = useConnectionHandlers({
    edges,
    setEdges,
    setNodes,
  })

  // Helper to save history before state changes - uses refs to get current state
  const saveHistoryBeforeChange = useCallback((changeType: 'param' | 'other' = 'other') => {
    // Don't save history during undo/redo operations
    if (isRestoringStateRef.current) {
      return
    }
    if (!isLocked) {
      history.saveState(
        nodesRef.current,
        edgesRef.current,
        openMenuNodeIdRef.current,
        changeType,
        menuPositionRef.current
      )
    }
  }, [history, isLocked])

  // Wrap onConnect to save history before adding edge
  const onConnect = useCallback(
    (params: any) => {
      if (!isLocked) {
        saveHistoryBeforeChange()
      }
      onConnectOriginal(params)
    },
    [onConnectOriginal, saveHistoryBeforeChange, isLocked]
  )

  // Debounce timer for position changes
  const positionChangeTimerRef = useRef<number | null>(null)

  // Save history for position changes (debounced)
  const saveHistoryForPositionChange = useCallback(() => {
    // Don't save history during undo/redo operations
    if (isRestoringStateRef.current) {
      return
    }
    if (positionChangeTimerRef.current) {
      clearTimeout(positionChangeTimerRef.current)
    }
    positionChangeTimerRef.current = window.setTimeout(() => {
      // Check again in case we're restoring during the timeout
      if (!isLocked && !isRestoringStateRef.current) {
        // Save current state after position change (debounced)
        history.saveState(nodes, edges, openMenuNodeId, 'other', menuPosition)
      }
    }, 300) // 300ms debounce
  }, [nodes, edges, history, isLocked, openMenuNodeId])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      if (!reactFlowWrapper.current || !reactFlowInstance) {
        return
      }

      const type = event.dataTransfer.getData('application/reactflow')
      if (!type) {
        return
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const module = modules.find((m) => m.name === type)
      if (!module) {
        return
      }

      // Get node config based on module type
      const nodeConfig = nodeConfigs[module.type]
      if (!nodeConfig) {
        console.warn(`No node config found for module type: ${module.type}`)
        return
      }

      // Save history before adding nodes
      saveHistoryBeforeChange()

      // Create node(s) based on config type
      if (isBranchingNodeType(module.type)) {
        const branchingConfig = nodeConfigs[module.type]
        // For internal type, use the fixed output count from module config
        // For listParam type, use default from nodeConfig
        let outputCount = branchingConfig?.defaultOutputCount ?? 1
        if (module.outputConfig?.type === 'internal') {
          outputCount = module.outputConfig.outputCount
        }
        const nodesToAdd = createBranchingNodeWithOutputs(position, outputCount, module.name, module.type as NodeType)
        // Add all nodes at once (parent + outputs) - this is one operation
        setNodes((nds) => nds.concat(nodesToAdd))
      } else {
        // Single node (or any other non-branching type)
        const newNode = createNodeFromConfig(module.type as NodeType, position, {
          moduleName: module.name,
          connectingFrom: null,
        })
        setNodes((nds) => nds.concat(newNode))
      }

      // Close menu when adding a new node
      setOpenMenuNodeId(null)
      setMenuPosition(null)
    },
    [reactFlowInstance, setNodes, saveHistoryBeforeChange, isLocked, setOpenMenuNodeId, setMenuPosition]
  )

  const onNodeDragStart = (type: string) => (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onSidebarNodeClick = useCallback(
    (moduleName: string) => {
      if (!reactFlowInstance) {
        return
      }

      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!bounds) {
        return
      }

      const centerX = bounds.width / 2
      const centerY = bounds.height / 2

      let position = reactFlowInstance.screenToFlowPosition({
        x: centerX,
        y: centerY,
      })

      // Check if there's already a node at this position and offset if needed
      const singleConfig = nodeConfigs.single
      const nodeWidth = singleConfig?.defaultWidth || 150
      const nodeHeight = singleConfig?.defaultHeight || 80
      const offsetX = 30
      const offsetY = 30

      setNodes((nds) => {
        // Check for overlapping nodes
        let finalPosition = { ...position }
        let attempts = 0
        const maxAttempts = 10

        while (attempts < maxAttempts) {
          const hasFullOverlap = nds.some((node) => {
            const nodePos = node.position
            const nodeStyle = node.style || {}
            const existingWidth = typeof nodeStyle.width === 'number' ? nodeStyle.width : nodeWidth
            const existingHeight = typeof nodeStyle.height === 'number' ? nodeStyle.height : nodeHeight

            // Calculate overlap area
            const overlapLeft = Math.max(nodePos.x, finalPosition.x)
            const overlapRight = Math.min(nodePos.x + existingWidth, finalPosition.x + nodeWidth)
            const overlapTop = Math.max(nodePos.y, finalPosition.y)
            const overlapBottom = Math.min(nodePos.y + existingHeight, finalPosition.y + nodeHeight)

            // If there's no overlap, continue
            if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) {
              return false
            }

            // Calculate overlap area
            const overlapWidth = overlapRight - overlapLeft
            const overlapHeight = overlapBottom - overlapTop
            const overlapArea = overlapWidth * overlapHeight

            // Calculate areas of both nodes
            const existingArea = existingWidth * existingHeight
            const newArea = nodeWidth * nodeHeight
            const smallerArea = Math.min(existingArea, newArea)

            // Check if overlap is too large (more than 80% of the smaller node)
            // This allows partial overlap but prevents nodes from being fully on top of each other
            const overlapRatio = overlapArea / smallerArea
            return overlapRatio > 0.8
          })

          if (!hasFullOverlap) {
            break
          }

          // Offset to the right and down
          finalPosition = {
            x: finalPosition.x + offsetX,
            y: finalPosition.y + offsetY,
          }
          attempts++
        }

        const module = modules.find((m) => m.name === moduleName)
        if (!module) {
          return nds
        }

        // Get node config based on module type
        const nodeConfig = nodeConfigs[module.type]
        if (!nodeConfig) {
          console.warn(`No node config found for module type: ${module.type}`)
          return nds
        }

        // Save history before adding nodes
        if (!isLocked) {
          saveHistoryBeforeChange()
        }

        // Create node(s) based on config type
        if (isBranchingNodeType(module.type)) {
          const branchingConfig = nodeConfigs.branching
          // For internal type, use the fixed output count from module config
          // For listParam type, use default from nodeConfig
          let outputCount = branchingConfig?.defaultOutputCount ?? 1
          if (module.outputConfig?.type === 'internal') {
            outputCount = module.outputConfig.outputCount
          }
          const nodes = createBranchingNodeWithOutputs(finalPosition, outputCount, module.name, module.type as NodeType)
          return nds.concat(nodes)
        } else {
          // Single node (or any other non-branching type)
          const newNode = createNodeFromConfig(module.type as NodeType, finalPosition, {
            moduleName: module.name,
            connectingFrom: null,
          })
          return nds.concat(newNode)
        }

        // Return unchanged if no module found
        return nds
      })

      // Close menu when adding a new node
      setOpenMenuNodeId(null)
      setMenuPosition(null)
    },
    [reactFlowInstance, setNodes, modules, saveHistoryBeforeChange, isLocked, setOpenMenuNodeId, setMenuPosition]
  )

  const handleZoomIn = () => {
    reactFlowInstance?.zoomIn?.()
  }

  const handleZoomOut = () => {
    reactFlowInstance?.zoomOut?.()
  }

  const handleFitView = () => {
    reactFlowInstance?.fitView?.({ padding: 0.2 })
  }

  const onMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
      setViewport(viewport)
    },
    []
  )

  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      setReactFlowInstance(instance)
      const viewport = instance.getViewport()
      setViewport(viewport)

      // Only fit view on initial load if there are no nodes yet
      if (nodes.length === 0) {
        // Small delay to ensure ReactFlow is fully initialized
        setTimeout(() => {
          instance.fitView({ padding: 0.2, duration: 0 })
        }, 100)
      }
    },
    [nodes.length]
  )

  // Wrap onEdgesChange to maintain compatibility and save history
  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      // Save history for non-select changes
      const hasNonSelectChanges = changes.some((change) => change.type !== 'select')
      if (hasNonSelectChanges && !isLocked) {
        saveHistoryBeforeChange()
      }
      onEdgesChange(changes)
    },
    [onEdgesChange, saveHistoryBeforeChange, isLocked]
  )

  // Wrap onNodesChange to clean up output nodes when branching node is deleted
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      // Filter out deletions of non-deletable output nodes before processing
      const filteredChanges = changes.filter((change) => {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          // Prevent deletion of output nodes that cannot be deleted (using config)
          if (nodeType && isBranchingOutputNodeType(nodeType)) {
            if (!canOutputNodeBeDeleted(nodeType)) {
              return false // Filter out deletion of non-deletable output nodes
            }
          }
        }
        return true
      })

      // Close menu when a different node starts being dragged (but not the node whose menu is open)
      const dragStartChanges = filteredChanges.filter((change) => change.type === 'position' && change.position)
      if (dragStartChanges.length > 0) {
        // Close flow config menu when any node starts being dragged
        if (isFlowConfigMenuOpen) {
          setIsFlowConfigMenuOpen(false)
          setFlowConfigMenuPosition(null)
        }
        // Close node menu if a different node is being dragged
        if (openMenuNodeId) {
          const draggedNodeId = dragStartChanges[0].id
          // Only close if a different node is being dragged
          if (draggedNodeId !== openMenuNodeId) {
            setOpenMenuNodeId(null)
            setMenuPosition(null)
          }
        }
      }

      // Save history BEFORE processing changes (so we capture the state before deletion)
      // But only if there are actual changes after filtering
      const hasPositionChanges = filteredChanges.some((change) => change.type === 'position')
      const hasNonPositionChanges = filteredChanges.some((change) => change.type !== 'position' && change.type !== 'select')

      if (!isRestoringStateRef.current) {
        if (hasNonPositionChanges && !isLocked) {
          saveHistoryBeforeChange()
        } else if (hasPositionChanges && !hasNonPositionChanges && !isLocked) {
          saveHistoryForPositionChange()
        }
      }

      // Check if any branching nodes are being removed or moved
      const removedBranchingNodeIds = new Set<string>()
      const movedBranchingNodeIds = new Set<string>()
      const selectedOutputNodeIds = new Set<string>()

      filteredChanges.forEach((change) => {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingNodeType(nodeType)) {
            removedBranchingNodeIds.add(change.id)
          }
        } else if (change.type === 'position' && change.position) {
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingNodeType(nodeType)) {
            movedBranchingNodeIds.add(change.id)
          }
        } else if (change.type === 'select' && change.selected) {
          // Track when output nodes are selected
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingOutputNodeType(nodeType)) {
            selectedOutputNodeIds.add(change.id)
          }

          // Don't automatically open menus on node selection
          // Menus should only open via the menu icon (three dots) click
        }
      })

      // If an output node is being selected, deselect its parent branching node
      if (selectedOutputNodeIds.size > 0) {
        const parentNodeIds = new Set<string>()
        nodes.forEach((node) => {
          if (selectedOutputNodeIds.has(node.id) && node.data?.parentNodeId) {
            parentNodeIds.add(node.data.parentNodeId)
          }
        })

        if (parentNodeIds.size > 0) {
          // Add deselection changes for parent nodes
          parentNodeIds.forEach((parentId) => {
            changes.push({
              id: parentId,
              type: 'select',
              selected: false,
            })
          })
        }
      }

      // Handle output node removal - adjust branching node size and update params
      const removedOutputNodeIds = new Set<string>()
      const parentNodeIdsToUpdate = new Set<string>()

      filteredChanges.forEach((change) => {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingOutputNodeType(nodeType) && node?.data?.parentNodeId) {
            // Double-check: prevent deletion of non-deletable output nodes (using config)
            if (!canOutputNodeBeDeleted(nodeType)) {
              // This should have been filtered out earlier, but add extra safety
              return
            }

            removedOutputNodeIds.add(change.id)
            const parentId = node.data.parentNodeId
            parentNodeIdsToUpdate.add(parentId)

            // Remove parent from deletion if it's also being deleted
            const parentRemoveIndex = filteredChanges.findIndex(
              (c) => c.type === 'remove' && c.id === parentId
            )
            if (parentRemoveIndex !== -1) {
              filteredChanges.splice(parentRemoveIndex, 1)
            }
          }
        }
      })

      // Update branching nodes when output nodes are removed
      if (removedOutputNodeIds.size > 0 && parentNodeIdsToUpdate.size > 0) {
        // First, remove the deleted output nodes
        setNodes((nds) => {
          let updatedNodes = nds.filter((n) => !removedOutputNodeIds.has(n.id))

          parentNodeIdsToUpdate.forEach((parentId) => {
            const branchingNode = updatedNodes.find((n) => n.id === parentId)
            if (!branchingNode) return

            const module = branchingNode.data?.moduleName ? modules.find((m) => m.name === branchingNode.data.moduleName) : undefined
            if (!module?.outputConfig || module.outputConfig.type !== 'listParam') return

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

            // Get deleted nodes from original nodes array to find their indices
            const deletedOutputNodes = nds.filter((n) => removedOutputNodeIds.has(n.id) && n.data.parentNodeId === parentId)
            const deletedIndices = deletedOutputNodes
              .map((n) => n.data?.outputIndex)
              .filter((idx): idx is number => typeof idx === 'number')
              .sort((a, b) => b - a) // Sort descending to remove from end first

            let updatedArray = [...currentArray]
            deletedIndices.forEach((idx) => {
              if (idx >= 0 && idx < updatedArray.length) {
                updatedArray.splice(idx, 1)
              }
            })

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

            // Recalculate branching node size
            const layoutConstants = getBranchingLayoutConstants()
            const { outputNodeWidth, padding, headerHeight, outputSpacing, outputNodeHeight } = layoutConstants
            const newOutputCount = remainingOutputNodes.length
            const branchingNodeWidth = outputNodeWidth + padding * 2
            const branchingNodeHeight = headerHeight + outputSpacing + (newOutputCount * outputNodeHeight) + ((newOutputCount - 1) * outputSpacing) + padding

            // Update branching node
            const branchingIndex = updatedNodes.findIndex((n) => n.id === parentId)
            if (branchingIndex >= 0) {
              updatedNodes[branchingIndex] = {
                ...updatedNodes[branchingIndex],
                style: {
                  ...updatedNodes[branchingIndex].style,
                  width: branchingNodeWidth,
                  height: branchingNodeHeight,
                },
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

            // Reposition remaining output nodes - this will use the updated outputIndex values
            updatedNodes = repositionOutputNodes(updatedNodes, parentId, layoutConstants)
          })

          return updatedNodes
        })

        // Remove edges connected to deleted output nodes
        setEdges((eds) => eds.filter((e) => !removedOutputNodeIds.has(e.source) && !removedOutputNodeIds.has(e.target)))
      }

      // If branching nodes are being removed, also remove their output nodes
      if (removedBranchingNodeIds.size > 0) {
        setNodes((nds) => {
          const outputNodesToRemove = nds.filter((n) => {
            const nodeType = n.data?.nodeType as NodeType | undefined
            return nodeType && isBranchingOutputNodeType(nodeType) && n.data.parentNodeId && removedBranchingNodeIds.has(n.data.parentNodeId)
          })
          const outputNodeIdsToRemove = new Set(outputNodesToRemove.map((n) => n.id))

          // Also remove edges connected to these output nodes
          setEdges((eds) => eds.filter((e) => !outputNodeIdsToRemove.has(e.source) && !outputNodeIdsToRemove.has(e.target)))

          return nds.filter((n) => !outputNodeIdsToRemove.has(n.id))
        })
      }

      // If branching nodes are being moved, update their output node positions
      if (movedBranchingNodeIds.size > 0) {
        setNodes((nds) => {
          let updatedNodes = nds
          movedBranchingNodeIds.forEach((branchingNodeId) => {
            updatedNodes = repositionOutputNodes(updatedNodes, branchingNodeId)
          })
          return updatedNodes
        })
      }

      onNodesChange(filteredChanges)
    },
    [nodes, onNodesChange, setNodes, setEdges, saveHistoryBeforeChange, saveHistoryForPositionChange, isLocked, isFlowConfigMenuOpen, openMenuNodeId]
  )

  const handleLabelClick = useCallback((nodeId: string) => {
    // Close any existing menu first to ensure clean state transition
    // This prevents the justOpenedRef from blocking the new menu
    if (openMenuNodeId && openMenuNodeId !== nodeId) {
      setOpenMenuNodeId(null)
      setMenuPosition(null)
    }
    // Close flow config menu if open
    if (isFlowConfigMenuOpen) {
      setIsFlowConfigMenuOpen(false)
      setFlowConfigMenuPosition(null)
    }

    // If clicking on an output node menu icon, ensure the output node is selected (not the parent)
    const clickedNode = nodes.find((n) => n.id === nodeId)
    if (clickedNode?.data?.nodeType && isBranchingOutputNodeType(clickedNode.data.nodeType as NodeType)) {
      // Select the output node explicitly and deselect parent and all other nodes
      setNodes((nds) => {
        const updated = nds.map((n) => {
          // Deselect parent if it exists
          if (clickedNode.data?.parentNodeId && n.id === clickedNode.data.parentNodeId) {
            return { ...n, selected: false }
          }
          // Select the clicked output node
          if (n.id === nodeId) {
            return { ...n, selected: true }
          }
          // Deselect all other nodes
          return { ...n, selected: false }
        })
        return updated
      })
    } else {
      // For non-output nodes, just ensure they're selected
      setNodes((nds) => {
        return nds.map((n) => ({
          ...n,
          selected: n.id === nodeId,
        }))
      })
    }

    // Use a tiny delay to ensure previous menu is fully closed before opening new one
    // This prevents the justOpenedRef from interfering
    setTimeout(() => {
      setOpenMenuNodeId(nodeId)
      setMenuPosition(null) // Reset position so menu opens at logical place next to node
    }, 0)
  }, [nodes, setNodes, openMenuNodeId])

  const handleCloseMenu = useCallback(() => {
    setOpenMenuNodeId(null)
    setMenuPosition(null)
  }, [])

  const handleOpenFlowConfigMenu = useCallback(() => {
    // Close node menu if open
    setOpenMenuNodeId(null)
    setMenuPosition(null)
    setIsFlowConfigMenuOpen(true)
    setFlowConfigMenuPosition(null) // Will be auto-positioned next to toolbar
  }, [])

  const handleCloseFlowConfigMenu = useCallback(() => {
    setIsFlowConfigMenuOpen(false)
    setFlowConfigMenuPosition(null)
  }, [])

  const handleFlowMetadataUpdate = useCallback((metadata: { description: string; userInitialTimeout: number; voice: string }) => {
    setFlowMetadata(metadata)
  }, [])

  const handleMenuPositionChange = useCallback((position: { x: number; y: number } | null) => {
    setMenuPosition(position)
  }, [])

  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    // Check if click is on toolbar buttons - don't close menu in that case
    const target = event.target as HTMLElement
    const isToolbarButton = target.closest('.toolbar-nav-button') !== null
    const isToolbar = target.closest('.nodes-toolbar') !== null

    // Only close menu if clicking on canvas, not on toolbar
    if (!isToolbarButton && !isToolbar) {
      setOpenMenuNodeId(null)
      setMenuPosition(null)
      // Also close flow config menu
      setIsFlowConfigMenuOpen(false)
      setFlowConfigMenuPosition(null)
    }
  }, [])

  const handleNodeDataUpdate = useCallback((nodeId: string, updatedData: any) => {
    // Don't save history for param changes - only node add/remove and connections are in history
    setNodes((nds) => {
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
  }, [setNodes, saveHistoryBeforeChange, isLocked])

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (isLocked) return

    // Check if this is an output node that shouldn't be deleted
    const nodeToDelete = nodes.find((n) => n.id === nodeId)
    const nodeType = nodeToDelete?.data?.nodeType as NodeType | undefined

    // Prevent deletion of non-deletable output nodes (using config)
    if (nodeType && isBranchingOutputNodeType(nodeType)) {
      if (!canOutputNodeBeDeleted(nodeType)) {
        return // Don't delete non-deletable output nodes
      }
    }

    saveHistoryBeforeChange()

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
        let updatedArray = [...currentArray]
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

        // Recalculate branching node size
        const layoutConstants = getBranchingLayoutConstants()
        const { outputNodeWidth, padding, headerHeight, outputSpacing, outputNodeHeight } = layoutConstants
        const newOutputCount = remainingOutputNodes.length
        const branchingNodeWidth = outputNodeWidth + padding * 2
        const branchingNodeHeight = headerHeight + outputSpacing + (newOutputCount * outputNodeHeight) + ((newOutputCount - 1) * outputSpacing) + padding

        // Update branching node
        const branchingIndex = updatedNodes.findIndex((n) => n.id === parentId)
        if (branchingIndex >= 0) {
          updatedNodes[branchingIndex] = {
            ...updatedNodes[branchingIndex],
            style: {
              ...updatedNodes[branchingIndex].style,
              width: branchingNodeWidth,
              height: branchingNodeHeight,
            },
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

        // Reposition remaining output nodes - this will use the updated outputIndex values
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

        // Remove edges connected to output nodes
        setEdges((eds) => eds.filter((e) => !outputNodeIds.includes(e.source) && !outputNodeIds.includes(e.target)))

        // Remove output nodes and the branching node
        return nds.filter((n) => n.id !== nodeId && !outputNodeIds.includes(n.id))
      }

      // For other nodes, just remove the node
      return nds.filter((n) => n.id !== nodeId)
    })

    // Remove edges connected to the deleted node
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))

    // Close menu if the deleted node's menu was open
    if (openMenuNodeId === nodeId) {
      setOpenMenuNodeId(null)
      setMenuPosition(null)
    }
  }, [isLocked, saveHistoryBeforeChange, setNodes, setEdges, openMenuNodeId, nodes])

  const handleExportJson = useCallback(() => {
    if (!reactFlowInstance) {
      console.warn('ReactFlow instance not available')
      return
    }

    const exportData = exportFlowToJson(nodes, edges)
    console.log('Export JSON:', JSON.stringify(exportData, null, 2))

    // Also copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2)).then(() => {
      console.log('JSON copied to clipboard')
    }).catch((err) => {
      console.error('Failed to copy to clipboard:', err)
    })
  }, [reactFlowInstance, nodes, edges])

  const { validate } = useValidation(nodes, edges)

  const handleValidate = useCallback(() => {
    const result = validate()
    setValidationStatus(result)
  }, [validate])

  const handleDismissValidation = useCallback(() => {
    setValidationStatus({ isValid: null, message: '' })
  }, [])

  // Flag to prevent saving history during undo/redo operations
  const isRestoringStateRef = useRef(false)

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    if (!history.canUndo || isLocked) return

    const previousState = history.undo()
    if (previousState) {
      isRestoringStateRef.current = true

      // Clear connectingFrom state from all nodes to prevent handles from staying visible
      const cleanedNodes = previousState.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          connectingFrom: null,
        },
      }))

      // Update nodes and edges directly - useNodesState/useEdgesState will handle ReactFlow sync
      setNodes(cleanedNodes)
      setEdges(previousState.edges)

      // Clear ReactFlow's internal connection state to hide any visible handles
      // Use a small delay to ensure ReactFlow has processed the state update
      setTimeout(() => {
        onConnectEnd(new MouseEvent('mouseup'))
      }, 0)

      // Close menu on undo (params are not in history anymore)
      setOpenMenuNodeId(null)
      setMenuPosition(null)

      // Reset flag after ReactFlow has processed the state changes
      // Use requestAnimationFrame twice to ensure ReactFlow has fully processed
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isRestoringStateRef.current = false
        })
      })
    }
  }, [history, isLocked, setNodes, setEdges, onConnectEnd])

  const handleRedo = useCallback(() => {
    if (!history.canRedo || isLocked) return

    const nextState = history.redo()
    if (nextState) {
      isRestoringStateRef.current = true

      // Clear connectingFrom state from all nodes to prevent handles from staying visible
      const cleanedNodes = nextState.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          connectingFrom: null,
        },
      }))

      // Update nodes and edges directly
      setNodes(cleanedNodes)
      setEdges(nextState.edges)

      // Clear ReactFlow's internal connection state to hide any visible handles
      // Use a small delay to ensure ReactFlow has processed the state update
      setTimeout(() => {
        onConnectEnd(new MouseEvent('mouseup'))
      }, 0)

      // Close menu on redo (params are not in history anymore)
      setOpenMenuNodeId(null)
      setMenuPosition(null)

      // Reset flag after ReactFlow has processed the state changes
      // Use requestAnimationFrame twice to ensure ReactFlow has fully processed
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isRestoringStateRef.current = false
        })
      })
    }
  }, [history, isLocked, setNodes, setEdges, onConnectEnd])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Check for Ctrl+Z (or Cmd+Z on Mac) for undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
      }
      // Check for Ctrl+Shift+Z or Ctrl+Y (or Cmd+Shift+Z/Cmd+Y on Mac) for redo
      else if ((event.ctrlKey || event.metaKey) && (event.key === 'Z' || event.key === 'y' || event.key === 'Y')) {
        event.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleUndo, handleRedo])

  const handleAddOutput = useCallback((nodeId: string) => {
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
      const listParam = module.params.find(p => p.name === listParamName)
      const newValue = getDefaultValueForParamType(listParam?.type)

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
      const { outputNodeWidth, padding, headerHeight, outputSpacing, outputNodeHeight } = layoutConstants
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

      const outputNode = createNodeFromConfig(outputNodeType, calculateOutputNodePosition(branchingPos, newIndex, layoutConstants), {
        moduleName: branchingNode.data?.moduleName,
        parentNodeId: nodeId,
        connectingFrom: null,
        params: { value: outputValue },
        outputIndex: newIndex, // Store index for reference
      })
      // Set label - use value if available, otherwise "_"
      outputNode.data.label = (outputValue !== null && outputValue !== undefined && outputValue !== '') ? String(outputValue) : '_'

      // Update branching node size
      const branchingNodeWidth = outputNodeWidth + padding * 2
      const branchingNodeHeight = headerHeight + outputSpacing + (newOutputCount * outputNodeHeight) + ((newOutputCount - 1) * outputSpacing) + padding

      return updatedNodes.map((node) =>
        node.id === nodeId
          ? {
            ...node,
            style: { ...node.style, width: branchingNodeWidth, height: branchingNodeHeight },
            data: { ...node.data, outputCount: newOutputCount },
          }
          : node
      ).concat(outputNode)
    })
  }, [setNodes, saveHistoryBeforeChange, isLocked])

  // Update nodes with label click handler, make output nodes non-draggable, and set zIndex for proper layering
  // zIndex values come from nodeConfigs
  // Also recalculate labels dynamically based on module config
  const nodesWithHandlers = nodes.map((node) => {
    const nodeType = (node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType
    const config = nodeConfigs[nodeType]
    const zIndex = config?.zIndex ?? 2 // Default fallback

    // Recalculate label based on module config
    const module = node.data?.moduleName ? modules.find((m) => m.name === node.data.moduleName) : undefined

    // For internal handling output nodes, use predefined labels from module config
    let calculatedLabel = getNodeLabel(module, node.data, nodeType)
    if (isBranchingOutputNodeType(nodeType) && module?.outputConfig?.type === 'internal' && module.outputLabels) {
      const outputIndex = node.data?.outputIndex ?? 0
      calculatedLabel = module.outputLabels[outputIndex] || calculatedLabel
    }

    return {
      ...node,
      data: {
        ...node.data,
        label: calculatedLabel,
        onLabelClick: handleLabelClick,
        // No need for isInternalOutput flag - we check parent node type instead
      },
      draggable: !(node.data?.nodeType && isBranchingOutputNodeType(node.data.nodeType as NodeType)), // Output nodes are not draggable - they move with parent
      selectable: (() => {
        // Output nodes that cannot be deleted should not be selectable
        const nodeType = node.data?.nodeType as NodeType | undefined
        if (nodeType && isBranchingOutputNodeType(nodeType)) {
          return canOutputNodeBeDeleted(nodeType) // Only selectable if deletable
        }
        return true
      })(),
      zIndex,
    }
  })

  return (
    <div className="app-root">
      <main className="canvas-wrapper" ref={reactFlowWrapper}>
        <Toolbar
          modules={modules}
          onNodeDragStart={onNodeDragStart}
          onSidebarNodeClick={onSidebarNodeClick}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          isLocked={isLocked}
          onLockToggle={() => setIsLocked((prev) => !prev)}
          showMinimap={showMinimap}
          onMinimapToggle={() => setShowMinimap((prev) => !prev)}
          hasNodes={nodes.length > 0}
          onExportJson={handleExportJson}
          onValidate={handleValidate}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          toolbarRef={toolbarRef}
          onOpenFlowConfigMenu={handleOpenFlowConfigMenu}
        />

        <FlowCanvas
          nodes={nodesWithHandlers}
          edges={edges.map((edge) => ({
            ...edge,
            zIndex: edge.zIndex ?? 2, // Edges above branching nodes (1) but below output nodes (3)
          }))}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onInit={onInit}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onMove={onMove}
          onPaneClick={handlePaneClick}
          isLocked={isLocked}
          viewport={viewport}
        />

        {openMenuNodeId && reactFlowInstance && (() => {
          const menuNode = nodes.find((n) => n.id === openMenuNodeId)
          if (!menuNode) return null

          return (
            <NodePopupMenu
              node={menuNode}
              onClose={handleCloseMenu}
              reactFlowWrapper={reactFlowWrapper}
              reactFlowInstance={reactFlowInstance}
              onNodeDataUpdate={handleNodeDataUpdate}
              onAddOutput={menuNode.data?.nodeType && isBranchingNodeType(menuNode.data.nodeType as NodeType) ? handleAddOutput : undefined}
              onDeleteNode={handleDeleteNode}
              initialPosition={menuPosition}
              onPositionChange={handleMenuPositionChange}
            />
          )
        })()}

        {isFlowConfigMenuOpen && reactFlowInstance && (
          <NodePopupMenu
            onClose={handleCloseFlowConfigMenu}
            reactFlowWrapper={reactFlowWrapper}
            reactFlowInstance={reactFlowInstance}
            isFlowConfig={true}
            flowMetadata={flowMetadata}
            onFlowMetadataUpdate={handleFlowMetadataUpdate}
            toolbarRef={toolbarRef}
            title="Flow Configuration"
            initialPosition={flowConfigMenuPosition}
            onPositionChange={setFlowConfigMenuPosition}
          />
        )}

        {showMinimap && reactFlowInstance && (
          <Minimap
            nodes={nodes}
            edges={edges}
            reactFlowInstance={reactFlowInstance}
            viewport={viewport}
            reactFlowWrapper={reactFlowWrapper}
          />
        )}

        <ValidationBanner
          isValid={validationStatus.isValid}
          message={validationStatus.message}
          onDismiss={handleDismissValidation}
        />
      </main>
    </div>
  )
}

export default App
