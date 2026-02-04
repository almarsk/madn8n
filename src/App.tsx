import { useCallback, useRef, useState, useEffect } from 'react'
import { ReactFlowInstance, useEdgesState, useNodesState, type Node } from 'reactflow'
import './App.css'
import modules, { type Module } from './modules'
import nodeConfigs, { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES } from './nodeConfigs'
import { useHistory } from './hooks/useHistory'

// Helper to parse Pythonic type notation (e.g., "list[str]", "dict", "list[number]")
const parseType = (typeStr: string | undefined): { base: string; inner?: string } => {
  if (!typeStr) return { base: 'string' }

  // Match list[type] or dict[type]
  const listMatch = typeStr.match(/^list\[(.+)\]$/)
  if (listMatch) {
    return { base: 'list', inner: listMatch[1] }
  }

  const dictMatch = typeStr.match(/^dict(?:\[(.+)\])?$/)
  if (dictMatch) {
    return { base: 'dict', inner: dictMatch[1] }
  }

  return { base: typeStr }
}

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

// Helper function to get node label from module config and node data
const getNodeLabel = (module: Module | undefined, nodeData: any, nodeType?: NodeType): string => {
  if (!module) {
    return nodeData?.label || 'Unknown'
  }

  // For branching output nodes, use the value param directly
  if (nodeType === NODE_TYPES.BRANCHING_OUTPUT) {
    if (nodeData?.params?.value !== undefined && nodeData.params.value !== null && nodeData.params.value !== '') {
      return String(nodeData.params.value)
    }
    return nodeData?.label || 'Output'
  }

  // If module has a labelParam, use that param's value
  if (module.labelParam && nodeData?.params && nodeData.params[module.labelParam] !== undefined) {
    const paramValue = nodeData.params[module.labelParam]
    // Convert to string for display
    if (paramValue !== null && paramValue !== undefined && paramValue !== '') {
      return String(paramValue)
    }
  }

  // Fallback to module name
  return module.name
}

// Helper function to create a node based on nodeConfig
const createNodeFromConfig = (
  nodeType: NodeType,
  position: { x: number; y: number },
  options: {
    moduleName?: string
    label?: string
    outputCount?: number
    parentNodeId?: string
    connectingFrom?: string | null
    params?: Record<string, any>
  } = {}
): Node => {
  const config = nodeConfigs[nodeType]
  if (!config) {
    throw new Error(`Unknown node type: ${nodeType}`)
  }

  const module = options.moduleName ? modules.find((m) => m.name === options.moduleName) : undefined

  // Initialize params from module if provided
  const initialParams: Record<string, any> = {}
  if (module) {
    Object.keys(module.params).forEach((paramName) => {
      const param = module.params[paramName]
      // Set default value based on type
      if (param.type === 'number') {
        initialParams[paramName] = 0
      } else if (param.type === 'boolean') {
        initialParams[paramName] = false
      } else {
        const { base } = parseType(param.type)
        if (base === 'list') {
          initialParams[paramName] = []
        } else if (base === 'dict') {
          initialParams[paramName] = {}
        } else {
          initialParams[paramName] = ''
        }
      }
    })
  }

  // Merge with provided params
  const nodeParams = { ...initialParams, ...(options.params || {}) }

  // Calculate label
  const nodeData: any = {
    ...config,
    nodeType,
    connectingFrom: options.connectingFrom ?? null,
    moduleName: options.moduleName,
    params: nodeParams,
    ...(options.outputCount !== undefined && { outputCount: options.outputCount }),
    ...(options.parentNodeId && { parentNodeId: options.parentNodeId }),
  }

  // Set label using helper function
  nodeData.label = getNodeLabel(module, nodeData, nodeType)

  const node: Node = {
    id: getId(),
    type: 'nodeFactory',
    position,
    data: nodeData,
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
  moduleName?: string
): Node[] => {
  const branchingConfig = nodeConfigs.branching
  const outputConfig = nodeConfigs.branchingOutput

  if (!branchingConfig || !outputConfig) {
    throw new Error('Branching or output config not found')
  }

  const module = moduleName ? modules.find((m) => m.name === moduleName) : undefined

  const padding = branchingConfig.padding || 20
  const headerHeight = branchingConfig.headerHeight || 50
  const outputSpacing = branchingConfig.outputSpacing || 10
  const outputNodeWidth = branchingConfig.outputNodeWidth || 130
  const outputNodeHeight = branchingConfig.outputNodeHeight || 60

  // Calculate branching node size based on output count
  const branchingNodeWidth = outputNodeWidth + padding * 2
  const branchingNodeHeight = headerHeight + outputSpacing + (outputCount * outputNodeHeight) + ((outputCount - 1) * outputSpacing) + padding

  const branchingNodeId = getId()

  // Initialize params from module if provided
  const initialParams: Record<string, any> = {}
  if (module) {
    Object.keys(module.params).forEach((paramName) => {
      const param = module.params[paramName]
      if (param.type === 'number') {
        initialParams[paramName] = 0
      } else if (param.type === 'boolean') {
        initialParams[paramName] = false
      } else {
        const { base } = parseType(param.type)
        if (base === 'list') {
          initialParams[paramName] = []
        } else if (base === 'dict') {
          initialParams[paramName] = {}
        } else {
          initialParams[paramName] = ''
        }
      }
    })
  }

  const branchingNodeData: any = {
    ...branchingConfig,
    nodeType: NODE_TYPES.BRANCHING,
    outputCount,
    connectingFrom: null,
    moduleName: moduleName,
    params: initialParams,
  }

  branchingNodeData.label = getNodeLabel(module, branchingNodeData, NODE_TYPES.BRANCHING)

  const branchingNode: Node = {
    id: branchingNodeId,
    type: 'nodeFactory',
    position,
    data: branchingNodeData,
    style: {
      width: branchingNodeWidth,
      height: branchingNodeHeight,
    },
    zIndex: branchingConfig.zIndex,
  }

  // Create output nodes
  const outputNodes: Node[] = []
  for (let i = 0; i < outputCount; i++) {
    // Determine output node label based on outputConfig
    let outputLabel = `Output ${i + 1}`
    let outputParams: Record<string, any> = {}

    if (module?.outputConfig) {
      if (module.outputConfig.type === 'listParam') {
        // For listParam type, we'll initialize the param but label stays default for now
        // The actual value will come from the menu
        const listParam = module.params[module.outputConfig.listParamName]
        if (listParam) {
          // Initialize based on list element type (assuming it's an array of the param type)
          // For now, just use string as default
          outputParams.value = ''
        }
      } else if (module.outputConfig.type === 'internal') {
        // For internal type, just use default label
        outputLabel = `Output ${i + 1}`
      }
    }

    const outputNodeData: any = {
      ...outputConfig,
      nodeType: NODE_TYPES.BRANCHING_OUTPUT,
      parentNodeId: branchingNodeId,
      connectingFrom: null,
      moduleName: moduleName,
      params: outputParams,
      label: outputLabel,
    }

    const outputNode: Node = {
      id: getId(),
      type: 'nodeFactory',
      position: {
        x: position.x + padding,
        y: position.y + headerHeight + outputSpacing + i * (outputNodeHeight + outputSpacing),
      },
      data: outputNodeData,
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

  const history = useHistory()

  const { isValidConnection, onConnectStart, onConnectEnd, onConnect: onConnectOriginal } = useConnectionHandlers({
    edges,
    setEdges,
    setNodes,
  })

  // Helper to save history before state changes
  const saveHistoryBeforeChange = useCallback(() => {
    if (!isLocked) {
      history.saveState(nodes, edges)
    }
  }, [nodes, edges, history, isLocked])

  // Wrap onConnect to save history before adding edge
  const onConnect = useCallback(
    (params: any) => {
      if (!isLocked) {
        saveHistoryBeforeChange()
      }
      onConnectOriginal(params)
    },
    [onConnectOriginal, saveHistoryBeforeChange, isLocked]
  )

  // Debounce timer for position changes
  const positionChangeTimerRef = useRef<number | null>(null)

  // Save history for position changes (debounced)
  const saveHistoryForPositionChange = useCallback(() => {
    if (positionChangeTimerRef.current) {
      clearTimeout(positionChangeTimerRef.current)
    }
    positionChangeTimerRef.current = window.setTimeout(() => {
      if (!isLocked) {
        // Save current state after position change (debounced)
        history.saveState(nodes, edges)
      }
    }, 300) // 300ms debounce
  }, [nodes, edges, history, isLocked])

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

      // Save history before adding nodes
      saveHistoryBeforeChange()

      // Create node(s) based on config type
      if (isBranchingNodeType(module.type)) {
        const branchingConfig = nodeConfigs.branching
        // For internal type, use the fixed output count from module config
        // For listParam type, use default from nodeConfig
        let outputCount = branchingConfig?.defaultOutputCount ?? 1
        if (module.outputConfig?.type === 'internal') {
          outputCount = module.outputConfig.outputCount
        }
        const nodes = createBranchingNodeWithOutputs(position, outputCount, module.name)
        setNodes((nds) => nds.concat(nodes))
      } else {
        // Single node (or any other non-branching type)
        const newNode = createNodeFromConfig(module.type as NodeType, position, {
          moduleName: module.name,
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

        // Save history before adding nodes
        if (!isLocked) {
          saveHistoryBeforeChange()
        }

        // Create node(s) based on config type
        if (isBranchingNodeType(module.type)) {
          const branchingConfig = nodeConfigs.branching
          // For internal type, use the fixed output count from module config
          // For listParam type, use default from nodeConfig
          let outputCount = branchingConfig?.defaultOutputCount ?? 1
          if (module.outputConfig?.type === 'internal') {
            outputCount = module.outputConfig.outputCount
          }
          const nodes = createBranchingNodeWithOutputs(finalPosition, outputCount, module.name)
          return nds.concat(nodes)
        } else {
          // Single node (or any other non-branching type)
          const newNode = createNodeFromConfig(module.type as NodeType, finalPosition, {
            moduleName: module.name,
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

      // Only fit view on initial load if there are no nodes yet
      if (nodes.length === 0) {
        // Small delay to ensure ReactFlow is fully initialized
        setTimeout(() => {
          instance.fitView({ padding: 0.2, duration: 0 })
        }, 100)
      }
    },
    [nodes.length]
  )

  // Wrap onEdgesChange to maintain compatibility and save history
  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      // Save history for non-select changes
      const hasNonSelectChanges = changes.some((change) => change.type !== 'select')
      if (hasNonSelectChanges && !isLocked) {
        saveHistoryBeforeChange()
      }
      onEdgesChange(changes)
    },
    [onEdgesChange, saveHistoryBeforeChange, isLocked]
  )

  // Wrap onNodesChange to clean up output nodes when branching node is deleted
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      // Check if any branching nodes are being removed or moved
      const removedBranchingNodeIds = new Set<string>()
      const movedBranchingNodeIds = new Set<string>()
      const selectedOutputNodeIds = new Set<string>()
      const hasPositionChanges = changes.some((change) => change.type === 'position')
      const hasNonPositionChanges = changes.some((change) => change.type !== 'position' && change.type !== 'select')

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
        } else if (change.type === 'select' && change.selected) {
          // Track when output nodes are selected
          const node = nodes.find((n) => n.id === change.id)
          const nodeType = node?.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingOutputNodeType(nodeType)) {
            selectedOutputNodeIds.add(change.id)
          }
        }
      })

      // Save history for non-position changes immediately
      if (hasNonPositionChanges && !isLocked) {
        saveHistoryBeforeChange()
      }
      // For position changes, use debounced save
      if (hasPositionChanges && !hasNonPositionChanges && !isLocked) {
        saveHistoryForPositionChange()
      }

      // If an output node is being selected, deselect its parent branching node
      if (selectedOutputNodeIds.size > 0) {
        const parentNodeIds = new Set<string>()
        nodes.forEach((node) => {
          if (selectedOutputNodeIds.has(node.id) && node.data?.parentNodeId) {
            parentNodeIds.add(node.data.parentNodeId)
          }
        })

        if (parentNodeIds.size > 0) {
          // Add deselection changes for parent nodes
          parentNodeIds.forEach((parentId) => {
            changes.push({
              id: parentId,
              type: 'select',
              selected: false,
            })
          })
        }
      }

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

  const handleNodeDataUpdate = useCallback((nodeId: string, updatedData: any) => {
    // Save history before updating node data
    if (!isLocked) {
      saveHistoryBeforeChange()
    }
    setNodes((nds) => {
      return nds.map((node) => {
        if (node.id === nodeId) {
          const updatedNode = {
            ...node,
            data: {
              ...node.data,
              ...updatedData,
            },
          }

          // Recalculate label if module info is available
          if (updatedNode.data.moduleName) {
            const module = modules.find((m) => m.name === updatedNode.data.moduleName)
            const nodeType = updatedNode.data?.nodeType as NodeType | undefined
            updatedNode.data.label = getNodeLabel(module, updatedNode.data, nodeType)
          }

          return updatedNode
        }
        return node
      })
    })
  }, [setNodes, saveHistoryBeforeChange, isLocked])

  const handleExportJson = useCallback(() => {
    if (!reactFlowInstance) {
      console.warn('ReactFlow instance not available')
      return
    }

    // Export only module logic: nodes, edges, and params (no config info)
    const exportData = {
      nodes: nodes.map((node) => {
        const nodeType = node.data?.nodeType as NodeType | undefined
        return {
          id: node.id,
          type: nodeType || 'single', // Use actual nodeType instead of 'nodeFactory'
          position: node.position,
          data: {
            moduleName: node.data?.moduleName,
            params: node.data?.params || {},
            ...(node.data?.parentNodeId && { parentNodeId: node.data.parentNodeId }),
            ...(node.data?.outputCount !== undefined && { outputCount: node.data.outputCount }),
          },
        }
      }),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(edge.sourceHandle && { sourceHandle: edge.sourceHandle }),
        ...(edge.targetHandle && { targetHandle: edge.targetHandle }),
      })),
    }

    console.log('Export JSON:', JSON.stringify(exportData, null, 2))

    // Also copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2)).then(() => {
      console.log('JSON copied to clipboard')
    }).catch((err) => {
      console.error('Failed to copy to clipboard:', err)
    })
  }, [reactFlowInstance, nodes, edges])

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

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    if (!history.canUndo || isLocked) return

    const previousState = history.undo()
    if (previousState) {
      // Preserve openMenuNodeId if the node still exists after undo
      const currentNodeStillExists = previousState.nodes.some((n) => n.id === openMenuNodeId)
      if (!currentNodeStillExists) {
        setOpenMenuNodeId(null)
      }

      setNodes(previousState.nodes)
      setEdges(previousState.edges)
    }
  }, [history, isLocked, setNodes, setEdges, openMenuNodeId])

  const handleRedo = useCallback(() => {
    if (!history.canRedo || isLocked) return

    const nextState = history.redo()
    if (nextState) {
      // Preserve openMenuNodeId if the node still exists after redo
      const currentNodeStillExists = nextState.nodes.some((n) => n.id === openMenuNodeId)
      if (!currentNodeStillExists) {
        setOpenMenuNodeId(null)
      }

      setNodes(nextState.nodes)
      setEdges(nextState.edges)
    }
  }, [history, isLocked, setNodes, setEdges, openMenuNodeId])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Check for Ctrl+Z (or Cmd+Z on Mac) for undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
      }
      // Check for Ctrl+Shift+Z or Ctrl+Y (or Cmd+Shift+Z/Cmd+Y on Mac) for redo
      else if ((event.ctrlKey || event.metaKey) && (event.key === 'Z' || event.key === 'y' || event.key === 'Y')) {
        event.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleUndo, handleRedo])

  const handleOutputCountChange = useCallback((nodeId: string, count: number) => {
    // Find the node and check if it's internal type (output count is fixed)
    const node = nodes.find((n) => n.id === nodeId)
    if (node?.data?.moduleName) {
      const module = modules.find((m) => m.name === node.data.moduleName)
      if (module?.outputConfig?.type === 'internal') {
        // Don't allow output count changes for internal type
        return
      }
    }

    if (!isLocked) {
      saveHistoryBeforeChange()
    }
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

        // Get module info from branching node
        const branchingModule = branchingNode.data?.moduleName ? modules.find((m) => m.name === branchingNode.data.moduleName) : undefined

        for (let i = currentCount; i < newCount; i++) {
          // Determine output node params based on outputConfig
          let outputParams: Record<string, any> = {}
          let outputLabel = `Output ${i + 1}`

          if (branchingModule?.outputConfig) {
            if (branchingModule.outputConfig.type === 'listParam' && branchingModule.outputConfig.listParamName) {
              const listParam = branchingModule.params[branchingModule.outputConfig.listParamName]
              if (listParam) {
                // Initialize based on param type
                if (listParam.type === 'number') {
                  outputParams.value = 0
                } else if (listParam.type === 'boolean') {
                  outputParams.value = false
                } else {
                  outputParams.value = ''
                }
              }
            }
          }

          const outputNode = createNodeFromConfig(NODE_TYPES.BRANCHING_OUTPUT, {
            x: branchingPos.x + padding,
            y: branchingPos.y + headerHeight + outputSpacing + i * (outputNodeHeight + outputSpacing),
          }, {
            moduleName: branchingNode.data?.moduleName,
            parentNodeId: nodeId,
            connectingFrom: null,
            params: outputParams,
          })

          // Set label for output node
          outputNode.data.label = outputLabel
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

  const handleAddOutput = useCallback((nodeId: string) => {
    setNodes((nds) => {
      const branchingNode = nds.find((n) => n.id === nodeId)
      if (!branchingNode) return nds

      const module = branchingNode.data?.moduleName ? modules.find((m) => m.name === branchingNode.data.moduleName) : undefined
      if (!module?.outputConfig || module.outputConfig.type !== 'listParam') {
        return nds
      }

      const listParamName = module.outputConfig.listParamName
      const currentArray = Array.isArray(branchingNode.data?.params?.[listParamName])
        ? [...branchingNode.data.params[listParamName]]
        : []

      // Add new empty value to array
      const { inner } = parseType(module.params[listParamName]?.type)
      let newValue: any = ''
      if (inner === 'number') {
        newValue = 0
      } else if (inner === 'boolean') {
        newValue = false
      }

      const updatedArray = [...currentArray, newValue]

      // Update the branching node's params
      const updatedNodes = nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              params: {
                ...node.data.params,
                [listParamName]: updatedArray,
              },
            },
          }
        }
        return node
      })

      // Get existing output nodes
      const existingOutputNodes = updatedNodes.filter((n) => {
        const nType = n.data?.nodeType as NodeType | undefined
        return nType && isBranchingOutputNodeType(nType) && n.data.parentNodeId === nodeId
      })

      const branchingConfig = nodeConfigs.branching
      if (!branchingConfig) return updatedNodes

      const padding = branchingConfig.padding || 20
      const headerHeight = branchingConfig.headerHeight || 50
      const outputSpacing = branchingConfig.outputSpacing || 10
      const outputNodeWidth = branchingConfig.outputNodeWidth || 130
      const outputNodeHeight = branchingConfig.outputNodeHeight || 60

      // Create new output node
      const newIndex = existingOutputNodes.length
      const branchingPos = branchingNode.position || { x: 0, y: 0 }

      const outputParams: Record<string, any> = { value: newValue }
      const outputNode = createNodeFromConfig(NODE_TYPES.BRANCHING_OUTPUT, {
        x: branchingPos.x + padding,
        y: branchingPos.y + headerHeight + outputSpacing + newIndex * (outputNodeHeight + outputSpacing),
      }, {
        moduleName: branchingNode.data?.moduleName,
        parentNodeId: nodeId,
        connectingFrom: null,
        params: outputParams,
      })

      outputNode.data.label = String(newValue) || 'Output'

      // Update branching node size
      const newOutputCount = newIndex + 1
      const branchingNodeWidth = outputNodeWidth + padding * 2
      const branchingNodeHeight = headerHeight + outputSpacing + (newOutputCount * outputNodeHeight) + ((newOutputCount - 1) * outputSpacing) + padding

      const finalNodes = updatedNodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            style: {
              ...node.style,
              width: branchingNodeWidth,
              height: branchingNodeHeight,
            },
            data: {
              ...node.data,
              outputCount: newOutputCount,
            },
          }
        }
        return node
      })

      return [...finalNodes, outputNode]
    })
  }, [setNodes, saveHistoryBeforeChange, isLocked])

  // Update nodes with label click handler, make output nodes non-draggable, and set zIndex for proper layering
  // zIndex values come from nodeConfigs
  // Also recalculate labels dynamically based on module config
  const nodesWithHandlers = nodes.map((node) => {
    const nodeType = (node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType
    const config = nodeConfigs[nodeType]
    const zIndex = config?.zIndex ?? 2 // Default fallback

    // Recalculate label based on module config
    const module = node.data?.moduleName ? modules.find((m) => m.name === node.data.moduleName) : undefined
    const calculatedLabel = getNodeLabel(module, node.data, nodeType)

    return {
      ...node,
      data: {
        ...node.data,
        label: calculatedLabel,
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
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
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
              onNodeDataUpdate={handleNodeDataUpdate}
              onAddOutput={menuNode.data?.nodeType && isBranchingNodeType(menuNode.data.nodeType as NodeType) ? handleAddOutput : undefined}
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
