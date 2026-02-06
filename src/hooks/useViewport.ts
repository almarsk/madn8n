import { useCallback, useState } from 'react'
import type { ReactFlowInstance, Node } from 'reactflow'
import modules from '../modules'
import { createNodeFromConfig } from '../utils/nodeCreation'
import type { NodeType } from '../nodeConfigs'
import { isStartNode, getStartModule } from '../utils/moduleHelpers'

export interface ViewportState {
  viewport: { x: number; y: number; zoom: number }
}

export interface ViewportActions {
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void
  onMove: (event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => void
  onInit: (instance: ReactFlowInstance) => void
  positionStartNodeAtDefaultView: (instance: ReactFlowInstance, currentNodes: Node[], duration?: number) => void
}

export function useViewport(
  reactFlowWrapper: React.RefObject<HTMLDivElement>,
  setReactFlowInstance: (instance: ReactFlowInstance | null) => void,
  setNodes: (updater: (nodes: Node[]) => Node[]) => void
): ViewportState & ViewportActions {
  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 })

  const positionStartNodeAtDefaultView = useCallback(
    (instance: ReactFlowInstance, currentNodes: Node[], duration: number = 0) => {
      const startNode = currentNodes.find((n) => isStartNode(n))
      if (startNode) {
        const bounds = reactFlowWrapper.current?.getBoundingClientRect()
        if (bounds) {
          // Calculate where Start node should appear on screen - closer to middle but still on left side
          // Position at about 40% from left (closer to center than before)
          const targetScreenX = bounds.width * 0.4
          const targetScreenY = bounds.height * (1 / 3)

          // Use default zoom 0.7
          const zoom = 0.7
          const flowX = startNode.position.x
          const flowY = startNode.position.y

          // Calculate viewport offset needed to position Start node at target screen position
          const viewportX = -flowX * zoom + targetScreenX
          const viewportY = -flowY * zoom + targetScreenY

          instance.setViewport({ x: viewportX, y: viewportY, zoom })
        }
      } else if (currentNodes.length === 0) {
        // Default zoom if no nodes
        instance.setViewport({ x: 0, y: 0, zoom: 0.7 })
      } else {
        // Fit view with default zoom
        instance.fitView({ padding: 0.2, minZoom: 0.7, maxZoom: 1.5, duration })
      }
    },
    [reactFlowWrapper]
  )

  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      setReactFlowInstance(instance)
      const viewport = instance.getViewport()
      setViewport(viewport)

      // Set default zoom and position first, then create start node at correct position
      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (bounds) {
        // Calculate target position for start node
        const targetScreenX = bounds.width * 0.4
        const targetScreenY = bounds.height * (1 / 3)
        const zoom = 0.7

        // Set viewport immediately to prevent initial render hiccup
        // We'll position the start node at (0, 0) initially and adjust viewport
        instance.setViewport({ x: targetScreenX, y: targetScreenY, zoom })

        // Now create start node at flow position (0, 0) which will appear at target screen position
        setNodes((nds) => {
          const hasStartNode = nds.some((n) => isStartNode(n))
          if (!hasStartNode) {
            const startModule = getStartModule()
            if (startModule) {
              // Position at (0, 0) in flow coordinates - viewport is already set
              const position = { x: 0, y: 0 }
              const startNode = createNodeFromConfig(startModule.type as NodeType, position, {
                moduleName: startModule.name,
                connectingFrom: null,
              })
              return [...nds, startNode]
            }
          }
          return nds
        })
      }
    },
    [setNodes, setReactFlowInstance, reactFlowWrapper]
  )

  const onMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
      setViewport(viewport)
    },
    []
  )

  return {
    viewport,
    setViewport,
    onMove,
    onInit,
    positionStartNodeAtDefaultView,
  }
}
