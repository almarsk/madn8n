# History Tracking Simplification - Ideation

## Current Approach
The current history system requires manual tracking of when to save state:
- Manual calls to `saveHistoryBeforeChange()` before operations
- Special handling in `handleNodesChange` to detect 'remove' changes
- Different save strategies for different operations (immediate vs debounced)
- Complex logic to determine when history should be saved

## Proposed Simplified Approach

### Core Concept
**Automatically track all changes to nodes and edges with debouncing, and recognize undo/redo operations to skip saving.**

### Implementation Strategy

1. **Single Source of Truth: `useHistory` hook**
   - Watch `nodes` and `edges` state directly
   - Use `useEffect` with debouncing to automatically save state
   - No manual `saveHistoryBeforeChange()` calls needed

2. **Debouncing Logic**
   ```typescript
   useEffect(() => {
     // Skip if this change is from undo/redo
     if (isUndoRedoOperationRef.current) {
       isUndoRedoOperationRef.current = false
       return
     }
     
     // Debounce the save
     const timeout = setTimeout(() => {
       saveState(nodes, edges)
     }, 200)
     
     return () => clearTimeout(timeout)
   }, [nodes, edges])
   ```

3. **Undo/Redo Recognition**
   - Use a ref flag: `isUndoRedoOperationRef`
   - Set flag to `true` before applying undo/redo state
   - The effect will skip saving when flag is true
   - Reset flag after effect runs

4. **Benefits**
   - **Simpler**: No manual save calls scattered throughout code
   - **More reliable**: Can't forget to save history
   - **Automatic**: Works for any change to nodes/edges
   - **Less code**: Remove all `saveHistoryBeforeChange()` calls

5. **Potential Challenges**
   - **Performance**: Deep comparison of nodes/edges on every change
     - Solution: Use a shallow comparison first, only deep clone when needed
   - **Edge cases**: Some operations might need immediate saves (e.g., deletion)
     - Solution: Keep `saveStateImmediate` for critical operations, but make it optional
   - **Menu state**: Currently tracks `openMenuNodeId` and `menuPosition` in history
     - Solution: Either remove from history (simpler) or track separately

6. **Migration Path**
   - Phase 1: Add automatic tracking alongside existing manual saves
   - Phase 2: Remove manual saves one by one, verify behavior
   - Phase 3: Remove all manual save infrastructure

### Example Implementation

```typescript
export function useHistory(debounceDelay: number = 200) {
  const [past, setPast] = useState<HistoryState[]>([])
  const [present, setPresent] = useState<HistoryState | null>(null)
  const [future, setFuture] = useState<HistoryState[]>([])
  const isUndoRedoOperationRef = useRef(false)
  const previousNodesRef = useRef<Node[]>([])
  const previousEdgesRef = useRef<Edge[]>([])

  // Automatic tracking of nodes/edges changes
  useEffect(() => {
    // Skip if this is an undo/redo operation
    if (isUndoRedoOperationRef.current) {
      isUndoRedoOperationRef.current = false
      previousNodesRef.current = nodes
      previousEdgesRef.current = edges
      return
    }

    // Quick check: did anything actually change?
    const nodesChanged = nodes.length !== previousNodesRef.current.length ||
      nodes.some((n, i) => n.id !== previousNodesRef.current[i]?.id)
    const edgesChanged = edges.length !== previousEdgesRef.current.length ||
      edges.some((e, i) => e.id !== previousEdgesRef.current[i]?.id)

    if (!nodesChanged && !edgesChanged) {
      return // No actual change
    }

    // Debounce the save
    const timeout = setTimeout(() => {
      saveStateImmediate(nodes, edges)
      previousNodesRef.current = nodes
      previousEdgesRef.current = edges
    }, debounceDelay)

    return () => clearTimeout(timeout)
  }, [nodes, edges])

  const undo = useCallback((): HistoryState | null => {
    if (past.length === 0 || !present) return null
    
    isUndoRedoOperationRef.current = true // Mark as undo operation
    const previousState = past[past.length - 1]
    // ... rest of undo logic
    return previousState
  }, [past, present])

  // Similar for redo
}
```

### Questions to Consider
1. Should menu state (`openMenuNodeId`, `menuPosition`) be in history?
   - Pro: Can undo/redo menu state
   - Con: Adds complexity, menu state might not need undo
2. How to handle rapid changes (e.g., dragging)?
   - Current: Debouncing handles this
   - Alternative: Only save on drag end
3. Should we track viewport (zoom/pan) in history?
   - Probably not - viewport changes are too frequent and not meaningful for undo
