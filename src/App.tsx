import { useCallback, useRef, useState } from 'react'
import { ReactFlowInstance, useEdgesState, useNodesState, type Node } from 'reactflow'
import './App.css'
import modules from './modules'
import nodeConfigs, { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES } from './nodeConfigs'
import Toolbar from './components/Toolbar'
import FlowCanvas from './components/FlowCanvas'
import Minimap from './Minimap'
import NodePopupMenu from './components/NodePopupMenu'
import ValidationBanner from './components/ValidationBanner'
import { useConnectionHandlers } from './hooks/useConnectionHandlers'

const initialNodes: Node[] = []
const initialEdges: any[] = []

const getId = (() => {
  let id = 0
  return () => `node_${id++}`
})()

// Helper function to create a node based on nodeConfig
const createNodeFromConfig = (
  nodeType: NodeType,
  position: { x: number; y: number },
  options: {
    label?: string
    outputCount?: number
    parentNodeId?: string
    connectingFrom?: string | null
  } = {}
): Node => {
  const config = nodeConfigs[nodeType]
  if (!config) {
    throw new Error(`Unknown node type: ${nodeType}`)
  }

  const node: Node = {
    id: getId(),
    type: 'nodeFactory',
    position,
    data: {
      ...config,
      label: options.label || config.name,
      nodeType,
      connectingFrom: options.connectingFrom ?? null,
      ...(options.outputCount !== undefined && { outputCount: options.outputCount }),
      ...(options.parentNodeId && { parentNodeId: options.parentNodeId }),
    },
    style: {
      width: config.defaultWidth ?? 150,
      height: config.defaultHeight ?? 80,
    },
    zIndex: config.zIndex ?? 2,
  }

  return node
}

// Helper function to create a branching node with its output nodes
const createBranchingNodeWithOutputs = (
  position: { x: number; y: number },
  outputCount: number,
  label?: string
): Node[] => {
  const branchingConfig = nodeConfigs.branching
  const outputConfig = nodeConfigs.branchingOutput

  if (!branchingConfig || !outputConfig) {
    throw new Error('Branching or output config not found')
  }

  const padding = branchingConfig.padding || 20
  const headerHeight = branchingConfig.headerHeight || 50
  const outputSpacing = branchingConfig.outputSpacing || 10
  const outputNodeWidth = branchingConfig.outputNodeWidth || 130
  const outputNodeHeight = branchingConfig.outputNodeHeight || 60

  // Calculate branching node size based on output count
  const branchingNodeWidth = outputNodeWidth + padding * 2
  const branchingNodeHeight = headerHeight + outputSpacing + (outputCount * outputNodeHeight) + ((outputCount - 1) * outputSpacing) + padding

  const branchingNodeId = getId()
  const branchingNode: Node = {
    id: branchingNodeId,
    type: 'nodeFactory',
    position,
    data: {
      ...branchingConfig,
      label: label || branchingConfig.name,
      nodeType: NODE_TYPES.BRANCHING,
      outputCount,
      connectingFrom: null,
    },
    style: {
      width: branchingNodeWidth,
      height: branchingNodeHeight,
    },
    zIndex: branchingConfig.zIndex,
  }

  // Create output nodes
  const outputNodes: Node[] = []
  for (let i = 0; i < outputCount; i++) {
    const outputNode: Node = {
      id: getId(),
      type: 'nodeFactory',
      position: {
        x: position.x + padding,
        y: position.y + headerHeight + outputSpacing + i * (outputNodeHeight + outputSpacing),
      },
      data: {
        ...outputConfig,
        label: `Output ${i + 1}`,
        nodeType: NODE_TYPES.BRANCHING_OUTPUT,
        parentNodeId: branchingNodeId,
        connectingFrom: null,
      },
      style: {
        width: outputNodeWidth,
        height: outputNodeHeight,
      },
      zIndex: outputConfig.zIndex,
    }
    outputNodes.push(outputNode)
  }

  return [branchingNode, ...outputNodes]
}

function App() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null)
  const [validationStatus, setValidationStatus] = useState<{ isValid: boolean | null; message: string }>({
    isValid: null,
    message: '',
  })

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
      if (!module) {
        return
      }

      // Get node config based on module type
      const nodeConfig = nodeConfigs[module.type]
      if (!nodeConfig) {
        console.warn(`No node config found for module type: ${module.type}`)
        return
      }

      // Create node(s) based on config type
      if (isBranchingNodeType(module.type)) {
        const branchingConfig = nodeConfigs.branching
        const outputCount = branchingConfig?.defaultOutputCount ?? 1
        const nodes = createBranchingNodeWithOutputs(position, outputCount, module.name)
        setNodes((nds) => nds.concat(nodes))
      } else {
        // Single node (or any other non-branching type)
        const newNode = createNodeFromConfig(module.type as NodeType, position, {
          label: module.name,
          connectingFrom: null,
        })
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
      const singleConfig = nodeConfigs.single
      const nodeWidth = singleConfig?.defaultWidth || 150
      const nodeHeight = singleConfig?.defaultHeight || 80
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
        if (!module) {
          return nds
        }

        // Get node config based on module type
        const nodeConfig = nodeConfigs[module.type]
        if (!nodeConfig) {
          console.warn(`No node config found for module type: ${module.type}`)
          return nds
        }

        // Create node(s) based on config type
        if (isBranchingNodeType(module.type)) {
          const branchingConfig = nodeConfigs.branching
          const outputCount = branchingConfig?.defaultOutputCount ?? 1
          const nodes = createBranchingNodeWithOutputs(finalPosition, outputCount, module.name)
          return nds.concat(nodes)
        } else {
          // Single node (or any other non-branching type)
          const newNode = createNodeFromConfig(module.type as NodeType, finalPosition, {
            label: module.name,
            connectingFrom: null,
          })
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
          const nodeType = node?.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingNodeType(nodeType)) {
            removedBranchingNodeIds.add(change.id)
          }
        } else if (change.type === 'position' && change.position) {
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingNodeType(nodeType)) {
            movedBranchingNodeIds.add(change.id)
          }
        }
      })

      // If branching nodes are being removed, also remove their output nodes
      if (removedBranchingNodeIds.size > 0) {
        setNodes((nds) => {
          const outputNodesToRemove = nds.filter((n) => {
            const nodeType = n.data?.nodeType as NodeType | undefined
            return nodeType && isBranchingOutputNodeType(nodeType) && n.data.parentNodeId && removedBranchingNodeIds.has(n.data.parentNodeId)
          })
          const outputNodeIdsToRemove = new Set(outputNodesToRemove.map((n) => n.id))

          // Also remove edges connected to these output nodes
          setEdges((eds) => eds.filter((e) => !outputNodeIdsToRemove.has(e.source) && !outputNodeIdsToRemove.has(e.target)))

          return nds.filter((n) => !outputNodeIdsToRemove.has(n.id))
        })
      }

      // If branching nodes are being moved, update their output node positions
      if (movedBranchingNodeIds.size > 0) {
        setNodes((nds) => {
          const branchingConfig = nodeConfigs.branching
          if (!branchingConfig) {
            return nds
          }

          const padding = branchingConfig.padding || 20
          const headerHeight = branchingConfig.headerHeight || 50
          const outputSpacing = branchingConfig.outputSpacing || 10
          const outputNodeHeight = branchingConfig.outputNodeHeight || 60

          return nds.map((node) => {
            const nodeType = node.data?.nodeType as NodeType | undefined
            if (nodeType && isBranchingOutputNodeType(nodeType) && node.data.parentNodeId && movedBranchingNodeIds.has(node.data.parentNodeId)) {
              const branchingNode = nds.find((n) => {
                const nType = n.data?.nodeType as NodeType | undefined
                return n.id === node.data.parentNodeId && nType && isBranchingNodeType(nType)
              })
              if (branchingNode) {
                const outputNodes = nds.filter((n) => {
                  const nType = n.data?.nodeType as NodeType | undefined
                  return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === branchingNode.id
                })
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

  const handleValidate = useCallback(() => {
    // Get all nodes that have source handles (can output)
    const nodesWithSourceHandles = nodes.filter((node) => {
      const nodeType = node.data?.nodeType as NodeType | undefined
      if (!nodeType) return false
      const config = nodeConfigs[nodeType]
      return config?.hasSourceHandles === true
    })

    // Check if all nodes with source handles have outgoing edges
    const unconnectedNodes = nodesWithSourceHandles.filter((node) => {
      const hasOutgoingEdge = edges.some((edge) => edge.source === node.id)
      return !hasOutgoingEdge
    })

    if (unconnectedNodes.length === 0) {
      setValidationStatus({
        isValid: true,
        message: 'All nodes with outputs are connected',
      })
    } else {
      const nodeLabels = unconnectedNodes.map((n) => {
        const label = n.data?.label || n.id
        // If node has a parent, include parent information
        if (n.data?.parentNodeId) {
          const parentNode = nodes.find((parent) => parent.id === n.data.parentNodeId)
          const parentLabel = parentNode?.data?.label || n.data.parentNodeId
          return `${label} (parent: ${parentLabel})`
        }
        return label
      }).join(', ')
      setValidationStatus({
        isValid: false,
        message: `${unconnectedNodes.length} node(s) with outputs are not connected: ${nodeLabels}`,
      })
    }

  }, [nodes, edges])

  const handleDismissValidation = useCallback(() => {
    setValidationStatus({ isValid: null, message: '' })
  }, [])

  const handleOutputCountChange = useCallback((nodeId: string, count: number) => {
    setNodes((nds) => {
      // Update the branching node's output count
      const updatedNodes = nds.map((node) => {
        const nodeType = node.data?.nodeType as NodeType | undefined
        if (node.id === nodeId && nodeType && isBranchingNodeType(nodeType)) {
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
      const branchingNode = updatedNodes.find((n) => {
        const nType = n.data?.nodeType as NodeType | undefined
        return n.id === nodeId && nType && isBranchingNodeType(nType)
      })
      if (!branchingNode) return updatedNodes

      // Get existing output nodes for this branching node
      const existingOutputNodes = updatedNodes.filter((n) => {
        const nType = n.data?.nodeType as NodeType | undefined
        return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === nodeId
      })

      const currentCount = existingOutputNodes.length
      const newCount = count

      // Get layout constants from nodeConfigs
      const branchingConfig = nodeConfigs.branching
      if (!branchingConfig) {
        return updatedNodes
      }

      const padding = branchingConfig.padding || 20
      const headerHeight = branchingConfig.headerHeight || 50
      const outputSpacing = branchingConfig.outputSpacing || 10
      const outputNodeWidth = branchingConfig.outputNodeWidth || 130
      const outputNodeHeight = branchingConfig.outputNodeHeight || 60

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

        const outputConfig = nodeConfigs.branchingOutput
        if (!outputConfig) {
          return nodesWithUpdatedBranching
        }

        for (let i = currentCount; i < newCount; i++) {
          const outputNode = createNodeFromConfig(NODE_TYPES.BRANCHING_OUTPUT, {
            x: branchingPos.x + padding,
            y: branchingPos.y + headerHeight + outputSpacing + i * (outputNodeHeight + outputSpacing),
          }, {
            label: `Output ${i + 1}`,
            parentNodeId: nodeId,
            connectingFrom: null,
          })
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
          const nodeType = node.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingOutputNodeType(nodeType) && node.data.parentNodeId === nodeId) {
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
        const nodeType = node.data?.nodeType as NodeType | undefined
        if (nodeType && isBranchingOutputNodeType(nodeType) && node.data.parentNodeId === nodeId) {
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
  // zIndex values come from nodeConfigs
  const nodesWithHandlers = nodes.map((node) => {
    const nodeType = (node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType
    const config = nodeConfigs[nodeType]
    const zIndex = config?.zIndex ?? 2 // Default fallback

    return {
      ...node,
      data: {
        ...node.data,
        onLabelClick: handleLabelClick,
      },
      draggable: !(node.data?.nodeType && isBranchingOutputNodeType(node.data.nodeType as NodeType)), // Output nodes are not draggable - they move with parent
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
          onValidate={handleValidate}
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
              onOutputCountChange={menuNode.data?.nodeType && isBranchingNodeType(menuNode.data.nodeType as NodeType) ? handleOutputCountChange : undefined}
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

        <ValidationBanner
          isValid={validationStatus.isValid}
          message={validationStatus.message}
          onDismiss={handleDismissValidation}
        />
      </main>
    </div>
  )
}

export default App
