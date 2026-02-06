import { useCallback } from 'react'
import type React from 'react'
import { type Node, type Edge, ReactFlowInstance } from 'reactflow'
import { autoLayout } from '../utils/layoutHelpers'
import { isStartModule } from '../utils/moduleHelpers'
import type { ViewportActions } from './useViewport'

interface UseAutoLayoutParams {
  nodes: Node[]
  edges: Edge[]
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  reactFlowInstance: ReactFlowInstance | null
  reactFlowWrapper: React.RefObject<HTMLDivElement>
  isLocked: boolean
  saveHistoryBeforeChange: (changeType?: 'param' | 'other') => void
  viewportState: ViewportActions
}

/**
 * Hook to handle auto layout functionality with support for:
 * - Global autolayout (all nodes)
 * - Multiselect autolayout (only selected nodes)
 * - Anchor node preservation (keeps layout in same region)
 * - Viewport centering on start region
 */
export function useAutoLayout({
  nodes,
  edges,
  setNodes,
  setEdges,
  reactFlowInstance,
  reactFlowWrapper,
  isLocked,
  saveHistoryBeforeChange,
  viewportState,
}: UseAutoLayoutParams) {
  const handleAutoLayout = useCallback(() => {
    if (!nodes.length) return

    // Save history before applying automatic layout
    if (!isLocked) {
      saveHistoryBeforeChange('other')
    }

    // Disable animations during auto layout by adding a class
    reactFlowWrapper.current?.classList.add('auto-layout-active')

    setNodes((current) => {
      // Determine selection context
      const selectedNodes = current.filter((n) => n.selected)

      // Helper: detect if selection is effectively a single logical node:
      // - exactly one node selected, OR
      // - one parent node + all of its daughter/output nodes
      let selectedNodeIds: Set<string> | undefined
      if (selectedNodes.length === 0) {
        selectedNodeIds = undefined
      } else {
        const topLevelSelected = selectedNodes.filter(
          (n) => !n.data?.parentNodeId
        )
        const hasSingleTopLevel = topLevelSelected.length === 1
        const parentId = hasSingleTopLevel ? topLevelSelected[0].id : null

        const allChildrenOfParentSelected =
          parentId !== null &&
          selectedNodes.every(
            (n) =>
              !n.data?.parentNodeId || n.data.parentNodeId === parentId
          )

        const isSingleLogicalSelection =
          selectedNodes.length === 1 ||
          (hasSingleTopLevel && allChildrenOfParentSelected)

        // If selection is effectively a single node/group, run global autolayout
        // Otherwise, only autolayout the selected nodes
        selectedNodeIds = isSingleLogicalSelection
          ? undefined
          : new Set(selectedNodes.map((n) => n.id))
      }

      // Choose anchor node for layout region:
      // - Global autolayout: prefer Start node
      // - Multiselect: use first top-level selected node (or first selected)
      let anchorNodeId: string | null = null
      if (!selectedNodeIds) {
        const startNode = current.find((n) =>
          isStartModule(n.data?.moduleName)
        )
        if (startNode) {
          anchorNodeId = startNode.id
        } else if (current.length > 0) {
          anchorNodeId = current[0].id
        }
      } else {
        const selectedArray = selectedNodes
        const topLevelSelected = selectedArray.filter(
          (n) => !n.data?.parentNodeId
        )
        if (topLevelSelected.length > 0) {
          anchorNodeId = topLevelSelected[0].id
        } else if (selectedArray.length > 0) {
          anchorNodeId = selectedArray[0].id
        }
      }

      const { nodes: laidOutRaw, edges: updatedEdges } = autoLayout(
        current,
        edges,
        undefined,
        selectedNodeIds
      )

      // If we have an anchor, shift laid out nodes so that the anchor
      // stays roughly in the same region as before autolayout.
      let laidOut = laidOutRaw
      if (anchorNodeId) {
        const beforeAnchor = current.find((n) => n.id === anchorNodeId)
        const afterAnchor = laidOutRaw.find(
          (n) => n.id === anchorNodeId
        )

        if (beforeAnchor && afterAnchor) {
          const dx =
            beforeAnchor.position.x - (afterAnchor.position?.x ?? 0)
          const dy =
            beforeAnchor.position.y - (afterAnchor.position?.y ?? 0)

          // Detect which nodes actually moved (so we only shift those
          // in multiselect mode and leave others untouched)
          const movedIds = new Set<string>()
          laidOutRaw.forEach((n) => {
            const before = current.find((c) => c.id === n.id)
            if (
              before &&
              (before.position.x !== n.position.x ||
                before.position.y !== n.position.y)
            ) {
              movedIds.add(n.id)
            }
          })

          const isGlobal = !selectedNodeIds
          laidOut = laidOutRaw.map((n) => {
            const shouldShift = isGlobal || movedIds.has(n.id)
            if (!shouldShift) return n
            return {
              ...n,
              position: {
                x: (n.position?.x ?? 0) + dx,
                y: (n.position?.y ?? 0) + dy,
              },
            }
          })
        }
      }

      // Update edges if handles were changed (check if any edge differs)
      const edgesChanged = updatedEdges.some((e, i) =>
        !edges[i] ||
        e.sourceHandle !== edges[i].sourceHandle ||
        e.targetHandle !== edges[i].targetHandle
      )
      if (edgesChanged) {
        setEdges(updatedEdges)
      }

      // Calculate bounds of laid out nodes
      if (laidOut.length > 0 && reactFlowInstance) {
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity

        laidOut.forEach((node) => {
          const width = node.width || 220
          const height = node.height || 80
          minX = Math.min(minX, node.position.x)
          minY = Math.min(minY, node.position.y)
          maxX = Math.max(maxX, node.position.x + width)
          maxY = Math.max(maxY, node.position.y + height)
        })

        // Find start node to center on start region
        const startNode = laidOut.find((n) => isStartModule(n.data?.moduleName))
        let centerX = (minX + maxX) / 2
        let centerY = (minY + maxY) / 2

        // If start node exists, center on start region
        if (startNode) {
          const startWidth = startNode.width || 220
          const startHeight = startNode.height || 80
          centerX = startNode.position.x + startWidth / 2
          centerY = startNode.position.y + startHeight / 2
        }

        // Check if nodes are out of viewport
        const viewport = reactFlowInstance.getViewport()
        const wrapperBounds = reactFlowWrapper.current?.getBoundingClientRect()
        if (wrapperBounds) {
          const viewportWidth = wrapperBounds.width / viewport.zoom
          const viewportHeight = wrapperBounds.height / viewport.zoom
          const viewportMinX = -viewport.x / viewport.zoom
          const viewportMinY = -viewport.y / viewport.zoom
          const viewportMaxX = viewportMinX + viewportWidth
          const viewportMaxY = viewportMinY + viewportHeight

          // If nodes are outside viewport, center on start region
          if (minX < viewportMinX || maxX > viewportMaxX || minY < viewportMinY || maxY > viewportMaxY) {
            // Center the viewport on the start region (or center of layout if no start node)
            const targetViewportX = wrapperBounds.width / 2
            const targetViewportY = wrapperBounds.height / 2
            const newX = -centerX * viewport.zoom + targetViewportX
            const newY = -centerY * viewport.zoom + targetViewportY

            setTimeout(() => {
              viewportState.setViewport({ x: newX, y: newY, zoom: viewport.zoom })
            }, 0)
          }
        }
      }

      return laidOut
    })

    // Re-enable animations after layout completes
    setTimeout(() => {
      reactFlowWrapper.current?.classList.remove('auto-layout-active')
    }, 100)
  }, [
    nodes.length,
    edges,
    setNodes,
    setEdges,
    reactFlowInstance,
    reactFlowWrapper,
    isLocked,
    saveHistoryBeforeChange,
    viewportState,
  ])

  return { handleAutoLayout }
}
