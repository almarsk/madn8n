import { useRef, useCallback } from 'react'
import type { ReactFlowInstance, Node } from 'reactflow'
import type { MenuState, MenuActions } from './useMenuState'
import { useHistory } from './useHistory'

export interface HistoryOperations {
  handleUndo: () => void
  handleRedo: () => void
  isRestoringStateRef: React.MutableRefObject<boolean>
}

export function useHistoryOperations(
  history: ReturnType<typeof useHistory>,
  isLocked: boolean,
  reactFlowInstance: ReactFlowInstance | null,
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: any[]) => void,
  onConnectEnd: (event: MouseEvent) => void,
  viewportState: { setViewport: (viewport: { x: number; y: number; zoom: number }) => void },
  menuState: MenuState & MenuActions,
  isRestoringStateRef?: React.MutableRefObject<boolean>
): HistoryOperations {
  const internalRef = useRef(false)
  const isRestoringStateRefToUse = isRestoringStateRef || internalRef

  const handleUndo = useCallback(() => {
    if (!history.canUndo || isLocked) return

    // Flush any pending history saves before undoing
    history.flush()

    // Preserve current viewport to prevent view from moving
    const currentViewport = reactFlowInstance?.getViewport()

      const previousState = history.undo()
      if (previousState) {
        isRestoringStateRefToUse.current = true

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistoryOperations.ts:handleUndo',message:'Previous state from history',data:{nodeCount:previousState.nodes.length,edgeCount:previousState.edges.length,nodePositions:previousState.nodes.map(n=>({id:n.id,x:n.position?.x,y:n.position?.y}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'J'})}).catch(()=>{});
        // #endregion

        // Clear connectingFrom state from all nodes to prevent handles from staying visible
        // Explicitly preserve position and positionAbsolute to ensure nodes are restored to their exact original positions
        const cleanedNodes = previousState.nodes.map((node: Node) => ({
          ...node,
          position: node.position ? { ...node.position } : { x: 0, y: 0 },
          // Preserve positionAbsolute if it exists (ReactFlow uses this for exact positioning)
          positionAbsolute: node.positionAbsolute ? { ...node.positionAbsolute } : undefined,
          data: {
            ...node.data,
            connectingFrom: null,
          },
        }))

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistoryOperations.ts:handleUndo',message:'Restoring nodes from history',data:{nodeCount:cleanedNodes.length,edgeCount:previousState.edges.length,nodePositions:cleanedNodes.map(n=>({id:n.id,x:n.position?.x,y:n.position?.y}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      
      // Restore nodes and edges together atomically
      // Deep clone edges to ensure they're properly restored
      const restoredEdges = previousState.edges.map(edge => ({ ...edge }))
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistoryOperations.ts:handleUndo',message:'BEFORE setting nodes/edges',data:{nodeCount:cleanedNodes.length,edgeCount:restoredEdges.length,hasReactFlowInstance:!!reactFlowInstance,isRestoringFlag:isRestoringStateRefToUse.current},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      // Use React state setters directly to ensure React components re-render
      // Also update ReactFlow instance for internal consistency
      setNodes(cleanedNodes)
      setEdges(restoredEdges)
      
      // Also update ReactFlow instance if available (for internal state sync)
      if (reactFlowInstance) {
        reactFlowInstance.setNodes(cleanedNodes)
        reactFlowInstance.setEdges(restoredEdges)
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistoryOperations.ts:handleUndo',message:'AFTER setting nodes/edges',data:{nodeCount:cleanedNodes.length,edgeCount:restoredEdges.length},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      // Restore viewport to prevent view from moving
      if (currentViewport && reactFlowInstance) {
        requestAnimationFrame(() => {
          viewportState.setViewport(currentViewport)
        })
      }

      // Clear ReactFlow's internal connection state to hide any visible handles
      // Use a small delay to ensure ReactFlow has processed the state update
      setTimeout(() => {
        onConnectEnd(new MouseEvent('mouseup'))
      }, 0)

      // Close menu on undo (params are not in history anymore)
      menuState.setOpenMenuNodeId(null)
      menuState.setMenuPosition(null)

      // Reset flag after ReactFlow has processed ALL state changes from restoration
      // Use a longer delay to ensure all changes (including dimensions, positions, etc.) have been processed
      // This prevents history from being saved during restoration
      setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistoryOperations.ts:handleUndo',message:'Resetting isRestoringStateRef flag',data:{wasRestoring:isRestoringStateRefToUse.current},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H2'})}).catch(()=>{});
            // #endregion
            isRestoringStateRefToUse.current = false
          })
        })
      }, 100) // 100ms delay to ensure all restoration changes are processed
    }
  }, [history, isLocked, setNodes, setEdges, onConnectEnd, reactFlowInstance, viewportState, menuState])

  const handleRedo = useCallback(() => {
    if (!history.canRedo || isLocked) return

    // Flush any pending history saves before redoing
    history.flush()

    // Preserve current viewport to prevent view from moving
    const currentViewport = reactFlowInstance?.getViewport()

    const nextState = history.redo()
    if (nextState) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistoryOperations.ts:handleRedo',message:'Next state from history',data:{nodeCount:nextState.nodes.length,edgeCount:nextState.edges.length,nodeIds:nextState.nodes.map(n=>n.id),edgeIds:nextState.edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'redo-debug',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      isRestoringStateRefToUse.current = true

      // Clear connectingFrom state from all nodes to prevent handles from staying visible
      // Explicitly preserve position and positionAbsolute to ensure nodes are restored to their exact original positions
      const cleanedNodes = nextState.nodes.map((node: Node) => ({
        ...node,
        position: node.position ? { ...node.position } : { x: 0, y: 0 },
        // Preserve positionAbsolute if it exists (ReactFlow uses this for exact positioning)
        positionAbsolute: node.positionAbsolute ? { ...node.positionAbsolute } : undefined,
        data: {
          ...node.data,
          connectingFrom: null,
        },
      }))

      // Restore nodes and edges together atomically
      // Deep clone edges to ensure they're properly restored
      const restoredEdges = nextState.edges.map(edge => ({ ...edge }))
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistoryOperations.ts:handleRedo',message:'BEFORE setting nodes/edges',data:{nodeCount:cleanedNodes.length,edgeCount:restoredEdges.length,hasReactFlowInstance:!!reactFlowInstance,isRestoringFlag:isRestoringStateRefToUse.current,nodeIds:cleanedNodes.map(n=>n.id),edgeIds:restoredEdges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'redo-debug',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      // Use React state setters directly to ensure React components re-render
      // Also update ReactFlow instance for internal consistency
      setNodes(cleanedNodes)
      setEdges(restoredEdges)
      
      // Also update ReactFlow instance if available (for internal state sync)
      if (reactFlowInstance) {
        reactFlowInstance.setNodes(cleanedNodes)
        reactFlowInstance.setEdges(restoredEdges)
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistoryOperations.ts:handleRedo',message:'AFTER setting nodes/edges',data:{nodeCount:cleanedNodes.length,edgeCount:restoredEdges.length},timestamp:Date.now(),sessionId:'debug-session',runId:'redo-debug',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      // Restore viewport to prevent view from moving
      if (currentViewport && reactFlowInstance) {
        requestAnimationFrame(() => {
          viewportState.setViewport(currentViewport)
        })
      }

      // Clear ReactFlow's internal connection state to hide any visible handles
      // Use a small delay to ensure ReactFlow has processed the state update
      setTimeout(() => {
        onConnectEnd(new MouseEvent('mouseup'))
      }, 0)

      // Close menu on redo (params are not in history anymore)
      menuState.setOpenMenuNodeId(null)
      menuState.setMenuPosition(null)

      // Reset flag after ReactFlow has processed ALL state changes from restoration
      // Use a longer delay to ensure all changes (including dimensions, positions, etc.) have been processed
      // This prevents history from being saved during restoration
      setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isRestoringStateRefToUse.current = false
          })
        })
      }, 100) // 100ms delay to ensure all restoration changes are processed
    }
  }, [history, isLocked, setNodes, setEdges, onConnectEnd, reactFlowInstance, viewportState, menuState])

  return {
    handleUndo,
    handleRedo,
    isRestoringStateRef: isRestoringStateRefToUse,
  }
}
