import { useCallback } from 'react'
import type { ReactFlowInstance, Node } from 'reactflow'
import modules from '../modules'
import nodeConfigs, { type NodeType, isBranchingNodeType } from '../nodeConfigs'
import { createNodeFromConfig, createBranchingNodeWithOutputs } from '../utils/nodeCreation'
import { isStartModule, isStartNode } from '../utils/moduleHelpers'

export interface NodeCreationActions {
  onDragOver: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent) => void
  onNodeDragStart: (type: string) => (event: React.DragEvent) => void
  onSidebarNodeClick: (moduleName: string) => void
}

export function useNodeCreation(
  reactFlowWrapper: React.RefObject<HTMLDivElement>,
  reactFlowInstance: ReactFlowInstance | null,
  nodes: Node[],
  setNodes: (updater: (nodes: Node[]) => Node[]) => void,
  highestZIndexRef: React.MutableRefObject<number>,
  saveHistoryBeforeChange: () => void,
  isLocked: boolean,
  setOpenMenuNodeId: (id: string | null) => void,
  setMenuPosition: (position: { x: number; y: number } | null) => void
): NodeCreationActions {
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

      // Prevent creating multiple start nodes
      if (isStartModule(module.name)) {
        const existingStartNode = nodes.find((n) => isStartNode(n))
        if (existingStartNode) {
          return // Don't create another start node
        }
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
        const branchingConfig = nodeConfigs[module.type]
        // For internal type, use the fixed output count from module config
        // For listParam type, use default from nodeConfig
        let outputCount = branchingConfig?.defaultOutputCount ?? 1
        if (module.outputConfig?.type === 'internal') {
          outputCount = module.outputConfig.outputCount
        }
        const nodesToAdd = createBranchingNodeWithOutputs(position, outputCount, module.name, module.type as NodeType)
        // Set z-index for newly created nodes to appear on top
        // Find the highest z-index among all existing nodes
        setNodes((nds) => {
          const maxZIndex = nds.reduce((max, n) => {
            const z = typeof n.zIndex === 'number' ? n.zIndex : 0
            return Math.max(max, z)
          }, highestZIndexRef.current)
          const baseZIndex = maxZIndex + 1
          highestZIndexRef.current = baseZIndex + outputCount
          const nodesWithZIndex = nodesToAdd.map((node, idx) => ({
            ...node,
            zIndex: baseZIndex + idx,
          }))
          return nds.concat(nodesWithZIndex)
        })
      } else {
        // Single node (or any other non-branching type)
        const newNode = createNodeFromConfig(module.type as NodeType, position, {
          moduleName: module.name,
          connectingFrom: null,
        })
        // Set z-index for newly created node to appear on top
        setNodes((nds) => {
          const maxZIndex = nds.reduce((max, n) => {
            const z = typeof n.zIndex === 'number' ? n.zIndex : 0
            return Math.max(max, z)
          }, highestZIndexRef.current)
          const newZIndex = maxZIndex + 1
          highestZIndexRef.current = newZIndex
          return nds.concat({ ...newNode, zIndex: newZIndex })
        })
      }

      // Close menu when adding a new node
      setOpenMenuNodeId(null)
      setMenuPosition(null)
    },
    [reactFlowInstance, setNodes, saveHistoryBeforeChange, isLocked, setOpenMenuNodeId, setMenuPosition, nodes, reactFlowWrapper, highestZIndexRef]
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

      const position = reactFlowInstance.screenToFlowPosition({
        x: centerX,
        y: centerY,
      })

      // Check if there's already a node at this position and offset if needed
      const singleConfig = nodeConfigs.single
      const nodeWidth = singleConfig?.defaultWidth || 180
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

        // Prevent creating multiple start nodes
        if (isStartModule(module.name)) {
          const existingStartNode = nds.find((n) => isStartNode(n))
          if (existingStartNode) {
            return nds // Don't create another start node
          }
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
          const branchingConfig = nodeConfigs.branchingInternal || nodeConfigs.branchingListParam
          // For internal type, use the fixed output count from module config
          // For listParam type, use default from nodeConfig
          let outputCount = branchingConfig?.defaultOutputCount ?? 1
          if (module.outputConfig?.type === 'internal') {
            outputCount = module.outputConfig.outputCount
          }
          const nodesToAdd = createBranchingNodeWithOutputs(finalPosition, outputCount, module.name, module.type as NodeType)
          // Set z-index for newly created nodes to appear on top
          // Find the highest z-index among all existing nodes
          const maxZIndex = nds.reduce((max, n) => {
            const z = typeof n.zIndex === 'number' ? n.zIndex : 0
            return Math.max(max, z)
          }, highestZIndexRef.current)
          const baseZIndex = maxZIndex + 1
          highestZIndexRef.current = baseZIndex + outputCount

          // Deselect all existing nodes
          const clearedNodes = nds.map((node) => ({ ...node, selected: false }))

          // Apply z-index and select only the main branching node (first in array)
          const nodesWithZIndex = nodesToAdd.map((node, idx) => ({
            ...node,
            zIndex: baseZIndex + idx,
            selected: idx === 0,
          }))

          return clearedNodes.concat(nodesWithZIndex)
        } else {
          // Single node (or any other non-branching type)
          const newNode = createNodeFromConfig(module.type as NodeType, finalPosition, {
            moduleName: module.name,
            connectingFrom: null,
          })
          // Set z-index for newly created node to appear on top
          const maxZIndex = nds.reduce((max, n) => {
            const z = typeof n.zIndex === 'number' ? n.zIndex : 0
            return Math.max(max, z)
          }, highestZIndexRef.current)
          const newZIndex = maxZIndex + 1
          highestZIndexRef.current = newZIndex
          // Deselect all existing nodes and select the newly added one
          const clearedNodes = nds.map((node) => ({ ...node, selected: false }))
          return clearedNodes.concat({ ...newNode, zIndex: newZIndex, selected: true })
        }

        // Return unchanged if no module found
        return nds
      })

      // Close menu when adding a new node
      setOpenMenuNodeId(null)
      setMenuPosition(null)
    },
    [reactFlowInstance, setNodes, modules, saveHistoryBeforeChange, isLocked, setOpenMenuNodeId, setMenuPosition, reactFlowWrapper, highestZIndexRef]
  )

  return {
    onDragOver,
    onDrop,
    onNodeDragStart,
    onSidebarNodeClick,
  }
}
