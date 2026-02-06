import { useCallback, useRef, useState, useEffect } from 'react'
import { ReactFlowInstance, useEdgesState, useNodesState, type Node } from 'reactflow'
import './App.css'
import modules from './modules'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, canOutputNodeBeDeleted } from './nodeConfigs'
import { useHistory } from './hooks/useHistory'
import { useValidation } from './hooks/useValidation'
import { repositionOutputNodes } from './utils/branchingNodeHelpers'
import { removeOutputNodes, getOutputNodesToRemoveForBranchingNodes } from './utils/branchingNodeOperations'
import { isStartModule } from './utils/moduleHelpers'
import { exportFlowToJson } from './utils/exportHelpers'
import { translateReactFlowToCustom, type CustomFlowMetadata } from './utils/translationHelpers'

import Toolbar from './components/Toolbar'
import FlowCanvas from './components/FlowCanvas'
import Minimap from './components/Minimap'
import NodePopupMenu from './components/NodePopupMenu'
import ValidationBanner from './components/ValidationBanner'
import JsonEditor from './components/JsonEditor'
import { useConnectionHandlers } from './hooks/useConnectionHandlers'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useMenuState } from './hooks/useMenuState'
import { useJsonEditor } from './hooks/useJsonEditor'
import { useViewport } from './hooks/useViewport'
import { useNodeCreation } from './hooks/useNodeCreation'
import { useNodeProperties } from './hooks/useNodeProperties'
import { useHistoryOperations } from './hooks/useHistoryOperations'
import { useBranchingOperations } from './hooks/useBranchingOperations'
import { useNodeManipulation } from './hooks/useNodeManipulation'
import { useAutoLayout } from './hooks/useAutoLayout'

const initialNodes: Node[] = []
const initialEdges: any[] = []

function App() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [isLocked] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
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

  // Track when a branching node is being dragged so we can disable
  // smooth transitions for its output nodes (prevents them from lagging)
  const [isBranchingDragging, setIsBranchingDragging] = useState(false)

  // Track whether any node is being dragged (for global edge/node layering)
  const [isDragging, setIsDragging] = useState(false)

  // Track which nodes are currently being dragged to give them highest z-index
  const draggingNodeIdsRef = useRef<Set<string>>(new Set())

  // Track when we're in the middle of a programmatic deletion (not from ReactFlow's built-in delete)
  // This prevents handleEdgesChange/handleNodesChange from saving history during our explicit deletion
  const isProgrammaticDeletionRef = useRef(false)

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const history = useHistory()

  // Create isRestoringStateRef early so it can be used in callbacks
  const isRestoringStateRef = useRef(false)

  // Track highest z-index to ensure newly created nodes appear on top
  const highestZIndexRef = useRef(100)

  // Menu state management
  const menuState = useMenuState(nodes, setNodes)

  // Use refs to always get current state for history (avoid stale closures)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const openMenuNodeIdRef = useRef(menuState.openMenuNodeId)
  const menuPositionRef = useRef(menuState.menuPosition)

  // Keep refs in sync with state
  useEffect(() => {
    nodesRef.current = nodes
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:nodes-effect', message: 'Nodes state updated', data: { nodeCount: nodes.length, nodeIds: nodes.map(n => n.id), nodePositions: nodes.map(n => ({ id: n.id, x: n.position?.x, y: n.position?.y })) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'undo-debug', hypothesisId: 'H1' }) }).catch(() => { });
    // #endregion
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:edges-effect', message: 'Edges state updated', data: { edgeCount: edges.length, edgeIds: edges.map(e => e.id) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'undo-debug', hypothesisId: 'H1' }) }).catch(() => { });
    // #endregion
  }, [edges])
  useEffect(() => {
    openMenuNodeIdRef.current = menuState.openMenuNodeId
  }, [menuState.openMenuNodeId])
  useEffect(() => {
    menuPositionRef.current = menuState.menuPosition
  }, [menuState.menuPosition])


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

  // Helper to save history before state changes
  // IMPORTANT: Capture current state at call time, not via refs (refs update during debounce delay)
  // Now uses debounced save (0.2s delay) to automatically group related operations
  const saveHistoryBeforeChange = useCallback((changeType: 'param' | 'other' = 'other') => {
    // Don't save history during undo/redo operations
    if (isRestoringStateRef.current) {
      return
    }
    if (!isLocked) {
      // Capture current state at call time (not from refs which may update during debounce)
      const currentNodes = nodesRef.current
      const currentEdges = edgesRef.current
      const currentMenuNodeId = openMenuNodeIdRef.current
      const currentMenuPosition = menuPositionRef.current

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:saveHistoryBeforeChange', message: 'Saving history (captured at call time)', data: { nodeCount: currentNodes.length, edgeCount: currentEdges.length, edgeIds: currentEdges.map(e => e.id) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'undo-debug', hypothesisId: 'H5' }) }).catch(() => { });
      // #endregion

      history.saveState(
        currentNodes,
        currentEdges,
        currentMenuNodeId,
        changeType,
        currentMenuPosition
      )
    }
  }, [history, isLocked, openMenuNodeIdRef, menuPositionRef, isRestoringStateRef, nodesRef, edgesRef])

  // Viewport management
  const viewportState = useViewport(reactFlowWrapper, setReactFlowInstance, setNodes)

  // JSON editor state
  const jsonEditorState = useJsonEditor(
    nodes,
    edges,
    flowMetadata,
    setNodes,
    setEdges,
    saveHistoryBeforeChange,
    reactFlowInstance,
    (metadata: CustomFlowMetadata) => {
      setFlowMetadata({
        ...metadata,
        omnichannel_config: metadata.omnichannel_config || {},
        stickers: metadata.stickers || {},
      })
    }
  )

  // Node creation handlers
  const nodeCreation = useNodeCreation(
    reactFlowWrapper,
    reactFlowInstance,
    nodes,
    setNodes,
    highestZIndexRef,
    saveHistoryBeforeChange,
    isLocked,
    menuState.setOpenMenuNodeId,
    menuState.setMenuPosition
  )

  // Wrap onConnect to save history before adding edge
  // Use IMMEDIATE save (not debounced) to ensure we capture state before edge is added
  const onConnect = useCallback(
    (params: any) => {
      if (!isLocked && !isRestoringStateRef.current) {
        // Use current state directly from closure (not refs) to ensure we have the latest state
        history.saveStateImmediate(
          nodes,
          edges,
          openMenuNodeIdRef.current,
          'other',
          menuPositionRef.current
        )
      }
      onConnectOriginal(params)
    },
    [onConnectOriginal, history, nodes, edges, isLocked, isRestoringStateRef, openMenuNodeIdRef, menuPositionRef]
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
        history.saveState(nodes, edges, menuState.openMenuNodeId, 'other', menuState.menuPosition)
      }
    }, 300) // 300ms debounce
  }, [nodes, edges, history, isLocked, menuState.openMenuNodeId, menuState.menuPosition])

  // Node creation handlers are now in nodeCreation hook
  const { onDragOver, onDrop, onNodeDragStart, onSidebarNodeClick } = nodeCreation

  // Viewport handlers are now in viewportState hook
  const { onMove, onInit, positionStartNodeAtDefaultView } = viewportState

  // Branching operations (onNodeDrag, onNodeDragStop, handleAddOutput) are now in useBranchingOperations hook
  const { onNodeDrag, onNodeDragStop, handleAddOutput } = useBranchingOperations(
    nodes,
    setNodes,
    saveHistoryBeforeChange,
    isLocked,
    highestZIndexRef
  )

  // Viewport handlers (positionStartNodeAtDefaultView, onInit) are now in viewportState hook - removed duplicates

  // Auto layout handler
  const { handleAutoLayout } = useAutoLayout({
    nodes,
    edges,
    setNodes,
    setEdges,
    reactFlowInstance,
    reactFlowWrapper,
    isLocked,
    saveHistoryBeforeChange,
    viewportState,
  })

  // Wrap onEdgesChange to maintain compatibility and save history
  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      // Save history for edge changes - use IMMEDIATE save to ensure we capture state before edge is added
      const hasEdgeCreation = changes.some((change) => change.type === 'add')
      if (hasEdgeCreation && !isLocked && !isRestoringStateRef.current) {
        // Use current state directly from closure (not refs) to ensure we have the latest state
        history.saveStateImmediate(
          nodes,
          edges,
          openMenuNodeIdRef.current,
          'other',
          menuPositionRef.current
        )
      }

      // When edges are removed, clear connection state to fix connection validation
      const hasRemovals = changes.some((change) => change.type === 'remove')
      if (hasRemovals) {
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            data: {
              ...node.data,
              connectingFrom: null,
            },
          }))
        )
      }

      onEdgesChange(changes)
    },
    [onEdgesChange, history, nodes, edges, isLocked, isRestoringStateRef, openMenuNodeIdRef, menuPositionRef, setNodes]
  )

  // Wrap onNodesChange to clean up output nodes when branching node is deleted
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:handleNodesChange', message: 'handleNodesChange ENTRY', data: { changeCount: changes.length, changeTypes: changes.map(c => c.type), isRestoring: isRestoringStateRef.current, currentNodeCount: nodes.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'undo-debug', hypothesisId: 'H2' }) }).catch(() => { });
      // #endregion

      // Filter out deletions of non-deletable output nodes and start nodes before processing
      const filteredChanges = changes.filter((change) => {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          const moduleName = node?.data?.moduleName

          // Prevent deletion of start node
          if (isStartModule(moduleName)) {
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
        // Close toolbar menus when any node starts being dragged
        if (menuState.toolbarMenuOpen) {
          menuState.setToolbarMenuOpen(null)
          menuState.setToolbarMenuPosition(null)
        }
        // Close node menu if a different node is being dragged
        if (menuState.openMenuNodeId) {
          const draggedNodeId = dragStartChanges[0].id
          // Only close if a different node is being dragged
          if (draggedNodeId !== menuState.openMenuNodeId) {
            menuState.setOpenMenuNodeId(null)
            menuState.setMenuPosition(null)
          }
        }
      }

      // Save history for changes (debounced, will automatically group related operations)
      // But only if there are actual changes after filtering
      const hasPositionChanges = filteredChanges.some((change) => change.type === 'position')
      const hasNonPositionChanges = filteredChanges.some((change) => change.type !== 'position' && change.type !== 'select' && change.type !== 'remove')
      const hasRemoveChanges = filteredChanges.some((change) => change.type === 'remove')

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:handleNodesChange', message: 'Checking history save conditions', data: { isRestoring: isRestoringStateRef.current, hasPositionChanges, hasNonPositionChanges, hasRemoveChanges, isLocked }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'undo-debug', hypothesisId: 'H2' }) }).catch(() => { });
      // #endregion

      // CRITICAL: Save history BEFORE processing remove changes (deletions)
      // This ensures we capture the state before nodes/edges are deleted
      if (!isRestoringStateRef.current) {
        if (hasRemoveChanges && !isLocked) {
          // Flush any pending history saves first to ensure we have the latest state
          history.flush()
          // Use IMMEDIATE save (not debounced) for deletion to ensure state is saved before deletion processes
          // Use current state directly from closure (not refs) to ensure we have the latest state
          // This is critical because refs are updated in useEffect which runs AFTER render
          history.saveStateImmediate(
            nodes,
            edges,
            openMenuNodeIdRef.current,
            'other',
            menuPositionRef.current
          )
        } else if (hasNonPositionChanges && !isLocked) {
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
        const { nodes: updatedNodes } = removeOutputNodes(nodes, removedOutputNodeIds, parentNodeIdsToUpdate)
        setNodes(updatedNodes)

        // Remove edges connected to deleted output nodes
        // Flag is already set, so handleEdgesChange won't save history
        setEdges((eds) => eds.filter((e) => !removedOutputNodeIds.has(e.source) && !removedOutputNodeIds.has(e.target)))
      }

      // If branching nodes are being removed, also remove their output nodes
      // Note: Output nodes should already be in filteredChanges from the earlier logic,
      // but we handle it here as a fallback and to remove edges
      if (removedBranchingNodeIds.size > 0) {
        // Collect all output node IDs that should be removed
        const outputNodeIdsToRemove = getOutputNodesToRemoveForBranchingNodes(nodes, removedBranchingNodeIds)

        // Ensure output nodes are in the deletion batch
        outputNodeIdsToRemove.forEach((outputNodeId) => {
          if (!filteredChanges.some((c) => c.type === 'remove' && c.id === outputNodeId)) {
            filteredChanges.push({
              id: outputNodeId,
              type: 'remove',
            })
          }
        })

        // Remove edges connected to these output nodes
        // Flag is already set, so handleEdgesChange won't save history
        if (outputNodeIdsToRemove.size > 0) {
          setEdges((eds) => eds.filter((e) => !outputNodeIdsToRemove.has(e.source) && !outputNodeIdsToRemove.has(e.target)))
        }
      }

      // If branching nodes are being moved, update their output node positions
      // Skip this during restoration to preserve exact positions from history
      if (movedBranchingNodeIds.size > 0 && !isRestoringStateRef.current) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:handleNodesChange', message: 'Repositioning branching nodes', data: { movedBranchingNodeIds: Array.from(movedBranchingNodeIds), isRestoring: isRestoringStateRef.current }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'undo-debug', hypothesisId: 'H4' }) }).catch(() => { });
        // #endregion
        setNodes((nds) => {
          let updatedNodes = nds
          movedBranchingNodeIds.forEach((branchingNodeId) => {
            updatedNodes = repositionOutputNodes(updatedNodes, branchingNodeId)
          })
          return updatedNodes
        })
      } else if (movedBranchingNodeIds.size > 0 && isRestoringStateRef.current) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:handleNodesChange', message: 'SKIPPED repositioning during restoration', data: { movedBranchingNodeIds: Array.from(movedBranchingNodeIds), isRestoring: isRestoringStateRef.current }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'undo-debug', hypothesisId: 'H4' }) }).catch(() => { });
        // #endregion
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:handleNodesChange', message: 'BEFORE calling onNodesChange', data: { filteredChangeCount: filteredChanges.length, isRestoring: isRestoringStateRef.current }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'undo-debug', hypothesisId: 'H2' }) }).catch(() => { });
      // #endregion

      onNodesChange(filteredChanges)

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:handleNodesChange', message: 'AFTER calling onNodesChange', data: { isRestoring: isRestoringStateRef.current }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'undo-debug', hypothesisId: 'H2' }) }).catch(() => { });
      // #endregion
    },
    [nodes, onNodesChange, setNodes, setEdges, saveHistoryBeforeChange, saveHistoryForPositionChange, isLocked, menuState.toolbarMenuOpen, menuState.openMenuNodeId, isRestoringStateRef]
  )

  // Menu handlers are now in menuState hook - removed duplicates

  const handleFlowMetadataUpdate = useCallback((metadata: CustomFlowMetadata) => {
    setFlowMetadata({
      ...metadata,
      omnichannel_config: metadata.omnichannel_config || {},
      stickers: metadata.stickers || {},
    })
  }, [])

  // Node manipulation handlers (handleNodeDataUpdate, handleDeleteNode, handleDuplicateNodes) are now in useNodeManipulation hook
  const { handleNodeDataUpdate, handleDeleteNode, handleDuplicateNodes } = useNodeManipulation(
    nodes,
    edges,
    setNodes,
    setEdges,
    reactFlowInstance,
    viewportState,
    saveHistoryBeforeChange,
    isLocked,
    menuState,
    highestZIndexRef
  )

  // History operations (undo/redo) are now in useHistoryOperations hook
  const { handleUndo, handleRedo } = useHistoryOperations(
    history,
    isLocked,
    reactFlowInstance,
    setNodes,
    setEdges,
    onConnectEnd,
    viewportState,
    menuState,
    isRestoringStateRef
  )

  // Handle keyboard delete of selected nodes - handleDeleteNode now handles history saving atomically
  const handleDeleteSelectedNodes = useCallback(() => {
    if (isLocked) return

    const selectedNodes = nodes.filter((n) => n.selected)
    if (selectedNodes.length === 0) return

    // Filter out nodes that shouldn't be deleted
    const nodesToDelete = selectedNodes.filter((node) => {
      const nodeType = node.data?.nodeType as NodeType | undefined
      const moduleName = node.data?.moduleName

      // Prevent deletion of start node
      if (isStartModule(moduleName)) {
        return false
      }

      // Prevent deletion of non-deletable output nodes
      if (nodeType && isBranchingOutputNodeType(nodeType)) {
        if (!canOutputNodeBeDeleted(nodeType)) {
          return false
        }
      }

      return true
    })

    if (nodesToDelete.length === 0) return

    // Collect all edges that will be deleted (for atomic operation)
    const edgesToDelete = new Set<string>()
    nodesToDelete.forEach((node) => {
      // Collect edges connected to this node
      edges.forEach((edge) => {
        if (edge.source === node.id || edge.target === node.id) {
          edgesToDelete.add(edge.id)
        }
      })

      // If it's a branching node, collect edges connected to its output nodes
      const nodeType = node.data?.nodeType as NodeType | undefined
      if (nodeType && isBranchingNodeType(nodeType)) {
        const outputNodeIds = nodes
          .filter((n) => {
            const nType = n.data?.nodeType as NodeType | undefined
            return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === node.id
          })
          .map((n) => n.id)

        edges.forEach((edge) => {
          if (outputNodeIds.includes(edge.source) || outputNodeIds.includes(edge.target)) {
            edgesToDelete.add(edge.id)
          }
        })
      }
    })

    // NOTE: History is now saved in handleNodesChange when 'remove' change is detected
    // This ensures history is saved BEFORE the deletion is processed
    // No need to save here as it would be redundant and could cause timing issues

    // Delete all nodes (handleDeleteNode handles individual node logic and edge deletion)
    // History will be saved in handleNodesChange when the 'remove' changes are processed
    nodesToDelete.forEach((node) => {
      handleDeleteNode(node.id)
    })
  }, [nodes, edges, isLocked, saveHistoryBeforeChange, handleDeleteNode, isRestoringStateRef])

  // handleDeleteNode is now in useNodeManipulation hook - removed duplicate

  const { validate } = useValidation(nodes, edges)

  const handleValidate = useCallback(() => {
    const result = validate()
    setValidationStatus(result)
  }, [validate])

  const handleDismissValidation = useCallback(() => {
    setValidationStatus({ isValid: null, message: '' })
  }, [])

  // JSON editor handlers are now in jsonEditorState hook - removed duplicates

  // handleDuplicateNodes is now in useNodeManipulation hook - removed duplicate

  // Keyboard shortcuts for undo/redo, duplicate, navigation, and delete
  useKeyboardShortcuts({
    nodes,
    edges,
    reactFlowInstance,
    setNodes,
    setEdges,
    reactFlowWrapper,
    handleUndo,
    handleRedo,
    handleDuplicateNodes,
    handleDeleteSelectedNodes,
    isLocked,
  })

  // handleAddOutput is now in useBranchingOperations hook - removed duplicate

  // Node properties (z-index, labels, draggable, selectable) are now in useNodeProperties hook
  const nodesWithHandlers = useNodeProperties({
    nodes,
    flowMetadata,
    draggingNodeIds: draggingNodeIdsRef.current,
    handleLabelClick: menuState.handleLabelClick,
    highestZIndexRef,
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
          onOpenFlowConfigMenu={menuState.handleOpenFlowConfigMenu}
          onOpenJsonEditor={jsonEditorState.handleOpenJsonEditor}
          onOpenStickerMenu={menuState.handleOpenStickerMenu}
          onFitView={() => {
            if (reactFlowInstance) {
              // Get current nodes from ReactFlow instance to ensure we have the latest state
              const currentNodes = reactFlowInstance.getNodes()
              if (currentNodes.length > 0) {
                positionStartNodeAtDefaultView(reactFlowInstance, currentNodes, 300)
              }
            }
          }}
          onAutoLayout={handleAutoLayout}
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
          onPaneClick={menuState.handlePaneClick}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onSelectionStart={menuState.handleSelectionStart}
          isLocked={isLocked}
          viewport={viewportState.viewport}
        />

        {menuState.openMenuNodeId && reactFlowInstance && (() => {
          const menuNode = nodes.find((n) => n.id === menuState.openMenuNodeId)
          if (!menuNode) return null

          return (
            <NodePopupMenu
              node={menuNode}
              onClose={menuState.handleCloseMenu}
              reactFlowWrapper={reactFlowWrapper}
              reactFlowInstance={reactFlowInstance}
              onNodeDataUpdate={handleNodeDataUpdate}
              onAddOutput={menuNode.data?.nodeType && isBranchingNodeType(menuNode.data.nodeType as NodeType) ? handleAddOutput : undefined}
              onDeleteNode={handleDeleteNode}
              initialPosition={menuState.menuPosition}
              onPositionChange={menuState.handleMenuPositionChange}
              // Provide stickers so sticker nodes can render the sticker dropdown
              stickers={flowMetadata.stickers}
              onOpenStickerMenu={menuState.handleOpenStickerMenu}
            />
          )
        })()}

        {menuState.toolbarMenuOpen === 'mainConfig' && reactFlowInstance && (
          <NodePopupMenu
            onClose={menuState.handleCloseFlowConfigMenu}
            reactFlowWrapper={reactFlowWrapper}
            reactFlowInstance={reactFlowInstance}
            isFlowConfig={true}
            flowMetadata={flowMetadata}
            onFlowMetadataUpdate={handleFlowMetadataUpdate}
            toolbarRef={toolbarRef}
            title="Flow Configuration"
            initialPosition={menuState.toolbarMenuPosition}
            onPositionChange={menuState.setToolbarMenuPosition}
            toolbarMenuSize={menuState.toolbarMenuSize}
            onToolbarMenuSizeChange={menuState.setToolbarMenuSize}
          />
        )}

        {menuState.toolbarMenuOpen === 'stickers' && reactFlowInstance && (
          <NodePopupMenu
            onClose={menuState.handleCloseStickerMenu}
            reactFlowWrapper={reactFlowWrapper}
            reactFlowInstance={reactFlowInstance}
            isFlowConfig={true}
            isStickerMenu={true}
            flowMetadata={flowMetadata}
            onFlowMetadataUpdate={handleFlowMetadataUpdate}
            toolbarRef={toolbarRef}
            title="Manage Stickers"
            initialPosition={menuState.toolbarMenuPosition}
            onPositionChange={menuState.setToolbarMenuPosition}
            toolbarMenuSize={menuState.toolbarMenuSize}
            onToolbarMenuSizeChange={menuState.setToolbarMenuSize}
          />
        )}

        {showMinimap && reactFlowInstance && (
          <Minimap
            nodes={nodes}
            edges={edges}
            reactFlowInstance={reactFlowInstance}
            viewport={viewportState.viewport}
            reactFlowWrapper={reactFlowWrapper}
          />
        )}

        <ValidationBanner
          isValid={validationStatus.isValid}
          message={validationStatus.message}
          onDismiss={handleDismissValidation}
        />

        {jsonEditorState.isJsonEditorOpen && (() => {
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
              onClose={jsonEditorState.handleCloseJsonEditor}
              onSave={jsonEditorState.handleSaveJsonEditor}
            />
          )
        })()}
      </main>
    </div>
  )
}

export default App
