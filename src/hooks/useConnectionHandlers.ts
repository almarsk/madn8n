import { useCallback } from 'react'
import { addEdge, MarkerType, type Connection, type Edge } from 'reactflow'

interface UseConnectionHandlersProps {
  edges: Edge[]
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  setNodes: React.Dispatch<React.SetStateAction<any[]>>
}

export interface ConnectionState {
  connectingFrom: string | null
  attemptingFromBlockedNode: string | null
}

export function useConnectionHandlers({
  edges,
  setEdges,
  setNodes,
}: UseConnectionHandlersProps) {
  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return false
      }

      // Ensure connection starts from a source handle
      if (connection.sourceHandle && !connection.sourceHandle.includes('-source')) {
        return false
      }

      // Ensure connection ends at a target handle
      if (connection.targetHandle && !connection.targetHandle.includes('-target')) {
        return false
      }

      // Prevent self-connections
      if (connection.source === connection.target) {
        return false
      }

      // Check if source node already has an outgoing edge
      const sourceNodeHasOutput = edges.some((edge) => edge.source === connection.source)
      if (sourceNodeHasOutput) {
        return false
      }

      return true
    },
    [edges]
  )

  const onConnectStart = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, { nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => {
      if (nodeId && handleId && handleId.includes('-source')) {
        // Update all nodes to know which one is connecting
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            data: {
              ...node.data,
              connectingFrom: nodeId,
            },
          }))
        )
      }
    },
    [setNodes]
  )

  const onConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent) => {
      // Clear connecting state from all nodes
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            connectingFrom: null,
          },
        }))
      )
    },
    [setNodes]
  )

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      // Validate handle types only if they are provided
      if (params.sourceHandle && !params.sourceHandle.includes('-source')) {
        return
      }

      if (params.targetHandle && !params.targetHandle.includes('-target')) {
        return
      }

      if (!params.source || !params.target) {
        return
      }

      // Prevent self-connections
      if (params.source === params.target) {
        return
      }

      // Check if source node already has an output - use functional update to get current edges
      setEdges((currentEdges) => {
        const sourceNodeHasOutput = currentEdges.some((edge) => edge.source === params.source)
        if (sourceNodeHasOutput) {
          return currentEdges
        }

        // Create new edge with arrow at the end
        // Arrow marker will be positioned at the handle, CSS will adjust for better visual connection
        const newEdge = {
          ...params,
          zIndex: 2, // Edges above branching nodes (1) but same as other nodes
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: 'rgba(148, 163, 184, 0.8)',
          },
          style: {
            strokeWidth: 2,
            stroke: 'rgba(148, 163, 184, 0.8)',
          },
        }

        return addEdge(newEdge, currentEdges)
      })

      // Clear connecting state from all nodes
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            connectingFrom: null,
          },
        }))
      )
    },
    [setEdges, setNodes]
  )

  return {
    isValidConnection,
    onConnectStart,
    onConnectEnd,
    onConnect,
  }
}
