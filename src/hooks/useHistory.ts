import { useState, useCallback } from 'react'
import { type Node, type Edge } from 'reactflow'

interface HistoryState {
  nodes: Node[]
  edges: Edge[]
}

export function useHistory() {
  const [past, setPast] = useState<HistoryState[]>([])
  const [present, setPresent] = useState<HistoryState | null>(null)
  const [future, setFuture] = useState<HistoryState[]>([])

  const saveState = useCallback((nodes: Node[], edges: Edge[]) => {
    // Deep clone the current state
    const currentState: HistoryState = {
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
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
