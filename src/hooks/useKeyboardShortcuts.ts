import { useEffect } from 'react'
import type { ReactFlowInstance, Node, Edge } from 'reactflow'
import type { NodeType } from '../nodeConfigs'
import { isBranchingOutputNodeType } from '../nodeConfigs'

interface UseKeyboardShortcutsParams {
  nodes: Node[]
  edges: Edge[]
  reactFlowInstance: ReactFlowInstance | null
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  reactFlowWrapper: React.RefObject<HTMLDivElement>
  handleUndo: () => void
  handleRedo: () => void
  handleDuplicateNodes: () => void
  handleDeleteSelectedNodes: () => void
  isLocked: boolean
}

export function useKeyboardShortcuts({
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
}: UseKeyboardShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+E: Jump to next node if a node with outgoing edge is selected
      if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault()
        const selectedNode = nodes.find((n) => n.selected)
        if (selectedNode && reactFlowInstance) {
          // Find outgoing edges from selected node (or from its output nodes if it's a branching node)
          let outgoingEdges = edges.filter((e) => e.source === selectedNode.id)

          // If no direct edges, check if it's a branching node and look for edges from its output nodes
          if (outgoingEdges.length === 0) {
            const outputNodes = nodes.filter((n) => n.data?.parentNodeId === selectedNode.id)
            for (const outputNode of outputNodes) {
              const outputEdges = edges.filter((e) => e.source === outputNode.id)
              if (outputEdges.length > 0) {
                outgoingEdges = outputEdges
                break
              }
            }
          }

          if (outgoingEdges.length > 0) {
            // Get the first target node
            let targetNodeId = outgoingEdges[0].target
            let targetNode = nodes.find((n) => n.id === targetNodeId)

            // If target is a branching output node, use its parent instead
            if (targetNode) {
              const targetType = targetNode.data?.nodeType as NodeType | undefined
              if (targetType && isBranchingOutputNodeType(targetType)) {
                const parentId = targetNode.data?.parentNodeId as string | undefined
                if (parentId) {
                  targetNodeId = parentId
                  targetNode = nodes.find((n) => n.id === parentId)
                }
              }
            }

            if (targetNode) {
              // Deselect current node and select target node
              setNodes((nds) =>
                nds.map((n) => ({
                  ...n,
                  selected: n.id === targetNodeId,
                })),
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
      // Check if target is an input/textarea or is inside one, or is contentEditable
      const isInputField = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"]') !== null

      if (isInputField) {
        return
      }

      // Check for Ctrl+Z (or Cmd+Z on Mac) for undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        handleUndo()
        return
      }
      // Check for Ctrl+Shift+Z or Ctrl+Y (or Cmd+Shift+Z/Cmd+Y on Mac) for redo
      if ((event.ctrlKey || event.metaKey) && (event.key === 'Z' || event.key === 'y' || event.key === 'Y')) {
        event.preventDefault()
        event.stopPropagation()
        handleRedo()
        return
      }
      // Check for Ctrl+D (or Cmd+D on Mac) for duplicate
      if ((event.ctrlKey || event.metaKey) && event.key === 'd' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        handleDuplicateNodes()
        return
      }

      // Handle Delete/Backspace for node deletion
      // We intercept this instead of letting ReactFlow handle it to ensure atomic history saving
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isLocked) {
        const selectedNodes = nodes.filter((n) => n.selected)
        if (selectedNodes.length > 0) {
          event.preventDefault()
          event.stopPropagation()
          handleDeleteSelectedNodes()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [nodes, edges, reactFlowInstance, setNodes, setEdges, reactFlowWrapper, handleUndo, handleRedo, handleDuplicateNodes, handleDeleteSelectedNodes, isLocked])
}

