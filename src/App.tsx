import { useCallback, useRef, useState, useEffect } from 'react'
import { ReactFlowInstance, useEdgesState, useNodesState, type Node, MarkerType } from 'reactflow'
import './App.css'
import modules from './modules'
import nodeConfigs, { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES, canOutputNodeBeDeleted } from './nodeConfigs'
import { useHistory } from './hooks/useHistory'
import { createNodeFromConfig, createBranchingNodeWithOutputs } from './utils/nodeCreation'
import { getNodeLabel, getId } from './utils/nodeUtils'
import { useValidation } from './hooks/useValidation'
import { getBranchingLayoutConstants, calculateOutputNodePosition, repositionOutputNodes, updateBranchingNodeHeight } from './utils/branchingNodeHelpers'
import { exportFlowToJson } from './utils/exportHelpers'
import { translateReactFlowToCustom, type CustomFlowMetadata } from './utils/translationHelpers'
import { autoLayout } from './utils/layoutHelpers'
import { getDefaultValueForParamType } from './utils/branchingNodeOperations'

import Toolbar from './components/Toolbar'
import FlowCanvas from './components/FlowCanvas'
import Minimap from './Minimap'
import NodePopupMenu from './components/NodePopupMenu'
import ValidationBanner from './components/ValidationBanner'
import JsonEditor from './components/JsonEditor'
import { useConnectionHandlers } from './hooks/useConnectionHandlers'

const initialNodes: Node[] = []
const initialEdges: any[] = []

function App() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [isLocked] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [isFlowConfigMenuOpen, setIsFlowConfigMenuOpen] = useState(false)
  const [flowConfigMenuPosition, setFlowConfigMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [flowMetadata, setFlowMetadata] = useState({
    description: '',
    language: '',
    mchannels_bot_id: '',
    name: '',
    omnichannel_config: {} as Record<string, any>,
    stickers: {} as Record<string, any>,
  })
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [validationStatus, setValidationStatus] = useState<{ isValid: boolean | null; message: string }>({
    isValid: null,
    message: '',
  })
  const [isJsonEditorOpen, setIsJsonEditorOpen] = useState(false)

  // Track when a branching node is being dragged so we can disable
  // smooth transitions for its output nodes (prevents them from lagging)
  const [isBranchingDragging, setIsBranchingDragging] = useState(false)

  // Track whether any node is being dragged (for global edge/node layering)
  const [isDragging, setIsDragging] = useState(false)

  // Track which nodes are currently being dragged to give them highest z-index
  const draggingNodeIdsRef = useRef<Set<string>>(new Set())

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const history = useHistory()

  // Track highest z-index to ensure newly created nodes appear on top
  const highestZIndexRef = useRef(100)

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

  // Ensure minimap is turned off when there are no nodes so the button state stays consistent
  useEffect(() => {
    if (nodes.length === 0 && showMinimap) {
      setShowMinimap(false)
    }
  }, [nodes.length, showMinimap])

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

      // Prevent creating multiple start nodes
      if (module.name === 'Start') {
        const existingStartNode = nodes.find((n) => n.data?.moduleName === 'Start')
        if (existingStartNode) {
          return // Don't create another start node
        }
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
        // Set z-index for newly created nodes to appear on top
        // Find the highest z-index among all existing nodes
        setNodes((nds) => {
          const maxZIndex = nds.reduce((max, n) => {
            const z = typeof n.zIndex === 'number' ? n.zIndex : 0
            return Math.max(max, z)
          }, highestZIndexRef.current)
          const baseZIndex = maxZIndex + 1
          highestZIndexRef.current = baseZIndex + outputCount
          const nodesWithZIndex = nodesToAdd.map((node, idx) => ({
            ...node,
            zIndex: baseZIndex + idx,
          }))
          return nds.concat(nodesWithZIndex)
        })
      } else {
        // Single node (or any other non-branching type)
        const newNode = createNodeFromConfig(module.type as NodeType, position, {
          moduleName: module.name,
          connectingFrom: null,
        })
        // Set z-index for newly created node to appear on top
        setNodes((nds) => {
          const maxZIndex = nds.reduce((max, n) => {
            const z = typeof n.zIndex === 'number' ? n.zIndex : 0
            return Math.max(max, z)
          }, highestZIndexRef.current)
          const newZIndex = maxZIndex + 1
          highestZIndexRef.current = newZIndex
          return nds.concat({ ...newNode, zIndex: newZIndex })
        })
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
      const nodeWidth = singleConfig?.defaultWidth || 180
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

        // Prevent creating multiple start nodes
        if (module.name === 'Start') {
          const existingStartNode = nds.find((n) => n.data?.moduleName === 'Start')
          if (existingStartNode) {
            return nds // Don't create another start node
          }
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
          const branchingConfig = nodeConfigs.branchingInternal || nodeConfigs.branchingListParam
          // For internal type, use the fixed output count from module config
          // For listParam type, use default from nodeConfig
          let outputCount = branchingConfig?.defaultOutputCount ?? 1
          if (module.outputConfig?.type === 'internal') {
            outputCount = module.outputConfig.outputCount
          }
          const nodesToAdd = createBranchingNodeWithOutputs(finalPosition, outputCount, module.name, module.type as NodeType)
          // Set z-index for newly created nodes to appear on top
          // Find the highest z-index among all existing nodes
          const maxZIndex = nds.reduce((max, n) => {
            const z = typeof n.zIndex === 'number' ? n.zIndex : 0
            return Math.max(max, z)
          }, highestZIndexRef.current)
          const baseZIndex = maxZIndex + 1
          highestZIndexRef.current = baseZIndex + outputCount

          // Deselect all existing nodes
          const clearedNodes = nds.map((node) => ({ ...node, selected: false }))

          // Apply z-index and select only the main branching node (first in array)
          const nodesWithZIndex = nodesToAdd.map((node, idx) => ({
            ...node,
            zIndex: baseZIndex + idx,
            selected: idx === 0,
          }))

          return clearedNodes.concat(nodesWithZIndex)
        } else {
          // Single node (or any other non-branching type)
          const newNode = createNodeFromConfig(module.type as NodeType, finalPosition, {
            moduleName: module.name,
            connectingFrom: null,
          })
          // Set z-index for newly created node to appear on top
          const maxZIndex = nds.reduce((max, n) => {
            const z = typeof n.zIndex === 'number' ? n.zIndex : 0
            return Math.max(max, z)
          }, highestZIndexRef.current)
          const newZIndex = maxZIndex + 1
          highestZIndexRef.current = newZIndex
          // Deselect all existing nodes and select the newly added one
          const clearedNodes = nds.map((node) => ({ ...node, selected: false }))
          return clearedNodes.concat({ ...newNode, zIndex: newZIndex, selected: true })
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

  const onMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
      setViewport(viewport)
    },
    []
  )

  // Handle output node dragging - prevent horizontal movement, constrain vertical movement within bounds
  // and temporarily move other output nodes out of the way while dragging
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
    [setNodes, modules]
  )

  // Handle output node drag stop - immediately snap and reorder
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
        let updatedNodes = [...nds]
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
    [setNodes, modules]
  )

  // Helper function to position start node at default view location
  const positionStartNodeAtDefaultView = useCallback(
    (instance: ReactFlowInstance, currentNodes: Node[], duration: number = 0) => {
      const startNode = currentNodes.find((n) => n.data?.moduleName === 'Start')
      if (startNode) {
        const bounds = reactFlowWrapper.current?.getBoundingClientRect()
        if (bounds) {
          // Calculate where Start node should appear on screen - closer to middle but still on left side
          // Position at about 40% from left (closer to center than before)
          const targetScreenX = bounds.width * 0.4
          const targetScreenY = bounds.height * (1 / 3)

          // Use default zoom 0.7
          const zoom = 0.7
          const flowX = startNode.position.x
          const flowY = startNode.position.y

          // Calculate viewport offset needed to position Start node at target screen position
          const viewportX = -flowX * zoom + targetScreenX
          const viewportY = -flowY * zoom + targetScreenY

          instance.setViewport({ x: viewportX, y: viewportY, zoom })
        }
      } else if (currentNodes.length === 0) {
        // Default zoom if no nodes
        instance.setViewport({ x: 0, y: 0, zoom: 0.7 })
      } else {
        // Fit view with default zoom
        instance.fitView({ padding: 0.2, minZoom: 0.7, maxZoom: 1.5, duration })
      }
    },
    []
  )

  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      setReactFlowInstance(instance)
      const viewport = instance.getViewport()
      setViewport(viewport)

      // Set default zoom and position first, then create start node at correct position
      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (bounds) {
        // Calculate target position for start node
        const targetScreenX = bounds.width * 0.4
        const targetScreenY = bounds.height * (1 / 3)
        const zoom = 0.7

        // Set viewport immediately to prevent initial render hiccup
        // We'll position the start node at (0, 0) initially and adjust viewport
        instance.setViewport({ x: targetScreenX, y: targetScreenY, zoom })

        // Now create start node at flow position (0, 0) which will appear at target screen position
        setNodes((nds) => {
          const hasStartNode = nds.some((n) => n.data?.moduleName === 'Start')
          if (!hasStartNode) {
            const startModule = modules.find((m) => m.name === 'Start')
            if (startModule) {
              // Position at (0, 0) in flow coordinates - viewport is already set
              const position = { x: 0, y: 0 }
              const startNode = createNodeFromConfig(startModule.type as NodeType, position, {
                moduleName: 'Start',
                connectingFrom: null,
              })
              return [...nds, startNode]
            }
          }
          return nds
        })
      }
    },
    [setNodes, positionStartNodeAtDefaultView]
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
      // Filter out deletions of non-deletable output nodes and start nodes before processing
      const filteredChanges = changes.filter((change) => {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          const moduleName = node?.data?.moduleName

          // Prevent deletion of start node
          if (moduleName === 'Start' || nodeType === 'outputOnly') {
            return false
          }

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
      const movedOutputNodeIds = new Map<string, { parentId: string; newPosition: { x: number; y: number } }>()

      // First pass: collect all branching nodes being deleted
      filteredChanges.forEach((change) => {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingNodeType(nodeType)) {
            removedBranchingNodeIds.add(change.id)
          }
        }
      })

      // If branching nodes are being deleted, add their output nodes to the deletion batch
      // This ensures branching node + outputs are deleted together in one operation
      if (removedBranchingNodeIds.size > 0) {
        removedBranchingNodeIds.forEach((branchingNodeId) => {
          const outputNodes = nodes.filter((n) => {
            const nType = n.data?.nodeType as NodeType | undefined
            return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === branchingNodeId
          })
          outputNodes.forEach((outputNode) => {
            // Add output node deletion to the changes if not already there
            if (!filteredChanges.some((c) => c.type === 'remove' && c.id === outputNode.id)) {
              filteredChanges.push({
                id: outputNode.id,
                type: 'remove',
              })
            }
          })
        })
      }

      filteredChanges.forEach((change) => {
        if (change.type === 'position' && change.position) {
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingNodeType(nodeType)) {
            movedBranchingNodeIds.add(change.id)
          } else if (nodeType && isBranchingOutputNodeType(nodeType) && canOutputNodeBeDeleted(nodeType) && node?.data?.parentNodeId) {
            // Track list param output nodes that are being moved (draggable ones)
            movedOutputNodeIds.set(change.id, {
              parentId: node.data.parentNodeId,
              newPosition: change.position,
            })
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

      // Track which nodes are being dragged for z-index updates
      const currentlyDragging = new Set<string>()
      filteredChanges.forEach((change) => {
        if (change.type === 'position' && change.dragging) {
          currentlyDragging.add(change.id)
        }
      })

      // Update dragging ref
      draggingNodeIdsRef.current = currentlyDragging

      // Update global dragging state (used for edge/node layering)
      setIsDragging(currentlyDragging.size > 0)

      // Determine if any branching node is currently being dragged (for this batch)
      const hasBranchingDragging = filteredChanges.some((change) => {
        if (change.type !== 'position' || !change.position || !change.dragging) return false
        const node = nodes.find((n) => n.id === change.id)
        const nodeType = node?.data?.nodeType as NodeType | undefined
        return !!nodeType && isBranchingNodeType(nodeType)
      })
      if (hasBranchingDragging !== isBranchingDragging) {
        setIsBranchingDragging(hasBranchingDragging)
      }

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
            const { outputNodeWidth, padding, headerHeight, outputSpacing, outputNodeHeight, firstOutputExtraSpacing } = layoutConstants
            const newOutputCount = remainingOutputNodes.length
            const branchingNodeWidth = outputNodeWidth + padding * 2
            const branchingNodeHeight = headerHeight + outputSpacing + firstOutputExtraSpacing + (newOutputCount * outputNodeHeight) + ((newOutputCount - 1) * outputSpacing) + padding

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

            // Select the node above the deleted one if it exists
            if (deletedIndices.length > 0 && sortedRemaining.length > 0) {
              // Find the highest deleted index
              const highestDeletedIndex = Math.max(...deletedIndices)
              // Select the node at the position of the deleted node (or the last one if deleted was last)
              const nodeToSelectIndex = Math.min(highestDeletedIndex, sortedRemaining.length - 1)
              if (nodeToSelectIndex >= 0 && nodeToSelectIndex < sortedRemaining.length) {
                const nodeToSelect = sortedRemaining[nodeToSelectIndex]
                const selectIndex = updatedNodes.findIndex((n) => n.id === nodeToSelect.id)
                if (selectIndex >= 0) {
                  updatedNodes[selectIndex] = {
                    ...updatedNodes[selectIndex],
                    selected: true,
                  }
                }
              }
            }
          })

          return updatedNodes
        })

        // Remove edges connected to deleted output nodes
        setEdges((eds) => eds.filter((e) => !removedOutputNodeIds.has(e.source) && !removedOutputNodeIds.has(e.target)))
      }

      // If branching nodes are being removed, also remove their output nodes
      // Note: Output nodes should already be in filteredChanges from the earlier logic,
      // but we handle it here as a fallback and to remove edges
      if (removedBranchingNodeIds.size > 0) {
        // Collect all output node IDs that should be removed
        const outputNodeIdsToRemove = new Set<string>()
        nodes.forEach((n) => {
          const nodeType = n.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingOutputNodeType(nodeType) && n.data.parentNodeId && removedBranchingNodeIds.has(n.data.parentNodeId)) {
            outputNodeIdsToRemove.add(n.id)
            // Ensure output node is in the deletion batch
            if (!filteredChanges.some((c) => c.type === 'remove' && c.id === n.id)) {
              filteredChanges.push({
                id: n.id,
                type: 'remove',
              })
            }
          }
        })

        // Remove edges connected to these output nodes
        if (outputNodeIdsToRemove.size > 0) {
          setEdges((eds) => eds.filter((e) => !outputNodeIdsToRemove.has(e.source) && !outputNodeIdsToRemove.has(e.target)))
        }
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
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return

    // Prevent menu opening for start node
    const moduleName = node.data?.moduleName
    if (moduleName === 'Start') {
      return
    }

    // Close all other menus first (flow config, sticker, and other node menus)
    setIsFlowConfigMenuOpen(false)
    setFlowConfigMenuPosition(null)
    setIsStickerMenuOpen(false)
    setStickerMenuPosition(null)
    if (openMenuNodeId && openMenuNodeId !== nodeId) {
      setOpenMenuNodeId(null)
      setMenuPosition(null)
    }

    // Deselect all nodes when opening menu - only the menu should be "selected" (focused)
    setNodes((nds) => {
      return nds.map((n) => ({
        ...n,
        selected: false,
      }))
    })

    // Open menu immediately - no delay needed since we closed all other menus
    setOpenMenuNodeId(nodeId)
    setMenuPosition(null) // Reset position so menu opens at logical place next to node
  }, [nodes, setNodes, openMenuNodeId])

  const handleCloseMenu = useCallback(() => {
    setOpenMenuNodeId(null)
    setMenuPosition(null)
  }, [])


  const handleOpenFlowConfigMenu = useCallback(() => {
    // Close all other menus first
    setOpenMenuNodeId(null)
    setMenuPosition(null)
    setIsStickerMenuOpen(false)
    setStickerMenuPosition(null)

    // Open flow config menu immediately
    setIsFlowConfigMenuOpen(true)
    setFlowConfigMenuPosition(null) // Will be auto-positioned next to toolbar
  }, [])

  const [isStickerMenuOpen, setIsStickerMenuOpen] = useState(false)
  const [stickerMenuPosition, setStickerMenuPosition] = useState<{ x: number; y: number } | null>(null)

  const handleOpenStickerMenu = useCallback(() => {
    // Close all other menus first
    setOpenMenuNodeId(null)
    setMenuPosition(null)
    setIsFlowConfigMenuOpen(false)
    setFlowConfigMenuPosition(null)

    // Open sticker menu immediately
    setIsStickerMenuOpen(true)
    setStickerMenuPosition(null) // Will be auto-positioned next to toolbar
  }, [])

  const handleCloseStickerMenu = useCallback(() => {
    setIsStickerMenuOpen(false)
    setStickerMenuPosition(null)
  }, [])

  const handleCloseFlowConfigMenu = useCallback(() => {
    setIsFlowConfigMenuOpen(false)
    setFlowConfigMenuPosition(null)
  }, [])

  const handleFlowMetadataUpdate = useCallback((metadata: CustomFlowMetadata) => {
    setFlowMetadata({
      ...metadata,
      omnichannel_config: metadata.omnichannel_config || {},
      stickers: metadata.stickers || {},
    })
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

  const handleSelectionStart = useCallback((_event: React.MouseEvent) => {
    // Close menus when starting to select (shift+drag or box selection)
    setOpenMenuNodeId(null)
    setMenuPosition(null)
    setIsFlowConfigMenuOpen(false)
    setFlowConfigMenuPosition(null)
  }, [])

  const handleNodeDataUpdate = useCallback((nodeId: string, updatedData: any) => {
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
        reactFlowInstance.setViewport(currentViewport)
      })
    }
  }, [setNodes, reactFlowInstance])

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (isLocked) return

    // Check if this is an output node that shouldn't be deleted
    const nodeToDelete = nodes.find((n) => n.id === nodeId)
    const nodeType = nodeToDelete?.data?.nodeType as NodeType | undefined
    const moduleName = nodeToDelete?.data?.moduleName

    // Prevent deletion of start node
    if (moduleName === 'Start' || nodeType === 'outputOnly') {
      return
    }

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

  const { validate } = useValidation(nodes, edges)

  const handleValidate = useCallback(() => {
    const result = validate()
    setValidationStatus(result)
  }, [validate])

  const handleDismissValidation = useCallback(() => {
    setValidationStatus({ isValid: null, message: '' })
  }, [])

  const handleOpenJsonEditor = useCallback(() => {
    // Allow opening JSON editor even when there are no nodes,
    // so the user can paste/import a flow at any time.
    setIsJsonEditorOpen(true)
  }, [])

  const handleCloseJsonEditor = useCallback(() => {
    setIsJsonEditorOpen(false)
  }, [])

  const handleSaveJsonEditor = useCallback((reactFlowData: { nodes: any[]; edges: any[] }, metadata: CustomFlowMetadata) => {
    // Save history before applying changes
    saveHistoryBeforeChange()

    // Update flow metadata
    setFlowMetadata({
      ...metadata,
      omnichannel_config: metadata.omnichannel_config || {},
      stickers: metadata.stickers || {},
    })

    // Reconstruct nodes properly - preserve positions and all properties
    // Important: Preserve node positions from current canvas to avoid layout changes
    const reconstructedNodes: Node[] = reactFlowData.nodes.map((node) => {
      const originalNode = nodes.find((n) => n.id === node.id)

      // Deep merge data: start with original node data, then override with new data
      // This ensures all properties (like params, outputIndex, parentNodeId, etc.) are preserved
      const mergedData = originalNode?.data
        ? { ...originalNode.data, ...node.data }
        : { ...node.data }

      // Ensure connectingFrom is preserved
      if (originalNode?.data?.connectingFrom !== undefined) {
        mergedData.connectingFrom = originalNode.data.connectingFrom
      } else {
        mergedData.connectingFrom = null
      }

      // Preserve position from original node if it exists, otherwise use from JSON
      const preservedPosition = originalNode?.position || node.position || { x: 0, y: 0 }

      // Ensure node has all required properties
      const reconstructed: Node = {
        id: node.id,
        type: node.type || 'nodeFactory',
        position: preservedPosition, // Preserve original position to avoid layout changes
        data: mergedData,
        selected: false,
        // Preserve style and zIndex from original if available, otherwise use from node data
        style: node.style || originalNode?.style,
        zIndex: node.zIndex ?? originalNode?.zIndex,
        width: node.width || node.style?.width || originalNode?.width,
        height: node.height || node.style?.height || originalNode?.height,
      }

      return reconstructed
    })

    // Preserve all edges with all properties including markerEnd (arrow heads), style, etc.
    const preservedEdges = reactFlowData.edges.map((edge) => {
      // Find original edge to preserve all properties
      const originalEdge = edges.find((e) => e.id === edge.id || (e.source === edge.source && e.target === edge.target))

      // Default markerEnd if missing
      const defaultMarkerEnd = {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: 'rgba(148, 163, 184, 0.8)',
      }

      // Default style if missing
      const defaultStyle = {
        strokeWidth: 2,
        stroke: 'rgba(148, 163, 184, 0.8)',
      }

      return {
        ...edge, // Start with edge from JSON (has updated source/target)
        // Preserve all ReactFlow edge properties from original or from JSON
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? originalEdge?.sourceHandle,
        targetHandle: edge.targetHandle ?? originalEdge?.targetHandle,
        type: edge.type || originalEdge?.type || 'default',
        // Preserve arrow heads and styling - ensure markerEnd is always set
        markerEnd: edge.markerEnd ?? originalEdge?.markerEnd ?? defaultMarkerEnd,
        markerStart: edge.markerStart ?? originalEdge?.markerStart,
        style: edge.style ?? originalEdge?.style ?? defaultStyle,
        animated: edge.animated ?? originalEdge?.animated,
        hidden: edge.hidden ?? originalEdge?.hidden,
        selected: edge.selected ?? originalEdge?.selected,
        zIndex: edge.zIndex ?? originalEdge?.zIndex,
      }
    })

    // Update branching node heights based on their output nodes
    let finalNodes = reconstructedNodes
    const layoutConstants = getBranchingLayoutConstants()
    reconstructedNodes.forEach((node) => {
      const nodeType = node.data?.nodeType as NodeType | undefined
      if (nodeType && isBranchingNodeType(nodeType)) {
        finalNodes = updateBranchingNodeHeight(finalNodes, node.id, layoutConstants)
      }
    })

    // Reposition output nodes to ensure correct positions
    reconstructedNodes.forEach((node) => {
      const nodeType = node.data?.nodeType as NodeType | undefined
      if (nodeType && isBranchingNodeType(nodeType)) {
        finalNodes = repositionOutputNodes(finalNodes, node.id, layoutConstants)
      }
    })

    // Set nodes first, then edges in next tick to ensure ReactFlow processes nodes first
    setNodes(finalNodes)

    // Use requestAnimationFrame to ensure nodes are processed before edges
    requestAnimationFrame(() => {
      setEdges(preservedEdges)
    })

    // Don't close editor - let user continue editing
    // setIsJsonEditorOpen(false)
  }, [nodes, setNodes, setEdges, saveHistoryBeforeChange])

  // Flag to prevent saving history during undo/redo operations
  const isRestoringStateRef = useRef(false)

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    if (!history.canUndo || isLocked) return

    // Preserve current viewport to prevent view from moving
    const currentViewport = reactFlowInstance?.getViewport()

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

      // Restore viewport to prevent view from moving
      if (currentViewport && reactFlowInstance) {
        requestAnimationFrame(() => {
          reactFlowInstance.setViewport(currentViewport)
        })
      }

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
  }, [history, isLocked, setNodes, setEdges, onConnectEnd, reactFlowInstance])

  const handleRedo = useCallback(() => {
    if (!history.canRedo || isLocked) return

    // Preserve current viewport to prevent view from moving
    const currentViewport = reactFlowInstance?.getViewport()

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

      // Restore viewport to prevent view from moving
      if (currentViewport && reactFlowInstance) {
        requestAnimationFrame(() => {
          reactFlowInstance.setViewport(currentViewport)
        })
      }

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
  }, [history, isLocked, setNodes, setEdges, onConnectEnd, reactFlowInstance])

  // Duplicate selected nodes
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
                if (
                  parentModule.canDuplicate === false ||
                  (parentModule.outputConfig?.type === 'internal')
                ) {
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
        const newOutputNode = createNodeFromConfig(outputNodeType, calculateOutputNodePosition(branchingPos, newIndex, layoutConstants), {
          moduleName: parentNode.data?.moduleName,
          parentNodeId: parentNode.id,
          connectingFrom: null,
          params: { value: duplicatedValue },
          outputIndex: newIndex,
        })
        // Set label - use value if available, otherwise "_"
        newOutputNode.data.label = (duplicatedValue !== null && duplicatedValue !== undefined && duplicatedValue !== '') ? String(duplicatedValue) : '_'

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
  }, [isLocked, saveHistoryBeforeChange, setNodes])

  // Keyboard shortcuts for undo/redo, duplicate, and navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+E: Jump to next node if a node with outgoing edge is selected
      if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault()
        const selectedNode = nodes.find(n => n.selected)
        if (selectedNode && reactFlowInstance) {
          // Find outgoing edges from selected node (or from its output nodes if it's a branching node)
          let outgoingEdges = edges.filter(e => e.source === selectedNode.id)

          // If no direct edges, check if it's a branching node and look for edges from its output nodes
          if (outgoingEdges.length === 0) {
            const outputNodes = nodes.filter(n => n.data?.parentNodeId === selectedNode.id)
            for (const outputNode of outputNodes) {
              const outputEdges = edges.filter(e => e.source === outputNode.id)
              if (outputEdges.length > 0) {
                outgoingEdges = outputEdges
                break
              }
            }
          }

          if (outgoingEdges.length > 0) {
            // Get the first target node
            let targetNodeId = outgoingEdges[0].target
            let targetNode = nodes.find(n => n.id === targetNodeId)

            // If target is a branching output node, use its parent instead
            if (targetNode) {
              const targetType = targetNode.data?.nodeType as NodeType | undefined
              if (targetType && isBranchingOutputNodeType(targetType)) {
                const parentId = targetNode.data?.parentNodeId as string | undefined
                if (parentId) {
                  targetNodeId = parentId
                  targetNode = nodes.find(n => n.id === parentId)
                }
              }
            }

            if (targetNode) {
              // Deselect current node and select target node
              setNodes((nds) =>
                nds.map((n) => ({
                  ...n,
                  selected: n.id === targetNodeId,
                }))
              )
              // Center view on target node
              const targetPos = targetNode.position
              const targetDims = {
                width: targetNode.width || 220,
                height: targetNode.height || 80,
              }
              const bounds = reactFlowWrapper.current?.getBoundingClientRect()
              if (bounds) {
                const zoom = reactFlowInstance.getViewport().zoom
                const centerX = targetPos.x + targetDims.width / 2
                const centerY = targetPos.y + targetDims.height / 2
                const viewportX = -centerX * zoom + bounds.width / 2
                const viewportY = -centerY * zoom + bounds.height / 2
                reactFlowInstance.setViewport({ x: viewportX, y: viewportY, zoom })
              }
            }
          }
        }
        return
      }
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
      // Check for Ctrl+D (or Cmd+D on Mac) for duplicate
      else if ((event.ctrlKey || event.metaKey) && event.key === 'd' && !event.shiftKey) {
        event.preventDefault()
        handleDuplicateNodes()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleUndo, handleRedo, handleDuplicateNodes, nodes, edges, reactFlowInstance, setNodes])

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
  }, [setNodes, saveHistoryBeforeChange, isLocked])

  // Update nodes with label click handler, make output nodes draggable for list param types, and set zIndex for proper layering
  // zIndex values come from nodeConfigs, but we adjust them to keep branching node sets together
  // Also recalculate labels dynamically based on module config
  // First pass: calculate consistent z-index "bands" for branching nodes and their outputs
  // Each branching node + its outputs form a contiguous band:
  // - branching node at bandZ
  // - its outputs at bandZ + 1
  // Bands themselves never interleave, so overlapping branching groups don't visually mingle.
  const branchingNodeZIndexes = new Map<string, number>()

  type BranchingDescriptor = {
    id: string
    selected: boolean
    baseZ: number
  }

  const branchingDescriptors: BranchingDescriptor[] = nodes
    .map((node) => {
      const nodeType = (node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType
      if (!isBranchingNodeType(nodeType)) return null
      const config = nodeConfigs[nodeType]
      const baseZ = node.zIndex ?? config?.zIndex ?? 10
      return {
        id: node.id,
        selected: !!node.selected,
        baseZ,
      }
    })
    .filter((d): d is BranchingDescriptor => d !== null)

  // Order bands so that:
  // - unselected branching groups are below selected ones
  // - within each group, preserve a stable order using baseZ then id
  branchingDescriptors.sort((a, b) => {
    if (a.selected !== b.selected) {
      return a.selected ? 1 : -1
    }
    if (a.baseZ !== b.baseZ) {
      return a.baseZ - b.baseZ
    }
    return a.id.localeCompare(b.id)
  })

  const BAND_SIZE = 10
  let currentBandBase = 20 // keep above default single nodes (zIndex 2) and edges (zIndex 2)

  branchingDescriptors.forEach((desc) => {
    const parentZ = currentBandBase
    branchingNodeZIndexes.set(desc.id, parentZ)
    currentBandBase += BAND_SIZE
  })

  // Keep track of the highest z-index in use so newly created nodes can appear on top
  if (currentBandBase > highestZIndexRef.current) {
    highestZIndexRef.current = currentBandBase
  }

  // Calculate highest z-index for dragged nodes
  const maxZIndexForDragging = Math.max(
    currentBandBase,
    highestZIndexRef.current,
    ...Array.from(branchingNodeZIndexes.values())
  )
  const draggingZIndex = maxZIndexForDragging + 1000 // Very high z-index for dragged nodes

  const nodesWithHandlers = nodes.map((node) => {
    const nodeType = (node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType
    const config = nodeConfigs[nodeType]
    // Default zIndex for non-branching nodes: use existing or config default
    let zIndex = node.zIndex ?? config?.zIndex ?? 2

    // If node is being dragged, give it highest z-index
    if (draggingNodeIdsRef.current.has(node.id)) {
      zIndex = draggingZIndex
    }
    // For branching nodes, use the band z-index we computed above
    else if (isBranchingNodeType(nodeType)) {
      const bandZ = branchingNodeZIndexes.get(node.id)
      if (bandZ !== undefined) {
        zIndex = bandZ
      }
    } else if (isBranchingOutputNodeType(nodeType) && node.data?.parentNodeId) {
      // Output nodes always sit just above their own parent, within the same band
      const parentId = node.data.parentNodeId
      const parentBandZ = branchingNodeZIndexes.get(parentId)
      const isParentDragging = draggingNodeIdsRef.current.has(parentId)

      if (isParentDragging) {
        // If parent is being dragged, output node should be above parent (above draggingZIndex)
        zIndex = draggingZIndex + 1
      } else if (parentBandZ !== undefined) {
        zIndex = parentBandZ + 1
      } else {
        // Fallback if parent band not found: keep them slightly above their parent/config base
        const parentNode = nodes.find((n) => n.id === parentId)
        const parentConfig = parentNode?.data?.nodeType ? nodeConfigs[parentNode.data.nodeType as NodeType] : undefined
        const fallbackParentZ = parentNode?.zIndex ?? parentConfig?.zIndex ?? 10
        zIndex = fallbackParentZ + 1
      }
    }

    // Update highestZIndexRef to track the maximum z-index in use (for future node creations)
    if (typeof zIndex === 'number' && zIndex > highestZIndexRef.current && !draggingNodeIdsRef.current.has(node.id)) {
      highestZIndexRef.current = zIndex
    }

    // Recalculate label based on module config
    const module = node.data?.moduleName ? modules.find((m) => m.name === node.data.moduleName) : undefined

    // For internal handling output nodes, use predefined labels from module config
    let calculatedLabel = getNodeLabel(module, node.data, nodeType, flowMetadata.stickers)
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
        // For sticker nodes, add sticker color to data
        ...(nodeType === 'sticker' && node.data?.params?.sticker_id
          ? {
            stickerColor: (() => {
              const stickerId = node.data.params.sticker_id
              const sticker = flowMetadata.stickers?.[stickerId]
              return sticker?.appearance?.color || '#fceaea'
            })(),
          }
          : {}),
      },
      draggable: (() => {
        // List param output nodes are draggable for reordering, others are not
        const nodeType = node.data?.nodeType as NodeType | undefined
        if (nodeType && isBranchingOutputNodeType(nodeType)) {
          return canOutputNodeBeDeleted(nodeType) // Only list param output nodes (deletable ones) are draggable
        }
        return true // All other nodes are draggable
      })(),
      selectable: (() => {
        // Output nodes that cannot be deleted should not be selectable
        const nodeType = node.data?.nodeType as NodeType | undefined
        if (nodeType && isBranchingOutputNodeType(nodeType)) {
          return canOutputNodeBeDeleted(nodeType) // Only selectable if deletable
        }
        return true
      })(),
      zIndex,
      // Add className to node for CSS animation targeting (ReactFlow applies this to the wrapper)
      className: isBranchingOutputNodeType(nodeType)
        ? 'branching-output-node-wrapper'
        : nodeType === 'sticker'
          ? 'sticker-node-wrapper'
          : undefined,
    }
  })

  return (
    <div className="app-root">
      <main
        className={`canvas-wrapper ${isBranchingDragging ? 'branching-drag-active' : ''} ${isDragging ? 'dragging-active' : ''}`}
        ref={reactFlowWrapper}
      >
        <Toolbar
          modules={modules}
          onNodeDragStart={onNodeDragStart}
          onSidebarNodeClick={onSidebarNodeClick}
          showMinimap={showMinimap}
          onMinimapToggle={() => setShowMinimap((prev) => !prev)}
          hasNodes={nodes.length > 0}
          onValidate={handleValidate}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          toolbarRef={toolbarRef}
          onOpenFlowConfigMenu={handleOpenFlowConfigMenu}
          onOpenJsonEditor={handleOpenJsonEditor}
          onOpenStickerMenu={handleOpenStickerMenu}
          onFitView={() => {
            if (reactFlowInstance) {
              // Get current nodes from ReactFlow instance to ensure we have the latest state
              const currentNodes = reactFlowInstance.getNodes()
              if (currentNodes.length > 0) {
                positionStartNodeAtDefaultView(reactFlowInstance, currentNodes, 300)
              }
            }
          }}
          onAutoLayout={() => {
            if (!nodes.length) return
            // Save history before applying automatic layout
            if (!isLocked) {
              saveHistoryBeforeChange('other')
            }
            // Disable animations during auto layout by adding a class
            reactFlowWrapper.current?.classList.add('auto-layout-active')
            setNodes((current) => {
              const { nodes: laidOut, edges: updatedEdges } = autoLayout(current, edges)

              // Update edges if handles were changed (check if any edge differs)
              const edgesChanged = updatedEdges.some((e, i) =>
                !edges[i] ||
                e.sourceHandle !== edges[i].sourceHandle ||
                e.targetHandle !== edges[i].targetHandle
              )
              if (edgesChanged) {
                setEdges(updatedEdges)
              }

              // Calculate bounds of laid out nodes
              if (laidOut.length > 0 && reactFlowInstance) {
                let minX = Infinity
                let minY = Infinity
                let maxX = -Infinity
                let maxY = -Infinity

                laidOut.forEach((node) => {
                  const width = node.width || 220
                  const height = node.height || 80
                  minX = Math.min(minX, node.position.x)
                  minY = Math.min(minY, node.position.y)
                  maxX = Math.max(maxX, node.position.x + width)
                  maxY = Math.max(maxY, node.position.y + height)
                })

                // Check if nodes are out of viewport
                const viewport = reactFlowInstance.getViewport()
                const wrapperBounds = reactFlowWrapper.current?.getBoundingClientRect()
                if (wrapperBounds) {
                  const viewportWidth = wrapperBounds.width / viewport.zoom
                  const viewportHeight = wrapperBounds.height / viewport.zoom
                  const viewportMinX = -viewport.x / viewport.zoom
                  const viewportMinY = -viewport.y / viewport.zoom
                  const viewportMaxX = viewportMinX + viewportWidth
                  const viewportMaxY = viewportMinY + viewportHeight

                  // If nodes are outside viewport, position view at 2/3 top-right
                  if (minX < viewportMinX || maxX > viewportMaxX || minY < viewportMinY || maxY > viewportMaxY) {
                    // Position at 2/3 top-right: center the layout at 2/3 of viewport
                    const targetViewportX = wrapperBounds.width * (2 / 3)
                    const targetViewportY = wrapperBounds.height * (2 / 3)
                    const centerX = (minX + maxX) / 2
                    const centerY = (minY + maxY) / 2
                    const newX = -centerX * viewport.zoom + targetViewportX
                    const newY = -centerY * viewport.zoom + targetViewportY

                    setTimeout(() => {
                      reactFlowInstance.setViewport({ x: newX, y: newY, zoom: viewport.zoom })
                    }, 0)
                  }
                }
              }

              return laidOut
            })
            // Re-enable animations after layout completes
            setTimeout(() => {
              reactFlowWrapper.current?.classList.remove('auto-layout-active')
            }, 100)
          }}
        />

        <FlowCanvas
          nodes={nodesWithHandlers}
          edges={edges.map((edge) => {
            // Keep all edges below nodes so dragged nodes always visually sit on top
            // Use a fixed low z-index for edges instead of matching the source node
            const edgeZIndex = 1

            const edgeWithZIndex = {
              ...edge,
              zIndex: edgeZIndex,
            }

            return edgeWithZIndex
          })}
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
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onSelectionStart={handleSelectionStart}
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

        {isStickerMenuOpen && reactFlowInstance && (
          <NodePopupMenu
            onClose={handleCloseStickerMenu}
            reactFlowWrapper={reactFlowWrapper}
            reactFlowInstance={reactFlowInstance}
            isFlowConfig={true}
            isStickerMenu={true}
            flowMetadata={flowMetadata}
            onFlowMetadataUpdate={handleFlowMetadataUpdate}
            toolbarRef={toolbarRef}
            title="Manage Stickers"
            initialPosition={stickerMenuPosition}
            onPositionChange={setStickerMenuPosition}
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

        {isJsonEditorOpen && (() => {
          const reactFlowData = exportFlowToJson(nodes, edges)
          const customMetadata: CustomFlowMetadata = {
            description: flowMetadata.description,
            language: flowMetadata.language,
            mchannels_bot_id: flowMetadata.mchannels_bot_id,
            name: flowMetadata.name,
            omnichannel_config: flowMetadata.omnichannel_config || {},
            stickers: flowMetadata.stickers || {},
          }
          const customData = translateReactFlowToCustom(reactFlowData, customMetadata)

          return (
            <JsonEditor
              initialJson={customData}
              initialReactFlowData={reactFlowData}
              initialMetadata={customMetadata}
              currentNodes={nodes}
              currentEdges={edges}
              currentMetadata={flowMetadata}
              onClose={handleCloseJsonEditor}
              onSave={handleSaveJsonEditor}
            />
          )
        })()}
      </main>
    </div>
  )
}

export default App
