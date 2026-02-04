import { useState, useCallback } from 'react'
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
    data: sanitizeNodeData(node.data),
  }))
}

export function useHistory() {
  const [past, setPast] = useState<HistoryState[]>([])
  const [present, setPresent] = useState<HistoryState | null>(null)
  const [future, setFuture] = useState<HistoryState[]>([])

  const saveState = useCallback((nodes: Node[], edges: Edge[], openMenuNodeId?: string | null, changeType?: HistoryChangeType, menuPosition?: { x: number; y: number } | null) => {
    // Sanitize nodes to remove functions before cloning
    const sanitizedNodes = sanitizeNodesForHistory(nodes)
    
    // Deep clone the current state
    const currentState: HistoryState = {
      nodes: structuredClone(sanitizedNodes),
      edges: structuredClone(edges),
      openMenuNodeId,
      lastChangeType: changeType,
      menuPosition: menuPosition ? { ...menuPosition } : null,
    }

    // Don't save if state is identical to present (avoid duplicate states)
    // But allow saving empty state if it's the first state (so we can undo back to it)
    if (present &&
      present.nodes.length === currentState.nodes.length &&
      present.edges.length === currentState.edges.length &&
      present.openMenuNodeId === currentState.openMenuNodeId &&
      present.lastChangeType === currentState.lastChangeType) {
      // Check if nodes/edges are actually the same
      const nodesSame = present.nodes.every((n, i) => n.id === currentState.nodes[i]?.id)
      const edgesSame = present.edges.every((e, i) => e.id === currentState.edges[i]?.id)
      if (nodesSame && edgesSame) {
        return // Skip saving identical state
      }
    }

    // If there's a present state, move it to past
    if (present) {
      setPast((prev) => [...prev, present])
    }

    // Set new present state
    setPresent(currentState)

    // Clear future when new changes are made
    setFuture([])
  }, [present])

  const undo = useCallback((): HistoryState | null => {
    if (past.length === 0 || !present) {
      return null
    }

    // Get the previous state
    const previousState = past[past.length - 1]
    const newPast = past.slice(0, -1)

    // Move current present to future
    const newFuture = [present, ...future]

    // Update state
    setPast(newPast)
    setPresent(previousState)
    setFuture(newFuture)

    return previousState
  }, [past, present, future])

  const redo = useCallback((): HistoryState | null => {
    if (future.length === 0 || !present) {
      return null
    }

    // Get the next state
    const nextState = future[0]
    const newFuture = future.slice(1)

    // Move current present to past
    const newPast = [...past, present]

    // Update state
    setPast(newPast)
    setPresent(nextState)
    setFuture(newFuture)

    return nextState
  }, [past, present, future])

  const canUndo = past.length > 0 && present !== null
  const canRedo = future.length > 0 && present !== null

  return {
    saveState,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
