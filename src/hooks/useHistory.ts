import { useState, useCallback, useRef } from 'react'
import { type Node, type Edge } from 'reactflow'

export type HistoryChangeType = 'param' | 'other'

interface HistoryState {
  nodes: Node[]
  edges: Edge[]
  openMenuNodeId?: string | null
  lastChangeType?: HistoryChangeType
  menuPosition?: { x: number; y: number } | null
}

// Helper function to remove functions from node data before cloning
function sanitizeNodeData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data
  }
  
  const sanitized: any = {}
  for (const key in data) {
    const value = data[key]
    // Skip functions - they can't be cloned and will be re-added when rendering
    if (typeof value === 'function') {
      continue
    }
    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeNodeData(value)
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'object' && item !== null ? sanitizeNodeData(item) : item
      )
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// Helper function to sanitize nodes before cloning
function sanitizeNodesForHistory(nodes: Node[]): Node[] {
  return nodes.map(node => ({
    ...node,
    // Preserve position and positionAbsolute exactly as they are
    position: node.position ? { ...node.position } : { x: 0, y: 0 },
    positionAbsolute: node.positionAbsolute ? { ...node.positionAbsolute } : undefined,
    data: sanitizeNodeData(node.data),
  }))
}

export function useHistory(debounceDelay: number = 200) {
  const [past, setPast] = useState<HistoryState[]>([])
  const [present, setPresent] = useState<HistoryState | null>(null)
  const [future, setFuture] = useState<HistoryState[]>([])
  const timeoutRef = useRef<number | null>(null)
  const pendingStateRef = useRef<{ nodes: Node[]; edges: Edge[]; openMenuNodeId?: string | null; changeType?: HistoryChangeType; menuPosition?: { x: number; y: number } | null } | null>(null)

  const saveStateImmediate = useCallback((nodes: Node[], edges: Edge[], openMenuNodeId?: string | null, changeType?: HistoryChangeType, menuPosition?: { x: number; y: number } | null) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:saveState',message:'saveState called',data:{nodeCount:nodes.length,edgeCount:edges.length,edgeIds:edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'O'})}).catch(()=>{});
    // #endregion
    
    // Sanitize nodes to remove functions before cloning
    const sanitizedNodes = sanitizeNodesForHistory(nodes)
    
    // Deep clone the current state
    const clonedEdges = structuredClone(edges)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:saveState',message:'After cloning edges',data:{edgeCount:clonedEdges.length,edgeIds:clonedEdges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'O'})}).catch(()=>{});
    // #endregion
    
    const currentState: HistoryState = {
      nodes: structuredClone(sanitizedNodes),
      edges: clonedEdges,
      openMenuNodeId,
      lastChangeType: changeType,
      menuPosition: menuPosition ? { ...menuPosition } : null,
    }

    // Don't save if state is identical to present (avoid duplicate states)
    // BUT: Always allow saving if this is an immediate save (saveStateImmediate) - 
    // immediate saves are used for critical operations like deletion where we need to
    // save the state even if it's the same, so we can move present to past before the operation
    // We detect immediate saves by checking if this function was called directly (not via debounced saveState)
    // For now, we'll allow all immediate saves - the duplicate check only applies to debounced saves
    // This is safe because immediate saves are only used for critical operations (deletion, edge creation)
    const isImmediateSave = true // saveStateImmediate is always immediate
    if (!isImmediateSave && present &&
      present.nodes.length === currentState.nodes.length &&
      present.edges.length === currentState.edges.length &&
      present.openMenuNodeId === currentState.openMenuNodeId &&
      present.lastChangeType === currentState.lastChangeType) {
      // Check if nodes/edges are actually the same
      const nodesSame = present.nodes.every((n, i) => n.id === currentState.nodes[i]?.id)
      const edgesSame = present.edges.every((e, i) => e.id === currentState.edges[i]?.id)
      if (nodesSame && edgesSame) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:saveStateImmediate',message:'Skipping duplicate state',data:{presentNodeCount:present.nodes.length,presentEdgeCount:present.edges.length,currentNodeCount:currentState.nodes.length,currentEdgeCount:currentState.edges.length},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H7'})}).catch(()=>{});
        // #endregion
        return // Skip saving identical state
      }
    }

    // If there's a present state, move it to past
    if (present) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:saveStateImmediate',message:'Moving present to past',data:{presentNodeCount:present.nodes.length,presentEdgeCount:present.edges.length,presentEdgeIds:present.edges.map(e=>e.id),newStateNodeCount:currentState.nodes.length,newStateEdgeCount:currentState.edges.length,newStateEdgeIds:currentState.edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
      setPast((prev) => [...prev, present])
    }

    // Set new present state
    setPresent(currentState)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:saveStateImmediate',message:'Setting new present state',data:{nodeCount:currentState.nodes.length,edgeCount:currentState.edges.length,edgeIds:currentState.edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    // Clear future when new changes are made
    setFuture([])
  }, [present])

  const saveState = useCallback((nodes: Node[], edges: Edge[], openMenuNodeId?: string | null, changeType?: HistoryChangeType, menuPosition?: { x: number; y: number } | null) => {
    // Cancel previous timeout
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
    }
    
    // CRITICAL: Deep clone nodes and edges NOW (at call time) to preserve state before debounce delay
    // This ensures we capture the state as it was when saveState was called, not when debounce executes
    // The nodes/edges arrays passed in may be refs that get updated during the debounce delay
    const capturedNodes = nodes.map(node => ({
      ...node,
      position: node.position ? { ...node.position } : { x: 0, y: 0 },
      positionAbsolute: node.positionAbsolute ? { ...node.positionAbsolute } : undefined,
      data: node.data ? JSON.parse(JSON.stringify(node.data)) : node.data, // Deep clone data
    }))
    const capturedEdges = edges.map(edge => ({ ...edge }))
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:saveState',message:'Capturing state for debounced save',data:{nodeCount:capturedNodes.length,edgeCount:capturedEdges.length,edgeIds:capturedEdges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    
    // Store captured state (already cloned, safe to store)
    pendingStateRef.current = { nodes: capturedNodes, edges: capturedEdges, openMenuNodeId, changeType, menuPosition }
    
    // Schedule save after debounce delay
    timeoutRef.current = window.setTimeout(() => {
      if (pendingStateRef.current) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:saveState',message:'Executing debounced save',data:{nodeCount:pendingStateRef.current.nodes.length,edgeCount:pendingStateRef.current.edges.length,edgeIds:pendingStateRef.current.edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        saveStateImmediate(
          pendingStateRef.current.nodes,
          pendingStateRef.current.edges,
          pendingStateRef.current.openMenuNodeId,
          pendingStateRef.current.changeType,
          pendingStateRef.current.menuPosition
        )
        pendingStateRef.current = null
      }
      timeoutRef.current = null
    }, debounceDelay)
  }, [debounceDelay, saveStateImmediate])

  const flush = useCallback(() => {
    // Immediately save any pending state (for undo/redo)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:flush',message:'Flush called',data:{hasPendingState:!!pendingStateRef.current,hasTimeout:timeoutRef.current!==null,pendingNodeCount:pendingStateRef.current?.nodes.length||0,pendingEdgeCount:pendingStateRef.current?.edges.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (pendingStateRef.current) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:flush',message:'Flushing pending state',data:{nodeCount:pendingStateRef.current.nodes.length,edgeCount:pendingStateRef.current.edges.length,edgeIds:pendingStateRef.current.edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H6'})}).catch(()=>{});
      // #endregion
      saveStateImmediate(
        pendingStateRef.current.nodes,
        pendingStateRef.current.edges,
        pendingStateRef.current.openMenuNodeId,
        pendingStateRef.current.changeType,
        pendingStateRef.current.menuPosition
      )
      pendingStateRef.current = null
    }
  }, [saveStateImmediate])

  const undo = useCallback((): HistoryState | null => {
    if (past.length === 0 || !present) {
      return null
    }

    // Get the previous state
    const previousState = past[past.length - 1]
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:undo',message:'BEFORE undo - checking history stack',data:{pastLength:past.length,presentNodeCount:present.nodes.length,presentEdgeCount:present.edges.length,previousStateNodeCount:previousState.nodes.length,previousStateEdgeCount:previousState.edges.length,previousStateEdgeIds:previousState.edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    
    const newPast = past.slice(0, -1)

    // Move current present to future
    const newFuture = [present, ...future]
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:undo',message:'Moving present to future',data:{presentNodeCount:present.nodes.length,presentEdgeCount:present.edges.length,presentEdgeIds:present.edges.map(e=>e.id),futureLength:newFuture.length},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    // Update state
    setPast(newPast)
    setPresent(previousState)
    setFuture(newFuture)

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:undo',message:'AFTER undo - returning state',data:{returnedNodeCount:previousState.nodes.length,returnedEdgeCount:previousState.edges.length,returnedEdgeIds:previousState.edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'undo-debug',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    return previousState
  }, [past, present, future])

  const redo = useCallback((): HistoryState | null => {
    if (future.length === 0 || !present) {
      return null
    }

    // Get the next state
    const nextState = future[0]
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:redo',message:'BEFORE redo - checking history stack',data:{futureLength:future.length,presentNodeCount:present.nodes.length,presentEdgeCount:present.edges.length,nextStateNodeCount:nextState.nodes.length,nextStateEdgeCount:nextState.edges.length,nextStateEdgeIds:nextState.edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'redo-debug',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    const newFuture = future.slice(1)

    // Move current present to past
    const newPast = [...past, present]

    // Update state
    setPast(newPast)
    setPresent(nextState)
    setFuture(newFuture)

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5a596e7f-1806-4a03-ac28-6bebb51402b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useHistory.ts:redo',message:'AFTER redo - returning state',data:{returnedNodeCount:nextState.nodes.length,returnedEdgeCount:nextState.edges.length,returnedEdgeIds:nextState.edges.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'redo-debug',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

    return nextState
  }, [past, present, future])

  const canUndo = past.length > 0 && present !== null
  const canRedo = future.length > 0 && present !== null

  return {
    saveState,
    saveStateImmediate, // For cases where immediate save is needed
    flush, // Flush pending saves before undo/redo
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
