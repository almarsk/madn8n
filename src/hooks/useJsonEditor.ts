import { useState, useCallback } from 'react'
import type { Node } from 'reactflow'
import { MarkerType } from 'reactflow'
import type { CustomFlowMetadata } from '../utils/translationHelpers'

export interface JsonEditorState {
  isJsonEditorOpen: boolean
}

export interface JsonEditorActions {
  handleOpenJsonEditor: () => void
  handleCloseJsonEditor: () => void
  handleSaveJsonEditor: (
    reactFlowData: { nodes: any[]; edges: any[] },
    metadata: CustomFlowMetadata
  ) => void
}

export function useJsonEditor(
  nodes: Node[],
  edges: any[],
  _flowMetadata: CustomFlowMetadata,
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: any[]) => void,
  saveHistoryBeforeChange: () => void,
  _reactFlowInstance: any,
  setFlowMetadata?: (metadata: CustomFlowMetadata) => void
): JsonEditorState & JsonEditorActions {
  const [isJsonEditorOpen, setIsJsonEditorOpen] = useState(false)

  const handleOpenJsonEditor = useCallback(() => {
    // Allow opening JSON editor even when there are no nodes,
    // so the user can paste/import a flow at any time.
    setIsJsonEditorOpen(true)
  }, [])

  const handleCloseJsonEditor = useCallback(() => {
    setIsJsonEditorOpen(false)
  }, [])

  const handleSaveJsonEditor = useCallback(
    (reactFlowData: { nodes: any[]; edges: any[] }, metadata: CustomFlowMetadata) => {
      // Save history before applying changes
      saveHistoryBeforeChange()

      // Update flow metadata if setter is provided
      if (setFlowMetadata) {
        setFlowMetadata({
          ...metadata,
          omnichannel_config: metadata.omnichannel_config || {},
          stickers: metadata.stickers || {},
        })
      }

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
        const originalEdge = edges.find(
          (e) => e.id === edge.id || (e.source === edge.source && e.target === edge.target)
        )

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

      // Set nodes first, then edges in next tick to ensure ReactFlow processes nodes first
      setNodes(reconstructedNodes)

      // Use requestAnimationFrame to ensure nodes are processed before edges
      requestAnimationFrame(() => {
        setEdges(preservedEdges)
      })

      // Don't close editor - let user continue editing
      // setIsJsonEditorOpen(false)
    },
    [nodes, edges, setNodes, setEdges, saveHistoryBeforeChange, setFlowMetadata]
  )

  return {
    isJsonEditorOpen,
    handleOpenJsonEditor,
    handleCloseJsonEditor,
    handleSaveJsonEditor,
  }
}
