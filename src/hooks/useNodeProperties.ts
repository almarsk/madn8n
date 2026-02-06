import { useMemo, useEffect } from 'react'
import type { Node } from 'reactflow'
import modules from '../modules'
import nodeConfigs, { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES, canOutputNodeBeDeleted } from '../nodeConfigs'
import { getNodeLabel } from '../utils/nodeUtils'
import { isStickerNode } from '../utils/moduleHelpers'
import type { CustomFlowMetadata } from '../utils/translationHelpers'

export interface NodePropertiesOptions {
  nodes: Node[]
  flowMetadata: CustomFlowMetadata
  draggingNodeIds: Set<string>
  handleLabelClick: (nodeId: string) => void
  highestZIndexRef: React.MutableRefObject<number>
}

export function useNodeProperties({
  nodes,
  flowMetadata,
  draggingNodeIds,
  handleLabelClick,
  highestZIndexRef,
}: NodePropertiesOptions): Node[] {
  return useMemo(() => {
    // First pass: calculate consistent z-index "bands" for branching nodes and their outputs
    // Each branching node + its outputs form a contiguous band:
    // - branching node at bandZ
    // - its outputs at bandZ + 1
    // Bands themselves never interleave, so overlapping branching groups don't visually mingle.
    const branchingNodeZIndexes = new Map<string, number>()

    type BranchingDescriptor = {
      id: string
      selected: boolean
      baseZ: number
    }

    const branchingDescriptors: BranchingDescriptor[] = nodes
      .map((node) => {
        const nodeType = (node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType
        if (!isBranchingNodeType(nodeType)) return null
        const config = nodeConfigs[nodeType]
        const baseZ = node.zIndex ?? config?.zIndex ?? 10
        return {
          id: node.id,
          selected: !!node.selected,
          baseZ,
        }
      })
      .filter((d): d is BranchingDescriptor => d !== null)

    // Order bands so that:
    // - unselected branching groups are below selected ones
    // - within each group, preserve a stable order using baseZ then id
    branchingDescriptors.sort((a, b) => {
      if (a.selected !== b.selected) {
        return a.selected ? 1 : -1
      }
      if (a.baseZ !== b.baseZ) {
        return a.baseZ - b.baseZ
      }
      return a.id.localeCompare(b.id)
    })

    const BAND_SIZE = 10
    let currentBandBase = 20 // keep above default single nodes (zIndex 2) and edges (zIndex 2)

    branchingDescriptors.forEach((desc) => {
      const parentZ = currentBandBase
      branchingNodeZIndexes.set(desc.id, parentZ)
      currentBandBase += BAND_SIZE
    })

    // Keep track of the highest z-index in use so newly created nodes can appear on top
    if (currentBandBase > highestZIndexRef.current) {
      highestZIndexRef.current = currentBandBase
    }

    // Calculate highest z-index for dragged nodes
    const maxZIndexForDragging = Math.max(
      currentBandBase,
      highestZIndexRef.current,
      ...Array.from(branchingNodeZIndexes.values())
    )
    const draggingZIndex = maxZIndexForDragging + 1000 // Very high z-index for dragged nodes

    return nodes.map((node) => {
      const nodeType = (node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType
      const config = nodeConfigs[nodeType]
      // Default zIndex for non-branching nodes: use existing or config default
      let zIndex = node.zIndex ?? config?.zIndex ?? 2

      // If node is being dragged, give it highest z-index
      if (draggingNodeIds.has(node.id)) {
        zIndex = draggingZIndex
      }
      // For branching nodes, use the band z-index we computed above
      else if (isBranchingNodeType(nodeType)) {
        const bandZ = branchingNodeZIndexes.get(node.id)
        if (bandZ !== undefined) {
          zIndex = bandZ
        }
      } else if (isBranchingOutputNodeType(nodeType) && node.data?.parentNodeId) {
        // Output nodes always sit just above their own parent, within the same band
        const parentId = node.data.parentNodeId
        const parentBandZ = branchingNodeZIndexes.get(parentId)
        const isParentDragging = draggingNodeIds.has(parentId)

        if (isParentDragging) {
          // If parent is being dragged, output node should be above parent (above draggingZIndex)
          zIndex = draggingZIndex + 1
        } else if (parentBandZ !== undefined) {
          zIndex = parentBandZ + 1
        } else {
          // Fallback if parent band not found: keep them slightly above their parent/config base
          const parentNode = nodes.find((n) => n.id === parentId)
          const parentConfig = parentNode?.data?.nodeType ? nodeConfigs[parentNode.data.nodeType as NodeType] : undefined
          const fallbackParentZ = parentNode?.zIndex ?? parentConfig?.zIndex ?? 10
          zIndex = fallbackParentZ + 1
        }
      }

      // Update highestZIndexRef to track the maximum z-index in use (for future node creations)
      if (typeof zIndex === 'number' && zIndex > highestZIndexRef.current && !draggingNodeIds.has(node.id)) {
        highestZIndexRef.current = zIndex
      }

      // Recalculate label based on module config
      const module = node.data?.moduleName ? modules.find((m) => m.name === node.data.moduleName) : undefined

      // For internal handling output nodes, use predefined labels from module config
      let calculatedLabel = getNodeLabel(module, node.data, nodeType, flowMetadata.stickers)
      if (isBranchingOutputNodeType(nodeType) && module?.outputConfig?.type === 'internal' && module.outputLabels) {
        const outputIndex = node.data?.outputIndex ?? 0
        calculatedLabel = module.outputLabels[outputIndex] || calculatedLabel
      }

      // For any node with a param of type "stickers", add stickerColor based on the first selected sticker
      // Find the parameter with type "stickers" (not just a parameter named "stickers")
      const stickersParam = module?.params?.find(p => p.type === 'stickers')
      const stickersParamName = stickersParam?.name
      const stickersParamValue = stickersParamName ? node.data?.params?.[stickersParamName] : undefined
      const hasStickersParam = Array.isArray(stickersParamValue) && stickersParamValue.length > 0

      return {
        ...node,
        data: {
          ...node.data,
          label: calculatedLabel,
          onLabelClick: handleLabelClick,
          ...(hasStickersParam
            ? {
              stickerColor: (() => {
                const firstStickerId = stickersParamValue[0]
                const sticker = flowMetadata.stickers?.[firstStickerId]
                // Use a distinct fallback color that's clearly different from default node color (rgba(30, 41, 59, 0.95))
                return sticker?.appearance?.color || 'rgba(30, 41, 59, 0.95)'
              })(),
            }
            : {}),
        },
        draggable: (() => {
          // List param output nodes are draggable for reordering, others are not
          const nodeType = node.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingOutputNodeType(nodeType)) {
            return canOutputNodeBeDeleted(nodeType) // Only list param output nodes (deletable ones) are draggable
          }
          return true // All other nodes are draggable
        })(),
        selectable: (() => {
          // Output nodes that cannot be deleted should not be selectable
          const nodeType = node.data?.nodeType as NodeType | undefined
          if (nodeType && isBranchingOutputNodeType(nodeType)) {
            return canOutputNodeBeDeleted(nodeType) // Only selectable if deletable
          }
          return true
        })(),
        zIndex,
        // Add className to node for CSS animation targeting (ReactFlow applies this to the wrapper)
        className: isBranchingOutputNodeType(nodeType)
          ? 'branching-output-node-wrapper'
          : isStickerNode(node)
            ? 'sticker-node-wrapper'
            : undefined,
      }
    })
  }, [nodes, flowMetadata, draggingNodeIds, handleLabelClick, highestZIndexRef])
}
