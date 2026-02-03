import { useCallback, useRef, useState } from 'react'
import { ReactFlowInstance, useEdgesState, useNodesState, type Node } from 'reactflow'
import './App.css'
import modules from './modules'
import Toolbar from './components/Toolbar'
import FlowCanvas from './components/FlowCanvas'
import Minimap from './Minimap'
import NodePopupMenu from './components/NodePopupMenu'
import { useConnectionHandlers } from './hooks/useConnectionHandlers'

const initialNodes: Node[] = []
const initialEdges: any[] = []

const getId = (() => {
  let id = 0
  return () => `node_${id++}`
})()

function App() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const { isValidConnection, onConnectStart, onConnectEnd, onConnect } = useConnectionHandlers({
    edges,
    setEdges,
    setNodes,
  })

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      if (!reactFlowWrapper.current || !reactFlowInstance) {
        return
      }

      const type = event.dataTransfer.getData('application/reactflow')
      if (!type) {
        return
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const module = modules.find((m) => m.name === type)
      if (module?.name === 'Branching') {
        // Create branching node with initial output count of 1
        const branchingNodeId = getId()
        const outputNodeWidth = 130
        const outputNodeHeight = 60
        const padding = 20
        // Header height: padding (12px top + 12px bottom) + text (~20px) = ~44px, use 50px
        const headerHeight = 50
        const outputSpacing = 10
        const outputCount = 1

        // Calculate branching node size based on output count
        // Header at top, then consistent spacing between header and outputs, and between outputs
        const branchingNodeWidth = outputNodeWidth + padding * 2
        const branchingNodeHeight = headerHeight + outputSpacing + (outputCount * outputNodeHeight) + ((outputCount - 1) * outputSpacing) + padding

        const branchingNode: Node = {
          id: branchingNodeId,
          type: 'branching',
          position,
          data: {
            label: 'Branching Node',
            outputCount: 1,
            connectingFrom: null,
          },
          style: {
            width: branchingNodeWidth,
            height: branchingNodeHeight,
          },
          zIndex: 1, // Branching nodes at the bottom layer
        }

        // Create initial output node positioned inside branching node (below header with consistent spacing)
        const outputNode: Node = {
          id: getId(),
          type: 'branchingOutput',
          position: {
            x: position.x + padding,
            y: position.y + headerHeight + outputSpacing,
          },
          data: {
            label: 'Output 1',
            parentNodeId: branchingNodeId,
            connectingFrom: null,
          },
          style: {
            width: outputNodeWidth,
            height: outputNodeHeight,
          },
          zIndex: 3, // Output nodes at the top layer, above edges and branching nodes
        }

        setNodes((nds) => nds.concat([branchingNode, outputNode]))
      } else if (module) {
        const newNode: Node = {
          id: getId(),
          type: 'dynamic',
          position,
          data: {
            label: module?.name ?? type,
            connectingFrom: null,
          },
          style: {
            width: 150,
            height: 80,
          },
        }

        setNodes((nds) => nds.concat(newNode))
      }
    },
    [reactFlowInstance, setNodes]
  )

  const onNodeDragStart = (type: string) => (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onSidebarNodeClick = useCallback(
    (moduleName: string) => {
      if (!reactFlowInstance) {
        return
      }

      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!bounds) {
        return
      }

      const centerX = bounds.width / 2
      const centerY = bounds.height / 2

      let position = reactFlowInstance.screenToFlowPosition({
        x: centerX,
        y: centerY,
      })

      // Check if there's already a node at this position and offset if needed
      const nodeWidth = 150
      const nodeHeight = 80
      const offsetX = 30
      const offsetY = 30

      setNodes((nds) => {
        // Check for overlapping nodes
        let finalPosition = { ...position }
        let attempts = 0
        const maxAttempts = 10

        while (attempts < maxAttempts) {
          const hasFullOverlap = nds.some((node) => {
            const nodePos = node.position
            const nodeStyle = node.style || {}
            const existingWidth = typeof nodeStyle.width === 'number' ? nodeStyle.width : nodeWidth
            const existingHeight = typeof nodeStyle.height === 'number' ? nodeStyle.height : nodeHeight

            // Calculate overlap area
            const overlapLeft = Math.max(nodePos.x, finalPosition.x)
            const overlapRight = Math.min(nodePos.x + existingWidth, finalPosition.x + nodeWidth)
            const overlapTop = Math.max(nodePos.y, finalPosition.y)
            const overlapBottom = Math.min(nodePos.y + existingHeight, finalPosition.y + nodeHeight)

            // If there's no overlap, continue
            if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) {
              return false
            }

            // Calculate overlap area
            const overlapWidth = overlapRight - overlapLeft
            const overlapHeight = overlapBottom - overlapTop
            const overlapArea = overlapWidth * overlapHeight

            // Calculate areas of both nodes
            const existingArea = existingWidth * existingHeight
            const newArea = nodeWidth * nodeHeight
            const smallerArea = Math.min(existingArea, newArea)

            // Check if overlap is too large (more than 80% of the smaller node)
            // This allows partial overlap but prevents nodes from being fully on top of each other
            const overlapRatio = overlapArea / smallerArea
            return overlapRatio > 0.8
          })

          if (!hasFullOverlap) {
            break
          }

          // Offset to the right and down
          finalPosition = {
            x: finalPosition.x + offsetX,
            y: finalPosition.y + offsetY,
          }
          attempts++
        }

        const module = modules.find((m) => m.name === moduleName)
        if (module?.name === 'Branching') {
          // Create branching node with initial output count of 1
          const branchingNodeId = getId()
          const outputNodeWidth = 130
          const outputNodeHeight = 60
          const padding = 20
          // Header height: padding (12px top + 12px bottom) + text (~20px) = ~44px, use 50px
          const headerHeight = 50
          const outputSpacing = 10
          const outputCount = 1

          // Calculate branching node size based on output count
          // Header at top, then output nodes below with spacing
          const branchingNodeWidth = outputNodeWidth + padding * 2
          const branchingNodeHeight = headerHeight + (outputCount * (outputNodeHeight + outputSpacing)) + padding

          const branchingNode: Node = {
            id: branchingNodeId,
            type: 'branching',
            position: finalPosition,
            data: {
              label: 'Branching Node',
              outputCount: 1,
              connectingFrom: null,
            },
            style: {
              width: branchingNodeWidth,
              height: branchingNodeHeight,
            },
            zIndex: 1, // Branching nodes at the bottom layer
          }

          // Create initial output node positioned inside branching node (below header with spacing)
          const outputNode: Node = {
            id: getId(),
            type: 'branchingOutput',
            position: {
              x: finalPosition.x + padding,
              y: finalPosition.y + headerHeight + outputSpacing,
            },
            data: {
              label: 'Output 1',
              parentNodeId: branchingNodeId,
              connectingFrom: null,
            },
            style: {
              width: outputNodeWidth,
              height: outputNodeHeight,
            },
            zIndex: 2, // Output nodes same as other nodes, but above their parent branching node (1)
          }

          return nds.concat([branchingNode, outputNode])
        } else if (module) {
          const newNode: Node = {
            id: getId(),
            type: 'dynamic',
            position: finalPosition,
            data: {
              label: module.name,
              connectingFrom: null,
            },
            style: {
              width: nodeWidth,
              height: nodeHeight,
            },
          }

          return nds.concat(newNode)
        }

        // Return unchanged if no module found
        return nds
      })
    },
    [reactFlowInstance, setNodes, modules]
  )

  const handleZoomIn = () => {
    reactFlowInstance?.zoomIn?.()
  }

  const handleZoomOut = () => {
    reactFlowInstance?.zoomOut?.()
  }

  const handleFitView = () => {
    reactFlowInstance?.fitView?.({ padding: 0.2 })
  }

  const onMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
      setViewport(viewport)
    },
    []
  )

  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      setReactFlowInstance(instance)
      const viewport = instance.getViewport()
      setViewport(viewport)
    },
    []
  )

  // Wrap onEdgesChange to maintain compatibility
  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      onEdgesChange(changes)
    },
    [onEdgesChange]
  )

  // Wrap onNodesChange to clean up output nodes when branching node is deleted
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      // Check if any branching nodes are being removed or moved
      const removedBranchingNodeIds = new Set<string>()
      const movedBranchingNodeIds = new Set<string>()

      changes.forEach((change) => {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id)
          if (node?.type === 'branching') {
            removedBranchingNodeIds.add(change.id)
          }
        } else if (change.type === 'position' && change.position) {
          const node = nodes.find((n) => n.id === change.id)
          if (node?.type === 'branching') {
            movedBranchingNodeIds.add(change.id)
          }
        }
      })

      // If branching nodes are being removed, also remove their output nodes
      if (removedBranchingNodeIds.size > 0) {
        setNodes((nds) => {
          const outputNodesToRemove = nds.filter(
            (n) => n.type === 'branchingOutput' && n.data.parentNodeId && removedBranchingNodeIds.has(n.data.parentNodeId)
          )
          const outputNodeIdsToRemove = new Set(outputNodesToRemove.map((n) => n.id))

          // Also remove edges connected to these output nodes
          setEdges((eds) => eds.filter((e) => !outputNodeIdsToRemove.has(e.source) && !outputNodeIdsToRemove.has(e.target)))

          return nds.filter((n) => !outputNodeIdsToRemove.has(n.id))
        })
      }

      // If branching nodes are being moved, update their output node positions
      if (movedBranchingNodeIds.size > 0) {
        setNodes((nds) => {
          const outputNodeHeight = 60
          const padding = 20
          // Header height includes padding (12px top + 12px bottom) + text height (~20px) = ~44px, use 50px for safety
          const headerHeight = 50
          const outputSpacing = 10

          return nds.map((node) => {
            if (node.type === 'branchingOutput' && node.data.parentNodeId && movedBranchingNodeIds.has(node.data.parentNodeId)) {
              const branchingNode = nds.find((n) => n.id === node.data.parentNodeId && n.type === 'branching')
              if (branchingNode) {
                const outputNodes = nds.filter(
                  (n) => n.type === 'branchingOutput' && n.data.parentNodeId === branchingNode.id
                )
                const index = outputNodes.findIndex((n) => n.id === node.id)
                if (index >= 0) {
                  const branchingPos = branchingNode.position || { x: 0, y: 0 }
                  return {
                    ...node,
                    position: {
                      x: branchingPos.x + padding,
                      y: branchingPos.y + headerHeight + outputSpacing + index * (outputNodeHeight + outputSpacing),
                    },
                  }
                }
              }
            }
            return node
          })
        })
      }

      onNodesChange(changes)
    },
    [nodes, onNodesChange, setNodes, setEdges]
  )

  const handleLabelClick = useCallback((nodeId: string) => {
    setOpenMenuNodeId(nodeId)
  }, [])

  const handleCloseMenu = useCallback(() => {
    setOpenMenuNodeId(null)
  }, [])

  const handleExportJson = useCallback(() => {
    if (!reactFlowInstance) {
      console.warn('ReactFlow instance not available')
      return
    }
    const flowData = reactFlowInstance.toObject()
    console.log('ReactFlow JSON:', JSON.stringify(flowData, null, 2))
  }, [reactFlowInstance])

  const handleOutputCountChange = useCallback((nodeId: string, count: number) => {
    setNodes((nds) => {
      // Update the branching node's output count
      const updatedNodes = nds.map((node) => {
        if (node.id === nodeId && node.type === 'branching') {
          return {
            ...node,
            data: {
              ...node.data,
              outputCount: count,
            },
          }
        }
        return node
      })

      // Find the branching node
      const branchingNode = updatedNodes.find((n) => n.id === nodeId && n.type === 'branching')
      if (!branchingNode) return updatedNodes

      // Get existing output nodes for this branching node
      const existingOutputNodes = updatedNodes.filter(
        (n) => n.type === 'branchingOutput' && n.data.parentNodeId === nodeId
      )

      const currentCount = existingOutputNodes.length
      const newCount = count

      // Constants for output node layout
      const outputNodeWidth = 130
      const outputNodeHeight = 60
      const padding = 20
      // Header height includes padding (12px top + 12px bottom) + text height (~20px) = ~44px, use 50px for safety
      const headerHeight = 50
      const outputSpacing = 10

      // Update branching node size based on new output count
      // Header at top, then consistent spacing between header and outputs, and between outputs
      const branchingNodeWidth = outputNodeWidth + padding * 2
      const branchingNodeHeight = headerHeight + outputSpacing + (newCount * outputNodeHeight) + ((newCount - 1) * outputSpacing) + padding

      const updatedBranchingNode = {
        ...branchingNode,
        style: {
          ...branchingNode.style,
          width: branchingNodeWidth,
          height: branchingNodeHeight,
        },
      }

      const nodesWithUpdatedBranching = updatedNodes.map((node) =>
        node.id === nodeId ? updatedBranchingNode : node
      )

      if (newCount > currentCount) {
        // Add new output nodes positioned inside branching node
        const nodesToAdd: Node[] = []
        const branchingPos = branchingNode.position || { x: 0, y: 0 }

        for (let i = currentCount; i < newCount; i++) {
          const outputNode: Node = {
            id: getId(),
            type: 'branchingOutput',
            position: {
              x: branchingPos.x + padding,
              y: branchingPos.y + headerHeight + outputSpacing + i * (outputNodeHeight + outputSpacing),
            },
            data: {
              label: `Output ${i + 1}`,
              parentNodeId: nodeId,
              connectingFrom: null,
            },
            style: {
              width: outputNodeWidth,
              height: outputNodeHeight,
            },
            zIndex: 2, // Output nodes same as other nodes, but above their parent branching node (1)
          }
          nodesToAdd.push(outputNode)
        }
        return [...nodesWithUpdatedBranching, ...nodesToAdd]
      } else if (newCount < currentCount) {
        // Remove excess output nodes
        const nodesToRemove = existingOutputNodes.slice(newCount)
        const nodeIdsToRemove = new Set(nodesToRemove.map((n) => n.id))

        // Also remove edges connected to these nodes
        setEdges((eds) => eds.filter((e) => !nodeIdsToRemove.has(e.source) && !nodeIdsToRemove.has(e.target)))

        // Update remaining output nodes positions and branching node size
        const remainingOutputNodes = existingOutputNodes.slice(0, newCount)
        const branchingPos = branchingNode.position || { x: 0, y: 0 }

        const nodesWithRepositionedOutputs = nodesWithUpdatedBranching.map((node) => {
          if (node.type === 'branchingOutput' && node.data.parentNodeId === nodeId) {
            const index = remainingOutputNodes.findIndex((n) => n.id === node.id)
            if (index >= 0) {
              return {
                ...node,
                position: {
                  x: branchingPos.x + padding,
                  y: branchingPos.y + headerHeight + outputSpacing + index * (outputNodeHeight + outputSpacing),
                },
              }
            }
          }
          return node
        })

        return nodesWithRepositionedOutputs.filter((n) => !nodeIdsToRemove.has(n.id))
      }

      // Update output node positions even if count didn't change (in case branching node moved)
      const branchingPos = branchingNode.position || { x: 0, y: 0 }
      const nodesWithRepositionedOutputs = nodesWithUpdatedBranching.map((node) => {
        if (node.type === 'branchingOutput' && node.data.parentNodeId === nodeId) {
          const index = existingOutputNodes.findIndex((n) => n.id === node.id)
          if (index >= 0) {
            return {
              ...node,
              position: {
                x: branchingPos.x + padding,
                y: branchingPos.y + headerHeight + outputSpacing + index * (outputNodeHeight + outputSpacing),
              },
            }
          }
        }
        return node
      })

      return nodesWithRepositionedOutputs
    })
  }, [setNodes, setEdges])

  // Update nodes with label click handler, make output nodes non-draggable, and set zIndex for proper layering
  // zIndex: branching nodes (1) < edges (2) < other nodes (2) 
  // Output nodes should be above their parent branching node but behave normally with other nodes
  const nodesWithHandlers = nodes.map((node) => {
    let zIndex = 2 // Default for dynamic nodes
    if (node.type === 'branching') {
      zIndex = 1 // Branching nodes at bottom
    } else if (node.type === 'branchingOutput') {
      // Output nodes should be above their parent branching node (zIndex 2 > 1)
      // but same as other nodes, so they behave normally in the z-order
      zIndex = 2
    }
    return {
      ...node,
      data: {
        ...node.data,
        onLabelClick: handleLabelClick,
      },
      draggable: node.type !== 'branchingOutput', // Output nodes are not draggable - they move with parent
      zIndex,
    }
  })

  return (
    <div className="app-root">
      <main className="canvas-wrapper" ref={reactFlowWrapper}>
        <Toolbar
          modules={modules}
          onNodeDragStart={onNodeDragStart}
          onSidebarNodeClick={onSidebarNodeClick}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          isLocked={isLocked}
          onLockToggle={() => setIsLocked((prev) => !prev)}
          showMinimap={showMinimap}
          onMinimapToggle={() => setShowMinimap((prev) => !prev)}
          onExportJson={handleExportJson}
        />

        <FlowCanvas
          nodes={nodesWithHandlers}
          edges={edges.map((edge) => ({
            ...edge,
            zIndex: edge.zIndex ?? 2, // Edges above branching nodes (1) but below output nodes (3)
          }))}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onInit={onInit}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onMove={onMove}
          isLocked={isLocked}
        />

        {openMenuNodeId && reactFlowInstance && (() => {
          const menuNode = nodes.find((n) => n.id === openMenuNodeId)
          if (!menuNode) return null

          return (
            <NodePopupMenu
              node={menuNode}
              onClose={handleCloseMenu}
              reactFlowWrapper={reactFlowWrapper}
              reactFlowInstance={reactFlowInstance}
              onOutputCountChange={menuNode.type === 'branching' ? handleOutputCountChange : undefined}
            />
          )
        })()}

        {showMinimap && reactFlowInstance && (
          <Minimap
            nodes={nodes}
            edges={edges}
            reactFlowInstance={reactFlowInstance}
            viewport={viewport}
            reactFlowWrapper={reactFlowWrapper}
          />
        )}
      </main>
    </div>
  )
}

export default App
