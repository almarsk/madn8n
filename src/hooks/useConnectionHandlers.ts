import { useCallback } from 'react'
import { addEdge, MarkerType, type Connection, type Edge } from 'reactflow'

interface UseConnectionHandlersProps {
  edges: Edge[]
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  setNodes: React.Dispatch<React.SetStateAction<any[]>>
  debugLogging?: boolean
}

export function useConnectionHandlers({
  edges,
  setEdges,
  setNodes,
  debugLogging = false,
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
        // Check if this node already has an output
        const sourceNodeHasOutput = edges.some((edge) => edge.source === nodeId)
        if (sourceNodeHasOutput) {
          return
        }

        // Update all nodes to know which one is connecting
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            data: {
              ...node.data,
              connectingFrom: nodeId,
              debugLogging: debugLogging,
            },
          }))
        )
      }
    },
    [setNodes, edges, debugLogging]
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
            debugLogging: debugLogging,
          },
        }))
      )
    },
    [setNodes, debugLogging]
  )

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      // Validate handle types only if they are provided
      if (params.sourceHandle && !params.sourceHandle.includes('-source')) {
        if (debugLogging) {
          console.error('Invalid source handle:', params.sourceHandle)
        }
        return
      }

      if (params.targetHandle && !params.targetHandle.includes('-target')) {
        if (debugLogging) {
          console.error('Invalid target handle:', params.targetHandle)
        }
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
        const newEdge = {
          ...params,
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
    [setEdges, setNodes, debugLogging]
  )

  return {
    isValidConnection,
    onConnectStart,
    onConnectEnd,
    onConnect,
  }
}
