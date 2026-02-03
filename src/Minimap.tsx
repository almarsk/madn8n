import { useMemo, type RefObject } from 'react'
import type { Node, Edge, ReactFlowInstance } from 'reactflow'

interface MinimapProps {
  nodes: Node[]
  edges: Edge[]
  reactFlowInstance: ReactFlowInstance
  viewport: { x: number; y: number; zoom: number }
  reactFlowWrapper: RefObject<HTMLDivElement>
}

const MINIMAP_SIZE = 220
const MINIMAP_HEIGHT = 160
const PADDING = 20

function Minimap({ nodes, edges, reactFlowInstance, viewport, reactFlowWrapper }: MinimapProps) {
  const { bounds, scale, viewportRect } = useMemo(() => {
    if (nodes.length === 0) {
      return { bounds: null, scale: 1, viewportRect: null }
    }

    // Calculate bounds of all nodes
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    nodes.forEach((node) => {
      const nodeWidth = node.width || 120
      const nodeHeight = node.height || 60
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + nodeWidth)
      maxY = Math.max(maxY, node.position.y + nodeHeight)
    })

    // Add padding
    const padding = 50
    minX -= padding
    minY -= padding
    maxX += padding
    maxY += padding

    const boundsWidth = maxX - minX
    const boundsHeight = maxY - minY

    // Calculate scale to fit bounds in minimap
    const scaleX = (MINIMAP_SIZE - PADDING * 2) / boundsWidth
    const scaleY = (MINIMAP_HEIGHT - PADDING * 2) / boundsHeight
    const scale = Math.min(scaleX, scaleY)

    // Get viewport bounds
    const wrapperBounds = reactFlowWrapper.current?.getBoundingClientRect()
    if (!wrapperBounds) {
      return { bounds: null, scale: 1, viewportRect: null }
    }

    // Calculate viewport rectangle in flow coordinates
    // ReactFlow viewport transform: x and y are pan offsets, zoom is the zoom level
    // The visible area in flow coordinates starts at (-x/zoom, -y/zoom)
    const viewportWidth = wrapperBounds.width / viewport.zoom
    const viewportHeight = wrapperBounds.height / viewport.zoom

    // Top-left corner of viewport in flow coordinates
    const viewportMinX = -viewport.x / viewport.zoom
    const viewportMinY = -viewport.y / viewport.zoom
    const viewportMaxX = viewportMinX + viewportWidth
    const viewportMaxY = viewportMinY + viewportHeight

    // Convert viewport rectangle to minimap coordinates
    const viewportRectX = (viewportMinX - minX) * scale + PADDING
    const viewportRectY = (viewportMinY - minY) * scale + PADDING
    const viewportRectWidth = viewportWidth * scale
    const viewportRectHeight = viewportHeight * scale

    return {
      bounds: { minX, minY, maxX, maxY, width: boundsWidth, height: boundsHeight },
      scale,
      viewportRect: {
        x: viewportRectX,
        y: viewportRectY,
        width: viewportRectWidth,
        height: viewportRectHeight,
      },
    }
  }, [nodes, viewport, reactFlowWrapper])

  if (!bounds || !viewportRect) {
    return null
  }

  return (
    <div className="custom-minimap">
      <svg
        width={MINIMAP_SIZE}
        height={MINIMAP_HEIGHT}
        style={{ display: 'block' }}
      >
        {/* Background */}
        <rect
          x={0}
          y={0}
          width={MINIMAP_SIZE}
          height={MINIMAP_HEIGHT}
          fill="rgba(15, 23, 42, 0.9)"
        />

        {/* Nodes */}
        {nodes.map((node) => {
          const nodeWidth = node.width || 120
          const nodeHeight = node.height || 60
          const x = (node.position.x - bounds.minX) * scale + PADDING
          const y = (node.position.y - bounds.minY) * scale + PADDING
          const width = nodeWidth * scale
          const height = nodeHeight * scale

          return (
            <rect
              key={node.id}
              x={x}
              y={y}
              width={width}
              height={height}
              fill="rgba(148, 163, 184, 0.3)"
              stroke="rgba(148, 163, 184, 0.6)"
              strokeWidth={1}
              rx={2}
            />
          )
        })}

        {/* Edges */}
        {edges.map((edge) => {
          const sourceNode = nodes.find((n) => n.id === edge.source)
          const targetNode = nodes.find((n) => n.id === edge.target)

          if (!sourceNode || !targetNode) return null

          const sourceWidth = sourceNode.width || 120
          const sourceHeight = sourceNode.height || 60
          const targetWidth = targetNode.width || 120
          const targetHeight = targetNode.height || 60

          // Calculate edge start/end points (center of nodes)
          const sourceX = (sourceNode.position.x - bounds.minX) * scale + PADDING + (sourceWidth * scale) / 2
          const sourceY = (sourceNode.position.y - bounds.minY) * scale + PADDING + (sourceHeight * scale) / 2
          const targetX = (targetNode.position.x - bounds.minX) * scale + PADDING + (targetWidth * scale) / 2
          const targetY = (targetNode.position.y - bounds.minY) * scale + PADDING + (targetHeight * scale) / 2

          return (
            <line
              key={edge.id}
              x1={sourceX}
              y1={sourceY}
              x2={targetX}
              y2={targetY}
              stroke="rgba(148, 163, 184, 0.4)"
              strokeWidth={1}
            />
          )
        })}

        {/* Viewport rectangle */}
        <rect
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.width}
          height={viewportRect.height}
          fill="transparent"
          stroke="rgba(96, 165, 250, 0.8)"
          strokeWidth={2}
          rx={2}
        />
      </svg>
    </div>
  )
}

export default Minimap
