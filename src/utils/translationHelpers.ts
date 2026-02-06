import { type Node, type Edge, MarkerType } from 'reactflow'
import { type NodeType, isBranchingOutputNodeType, isBranchingNodeType, nodeConfigs } from '../nodeConfigs'
import modules from '../modules'
import { REACTFLOW_NODE_TYPE, createBranchingNodeWithOutputs, createNodeFromConfig } from './nodeCreation'
import { autoLayout } from './layoutHelpers'
import { calculateOutputNodePosition, getBranchingLayoutConstants, calculateBranchingNodeHeight } from './branchingNodeHelpers'
import { isStartModule, getStartModule, isStickerNode } from './moduleHelpers'

// Custom JSON format types
export interface CustomFlowMetadata {
  description: string
  language: string
  mchannels_bot_id: string
  name: string
  omnichannel_config?: {
    [key: string]: any
  }
  stickers?: {
    [key: string]: any
  }
}

// Dialog / bot JSON structure (high‑level target format for the JSON editor)
export interface DialogModule {
  type: string
  params: Record<string, any>
  handlers?: Record<string, string>
  source?: {
    path?: string
    unpack_params?: boolean
  }
}

export interface DialogConfig {
  modules: Record<string, DialogModule>
  root_module: string
  stickers: Record<string, any>
  initial_user_response_timeout: number
}

export interface CurrentBotVersion {
  description: string
  permanent: boolean
  task_values: Record<string, any>
  language: string
  channel: string
  bot_id: string
  mchannels_bot_id: string
  created_at: string
  id: string
  updated_at: string
  name: string
  dialog: DialogConfig
  omnichannel_config?: {
    [key: string]: any
  }
  // Allow additional backend fields
  [key: string]: any
}

export interface CustomFlowJson {
  account_id: string
  current_bot_version_id: string
  created_at: string
  id: string
  labels: any[]
  current_bot_version: CurrentBotVersion
}

// ReactFlow JSON format (what we currently export)
export interface ReactFlowJson {
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: {
      moduleName?: string
      params?: Record<string, any>
      parentNodeId?: string
      outputCount?: number
      nodeType?: NodeType
      [key: string]: any
    }
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
  }>
}

/**
 * Get handler names for a module from its configuration.
 * Returns the handlers array from module config, or defaults based on node type.
 */
function getHandlerNamesForModule(moduleMeta: typeof modules[number] | undefined, nodeType: NodeType): string[] {
  // If module has explicit handlers configured, use them
  if (moduleMeta?.handlers && moduleMeta.handlers.length > 0) {
    return moduleMeta.handlers
  }

  // For branching nodes, handlers are determined dynamically from output nodes (on_0, on_1, etc.)
  // This is handled separately in the code
  if (isBranchingNodeType(nodeType)) {
    return [] // Will be populated dynamically
  }

  // Default for simple nodes: use "on_1" as fallback
  return ['on_1']
}

/**
 * Helper: build dialog.modules + handlers map from ReactFlow nodes/edges.
 *
 * - Each "module" corresponds to a node that is NOT a branching output node.
 * - Simple nodes get handlers from module config (e.g., "on_1").
 * - Branching nodes collect handlers from their output nodes as "on_0", "on_1", ...
 * - All nodes have handlers in the output (empty string if unconnected).
 */
function buildDialogFromReactFlow(
  reactFlowData: ReactFlowJson,
  metadata: CustomFlowMetadata,
  rootModuleIdHint?: string
): DialogConfig {
  const nodesById = new Map<string, ReactFlowJson['nodes'][number]>()
  reactFlowData.nodes.forEach((n) => nodesById.set(n.id, n))

  // 1) Decide which ReactFlow nodes are "modules" (exclude branching outputs and start node)
  const moduleIds: string[] = []
  let startNodeId: string | undefined
  for (const node of reactFlowData.nodes) {
    const nodeType = (node.data?.nodeType || node.type) as NodeType
    const moduleName = node.data?.moduleName

    // Skip branching output nodes
    if (isBranchingOutputNodeType(nodeType)) {
      continue
    }

    // Track start node separately - it doesn't appear in modules
    if (isStartModule(moduleName)) {
      startNodeId = node.id
      continue
    }

    moduleIds.push(node.id)
  }

  // 2) Build basic module objects (type + params, no handlers yet)
  const modulesRecord: Record<string, DialogModule> = {}
  for (const nodeId of moduleIds) {
    const node = nodesById.get(nodeId)!
    const nodeType = (node.data?.nodeType || node.type) as NodeType

    const moduleMeta = node.data?.moduleName
      ? modules.find((m) => m.name === node.data.moduleName)
      : undefined

    // Use name (now required field)
    let moduleTypeString = moduleMeta?.name ?? (nodeType as string) ?? 'single'

    // Start with all params from the node
    let params = { ...(node.data?.params || {}) } as Record<string, any>

    // Remove duplicate sticker params - check by type, not by name
    // Find the first param with type 'stickers' and keep only that one
    if (moduleMeta) {
      const stickerParams = moduleMeta.params.filter(p => p.type === 'stickers')
      if (stickerParams.length > 0) {
        // Keep only the first sticker param (by its name)
        const primaryStickerParamName = stickerParams[0].name
        // Remove all other params that have type 'stickers'
        stickerParams.forEach(stickerParam => {
          if (stickerParam.name !== primaryStickerParamName && params[stickerParam.name] !== undefined) {
            delete params[stickerParam.name]
          }
        })
      }
    }

    // For branching nodes with listParam, extract the listParam array from output nodes
    // This overwrites any listParam in the node's params with the one derived from output nodes
    if (isBranchingNodeType(nodeType) && moduleMeta?.outputConfig?.type === 'listParam') {
      const listParamName = moduleMeta.outputConfig.listParamName
      // Find all output nodes for this branching node
      // Output nodes are identified by:
      // 1. Having parentNodeId matching this branching node
      // 2. Having nodeType that is a branching output type, OR
      // 3. Having params.value (fallback for listParam output nodes missing nodeType/outputIndex)
      //    This handles nodes created before nodeType was consistently set
      const outputNodes = reactFlowData.nodes.filter(
        (n) => {
          const nodeType = n.data?.nodeType as NodeType | undefined
          const parentMatches = n.data?.parentNodeId === nodeId
          const isOutputType = nodeType ? isBranchingOutputNodeType(nodeType) : false
          // Fallback: if nodeType is missing but parent matches and has params.value, treat as output
          // This is the pattern for listParam output nodes (they have params.value)
          const hasValueParam = n.data?.params?.value !== undefined
          const isOutputByFallback = parentMatches && hasValueParam && !nodeType
          const matches = parentMatches && (isOutputType || isOutputByFallback)
          return matches
        }
      )
      // Sort by outputIndex to maintain order, or by position if outputIndex is missing
      outputNodes.sort((a, b) => {
        const aIndex = a.data?.outputIndex
        const bIndex = b.data?.outputIndex
        if (aIndex !== undefined && bIndex !== undefined) {
          return aIndex - bIndex
        }
        // Fallback: sort by Y position if outputIndex is missing
        const aY = a.position?.y ?? 0
        const bY = b.position?.y ?? 0
        return aY - bY
      })
      // Extract values from output nodes and build array
      // Always include all output nodes, even if they have empty values
      let listParamArray: any[] = []
      if (outputNodes.length > 0) {
        listParamArray = outputNodes.map((outputNode) => {
          // Get value from output node's params.value
          const value = outputNode.data?.params?.value ?? ''
          return value
        })
      } else {
        // If no output nodes found but this is a listParam branching node,
        // create at least one empty entry (default output)
        listParamArray = ['']
      }
      // Overwrite listParam in params with the array derived from output nodes
      // This ensures the listParam always reflects the current output nodes
      params[listParamName] = listParamArray
    }

    // Build source field from module config
    const source: DialogModule['source'] = moduleMeta?.source
      ? {
        path: moduleMeta.source.path ?? '',
        unpack_params: moduleMeta.source.unpack_params ?? true,
      }
      : {
        path: '',
        unpack_params: true,
      }

    modulesRecord[nodeId] = {
      type: moduleTypeString,
      params,
      handlers: {},
      source,
    }
  }

  // 3) Derive handlers from edges
  // For branching nodes: extract handlers from edges connected to output nodes (daughter nodes)
  // For normal nodes: extract handlers from module config
  for (const edge of reactFlowData.edges) {
    const sourceNode = nodesById.get(edge.source)
    const targetNode = nodesById.get(edge.target)
    if (!sourceNode || !targetNode) continue

    // Generic check: any node with parentNodeId is a daughter/output node
    // Map edges from daughter nodes to parent module with on_<index> handlers
    const parentId = sourceNode.data?.parentNodeId as string | undefined

    if (parentId && modulesRecord[parentId]) {
      // This is a daughter/output node - map to parent module

      // Try to get outputIndex from node data
      let outputIndex = sourceNode.data?.outputIndex

      // If outputIndex is missing, calculate it from position relative to other output nodes
      if (typeof outputIndex !== 'number') {
        const parentNode = nodesById.get(parentId)
        if (parentNode) {
          // Find all output/daughter nodes for this parent (any node with this parentId)
          const allOutputNodes = reactFlowData.nodes.filter((n) =>
            n.data?.parentNodeId === parentId
          )

          // Sort by Y position (output nodes are typically stacked vertically)
          allOutputNodes.sort((a, b) => {
            const aY = a.position?.y ?? 0
            const bY = b.position?.y ?? 0
            return aY - bY
          })

          // Find index of current node
          const index = allOutputNodes.findIndex((n) => n.id === sourceNode.id)
          outputIndex = index >= 0 ? index : 0
        } else {
          outputIndex = 0
        }
      }

      const handlerKey = `on_${outputIndex}`
      const parentModule = modulesRecord[parentId]
      if (!parentModule.handlers) parentModule.handlers = {}
      parentModule.handlers[handlerKey] = edge.target
      continue
    }

    // Normal node: use handler from module config
    if (!modulesRecord[edge.source]) continue
    const module = modulesRecord[edge.source]
    const sourceNodeType = (sourceNode.data?.nodeType || sourceNode.type) as NodeType
    const sourceModuleMeta = sourceNode.data?.moduleName
      ? modules.find((m) => m.name === sourceNode.data.moduleName)
      : undefined

    // Get handler names from module config
    const handlerNames = getHandlerNamesForModule(sourceModuleMeta, sourceNodeType)

    // Use the first handler name (most modules have a single handler)
    // If multiple handlers exist, we'd need to determine which one to use based on edge context
    // For now, assume single handler per simple node
    if (handlerNames.length > 0) {
      if (!module.handlers) module.handlers = {}
      const handlerName = handlerNames[0]
      module.handlers[handlerName] = edge.target
    }
  }

  // 3.5) Ensure all nodes have handlers (even if unconnected)
  // For branching nodes: ensure all outputs have handlers
  // For simple nodes: ensure configured handlers exist
  for (const nodeId of moduleIds) {
    const node = nodesById.get(nodeId)!
    const nodeType = (node.data?.nodeType || node.type) as NodeType
    const moduleMeta = node.data?.moduleName
      ? modules.find((m) => m.name === node.data.moduleName)
      : undefined

    const module = modulesRecord[nodeId]
    if (!module.handlers) module.handlers = {}

    if (isBranchingNodeType(nodeType)) {
      // For branching nodes: ensure all output nodes have handlers
      const allOutputNodes = reactFlowData.nodes.filter((n) =>
        n.data?.parentNodeId === nodeId
      )

      // Sort by outputIndex or position
      allOutputNodes.sort((a, b) => {
        const aIndex = a.data?.outputIndex
        const bIndex = b.data?.outputIndex
        if (aIndex !== undefined && bIndex !== undefined) {
          return aIndex - bIndex
        }
        const aY = a.position?.y ?? 0
        const bY = b.position?.y ?? 0
        return aY - bY
      })

      // Ensure handlers exist for all output indices
      for (let i = 0; i < allOutputNodes.length; i++) {
        const handlerKey = `on_${i}`
        if (!(handlerKey in module.handlers)) {
          module.handlers[handlerKey] = ''
        }
      }

      // Also check configured handlers for branching nodes (e.g., Branching2 has ["on_0", "on_1"])
      const configuredHandlers = getHandlerNamesForModule(moduleMeta, nodeType)
      for (const handlerName of configuredHandlers) {
        if (!(handlerName in module.handlers)) {
          module.handlers[handlerName] = ''
        }
      }
    } else {
      // For simple nodes: ensure all configured handlers exist
      const handlerNames = getHandlerNamesForModule(moduleMeta, nodeType)
      for (const handlerName of handlerNames) {
        if (!(handlerName in module.handlers)) {
          module.handlers[handlerName] = ''
        }
      }
    }
  }

  // 4) Determine root module from start node's handler, or fallback logic
  const incomingTargets = new Set<string>()
  for (const edge of reactFlowData.edges) {
    incomingTargets.add(edge.target)
  }

  let rootModule = ''

  // If start node exists, use its outgoing edge target as root_module
  // Find start node and its outgoing edge to determine root_module
  if (startNodeId) {
    const startEdge = reactFlowData.edges.find((e) => e.source === startNodeId)
    if (startEdge) {
      // The target might be an output node, so we need to resolve to the actual module
      const targetNode = reactFlowData.nodes.find((n) => n.id === startEdge.target)
      if (targetNode) {
        const targetType = (targetNode.data?.nodeType || targetNode.type) as NodeType
        if (isBranchingOutputNodeType(targetType)) {
          // If target is an output node, use its parent
          const parentId = targetNode.data?.parentNodeId as string | undefined
          if (parentId && moduleIds.includes(parentId)) {
            rootModule = parentId
          } else if (startEdge.target && moduleIds.includes(startEdge.target)) {
            rootModule = startEdge.target
          }
        } else if (startEdge.target && moduleIds.includes(startEdge.target)) {
          rootModule = startEdge.target
        }
      }
    }
  }

  // Fallback: prefer explicit hint, otherwise first node without incoming edges
  if (!rootModule) {
    rootModule = rootModuleIdHint && moduleIds.includes(rootModuleIdHint)
      ? rootModuleIdHint
      : moduleIds.find((id) => !incomingTargets.has(id)) || moduleIds[0] || ''
  }

  if (!rootModule && moduleIds.length === 0) {
    // No modules – return an empty dialog skeleton
    return {
      modules: {},
      root_module: '',
      stickers: {},
      initial_user_response_timeout: 1800,
    }
  }

  // Collect stickers from sticker nodes
  const stickers: Record<string, any> = {}
  for (const nodeId of moduleIds) {
    const node = nodesById.get(nodeId)!

    // Check if this is a sticker node
    if (isStickerNode(node)) {
      // Find the parameter with type "stickers" (not just a parameter named "stickers")
      const moduleName = node.data?.moduleName
      const moduleMeta = moduleName ? modules.find(m => m.name === moduleName) : undefined
      const stickersParam = moduleMeta?.params?.find(p => p.type === 'stickers')
      const stickersParamName = stickersParam?.name
      const stickerIds = stickersParamName ? (node.data?.params?.[stickersParamName] as string[] | undefined) : undefined
      if (stickerIds && Array.isArray(stickerIds)) {
        stickerIds.forEach((stickerId) => {
          // Get sticker data from metadata or create placeholder
          const stickerData = metadata.stickers?.[stickerId] || {
            name: stickerId,
            description: '',
            appearance: { color: 'rgba(30, 41, 59, 0.95)' },
          }
          stickers[stickerId] = stickerData
        })
      }
    }
  }

  return {
    modules: modulesRecord,
    root_module: rootModule,
    stickers,
    initial_user_response_timeout: 1800,
  }
}

/**
 * Translate ReactFlow JSON to Custom JSON format matching the bot dialog shape.
 *
 * The resulting structure looks roughly like:
 *
 * {
 *   account_id: "",
 *   current_bot_version_id: "",
 *   created_at: "",
 *   id: "",
 *   labels: [],
 *   current_bot_version: {
 *     description,
 *     language,
 *     mchannels_bot_id,
 *     name,
 *     permanent: true,
 *     task_values: {},
 *     channel: "voice",
 *     bot_id: "",
 *     created_at: "",
 *     id: "",
 *     updated_at: "",
 *     dialog: { modules, root_module, stickers, initial_user_response_timeout },
 *     omnichannel_config
 *   }
 * }
 */
export function translateReactFlowToCustom(
  reactFlowData: ReactFlowJson,
  metadata: CustomFlowMetadata
): CustomFlowJson {
  const dialog = buildDialogFromReactFlow(reactFlowData, metadata)

  // Derive dialog-level initial timeout from omnichannel_config if available
  const omniVoice = metadata.omnichannel_config?.voice ?? {}
  const dialogInitialTimeout =
    typeof omniVoice.initial_user_response_timeout === 'number'
      ? omniVoice.initial_user_response_timeout
      : dialog.initial_user_response_timeout

  const enrichedDialog: DialogConfig = {
    ...dialog,
    initial_user_response_timeout: dialogInitialTimeout,
    // Propagate collected stickers into the dialog so they are available in exported JSON
    stickers: dialog.stickers,
  }

  const currentBotVersion: CurrentBotVersion = {
    description: metadata.description,
    permanent: true,
    task_values: {},
    language: metadata.language,
    channel: 'voice',
    bot_id: '',
    mchannels_bot_id: metadata.mchannels_bot_id,
    created_at: '',
    id: '',
    updated_at: '',
    name: metadata.name,
    dialog: enrichedDialog,
    omnichannel_config: metadata.omnichannel_config || {},
  }

  return {
    account_id: '',
    current_bot_version_id: '',
    created_at: '',
    id: '',
    labels: [],
    current_bot_version: currentBotVersion,
  }
}

/**
 * Translate Custom JSON format back to ReactFlow JSON
 * Optionally preserves existing nodes/edges to maintain layout and ReactFlow-specific data
 */
export function translateCustomToReactFlow(
  customData: CustomFlowJson,
  existingNodes?: Node[],
  existingEdges?: Edge[]
): {
  reactFlowData: ReactFlowJson
  metadata: CustomFlowMetadata
} {
  const dialog = customData.current_bot_version?.dialog

  const reactFlowNodes: Node[] = []
  const reactFlowEdges: Edge[] = []

  // Create maps of existing nodes/edges by ID for quick lookup
  const existingNodesMap = new Map<string, Node>()
  const existingEdgesMap = new Map<string, Edge>()
  if (existingNodes) {
    existingNodes.forEach((n) => existingNodesMap.set(n.id, n))
  }
  if (existingEdges) {
    existingEdges.forEach((e) => existingEdgesMap.set(e.id, e))
  }

  if (dialog && dialog.modules) {
    const entries = Object.entries(dialog.modules)

    // First pass: create module nodes (including branching parents and any auto-generated outputs)
    const branchingParentIds = new Set<string>()
    const outputNodesByParent = new Map<string, Node[]>()

    for (const [moduleId, moduleDef] of entries) {
      let moduleTypeStr = moduleDef.type as string

      // Find module definition by name (now the only identifier)
      const moduleMeta = modules.find((m) => m.name === moduleTypeStr)

      const nodeType: NodeType =
        (moduleMeta?.type as NodeType) ?? ('single' as NodeType)

      let params = (moduleDef.params || {}) as Record<string, any>

      if (isBranchingNodeType(nodeType) && moduleMeta?.outputConfig) {
        // Branching node – create parent + output nodes using helper
        let outputCount = 1
        let listParamArray: any[] | null = null

        // Determine output count from handlers (on_0, on_1, etc.)
        const handlers = moduleDef.handlers || {}
        let maxHandlerIndex = -1
        Object.keys(handlers).forEach((key) => {
          const onMatch = key.match(/^on_(\d+)$/)
          if (onMatch) {
            const index = parseInt(onMatch[1], 10)
            if (index > maxHandlerIndex) {
              maxHandlerIndex = index
            }
          }
        })
        const handlerBasedCount = maxHandlerIndex >= 0 ? maxHandlerIndex + 1 : 0

        if (moduleMeta.outputConfig.type === 'internal') {
          // For internal, use the configured outputCount, but ensure it's at least handlerBasedCount
          outputCount = Math.max(moduleMeta.outputConfig.outputCount, handlerBasedCount)
        } else if (moduleMeta.outputConfig.type === 'listParam') {
          const listParamName = moduleMeta.outputConfig.listParamName
          listParamArray = Array.isArray(params[listParamName])
            ? params[listParamName]
            : []
          // Use the maximum of listParam array length and handler-based count
          outputCount = Math.max(listParamArray.length || 1, handlerBasedCount || 1)

          // Ensure listParamArray has enough entries for all outputs
          while (listParamArray.length < outputCount) {
            listParamArray.push('')
          }

          // Remove listParam from params since it will be represented by output nodes
          // We'll restore it when translating back, but for ReactFlow it's in output nodes
          const { [listParamName]: _, ...paramsWithoutListParam } = params
          params = paramsWithoutListParam
        } else {
          // Fallback: use handler-based count if available
          outputCount = handlerBasedCount || 1
        }

        const created = createBranchingNodeWithOutputs(
          { x: 0, y: 0 },
          outputCount,
          moduleMeta.name,
          nodeType
        )

        // First node is the branching parent
        // Preserve existing node if it exists (position, z-index, etc.)
        const existingParent = existingNodesMap.get(moduleId)
        const parentNode = existingParent
          ? { ...existingParent }
          : { ...created[0] }
        parentNode.id = moduleId
        parentNode.data = {
          ...parentNode.data,
          moduleName: moduleMeta.name,
          nodeType,
          params,
        }
        // Preserve position from existing node if available
        if (existingParent) {
          parentNode.position = existingParent.position
          if (existingParent.width) parentNode.width = existingParent.width
          if (existingParent.zIndex !== undefined) parentNode.zIndex = existingParent.zIndex
        }
        // Calculate correct height based on output count (will be updated after outputs are created)
        const layoutConstants = getBranchingLayoutConstants()
        const calculatedHeight = calculateBranchingNodeHeight(outputCount, layoutConstants)
        const branchingNodeWidth = layoutConstants.outputNodeWidth + layoutConstants.padding * 2
        parentNode.style = {
          ...parentNode.style,
          width: branchingNodeWidth,
          height: calculatedHeight,
        }
        parentNode.width = branchingNodeWidth
        parentNode.height = calculatedHeight

        reactFlowNodes.push(parentNode)
        branchingParentIds.add(moduleId)

        const outputs: Node[] = []
        for (let i = 1; i < created.length; i++) {
          const createdOutput = created[i]
          const outputIndex = i - 1 // outputIndex is 0-based

          // Try to find existing output node by matching parentNodeId and outputIndex
          const existingOutput = existingNodes?.find(
            (n) =>
              n.data?.parentNodeId === moduleId &&
              n.data?.outputIndex === outputIndex
          )
          const out = existingOutput
            ? { ...existingOutput }
            : { ...createdOutput }

          // CRITICAL: Always set unique ID for output node to avoid conflicts with module IDs
          // Use format: ${moduleId}_output_${outputIndex} to ensure uniqueness
          // Even if existingOutput exists, we need to ensure the ID is unique and doesn't conflict
          const uniqueOutputId = `${moduleId}_output_${outputIndex}`
          out.id = uniqueOutputId

          // For listParam type, set the value from the array
          if (moduleMeta.outputConfig.type === 'listParam' && listParamArray) {
            const value = listParamArray[outputIndex] ?? ''
            // Get the output node type from the created node, existing node, or nodeConfig
            const nodeConfig = nodeConfigs[moduleMeta.type]
            const outputNodeType = createdOutput.data?.nodeType || existingOutput?.data?.nodeType || nodeConfig?.outputNodeType
            out.data = {
              ...out.data,
              nodeType: outputNodeType, // CRITICAL: Preserve nodeType so isBranchingOutputNodeType works
              parentNodeId: moduleId,
              outputIndex: outputIndex,
              params: {
                ...out.data?.params,
                value: value,
              },
            }
            // Set label from value for output nodes
            if (value !== null && value !== undefined && value !== '') {
              out.data.label = String(value)
            } else {
              out.data.label = '_'
            }
          } else {
            // Get the output node type from the created node, existing node, or nodeConfig
            const nodeConfig = nodeConfigs[moduleMeta.type]
            const outputNodeType = createdOutput.data?.nodeType || existingOutput?.data?.nodeType || nodeConfig?.outputNodeType
            out.data = {
              ...out.data,
              nodeType: outputNodeType, // CRITICAL: Preserve nodeType so isBranchingOutputNodeType works
              parentNodeId: moduleId,
              outputIndex: outputIndex,
            }
          }

          // Preserve position from existing node if available, otherwise calculate correct position
          if (existingOutput) {
            out.position = existingOutput.position
            if (existingOutput.width) out.width = existingOutput.width
            if (existingOutput.height) out.height = existingOutput.height
            if (existingOutput.zIndex !== undefined) out.zIndex = existingOutput.zIndex
          } else {
            // Calculate correct position relative to parent branching node
            const parentPos = parentNode.position || { x: 0, y: 0 }
            const layoutConstants = getBranchingLayoutConstants()
            out.position = calculateOutputNodePosition(parentPos, outputIndex, layoutConstants)
            // Set width and height from layout constants
            out.width = layoutConstants.outputNodeWidth
            out.height = layoutConstants.outputNodeHeight
          }
          outputs.push(out)
          reactFlowNodes.push(out)
        }
        outputNodesByParent.set(moduleId, outputs)
      } else {
        // Simple node - preserve existing node if it exists
        const existingNode = existingNodesMap.get(moduleId)
        const node = existingNode
          ? { ...existingNode }
          : createNodeFromConfig(nodeType, { x: 0, y: 0 }, {
            moduleName: moduleMeta?.name || moduleTypeStr,
            params,
          })
        node.id = moduleId
        node.data = {
          ...node.data,
          moduleName: moduleMeta?.name || moduleTypeStr,
          params,
        }
        // Preserve position and other properties from existing node if available
        if (existingNode) {
          node.position = existingNode.position
          if (existingNode.width) node.width = existingNode.width
          if (existingNode.height) node.height = existingNode.height
          if (existingNode.zIndex !== undefined) node.zIndex = existingNode.zIndex
        }
        reactFlowNodes.push(node)
      }
    }

    // Track added edge IDs to prevent duplicates
    const addedEdgeIds = new Set<string>()

    // Second pass: build ReactFlow edges from handlers
    for (const [moduleId, moduleDef] of entries) {
      const handlers = moduleDef.handlers || {}
      const parentOutputs = outputNodesByParent.get(moduleId) || []

      Object.entries(handlers).forEach(([key, targetId]) => {
        let sourceId = moduleId

        // on_<index> handlers: connect from the corresponding output node
        const onMatch = key.match(/^on_(\d+)$/)
        if (onMatch && parentOutputs.length > 0) {
          const index = parseInt(onMatch[1], 10)
          const outputNode = parentOutputs[index]

          if (outputNode) {
            sourceId = outputNode.id
          }
        }

        // Skip if targetId is empty or invalid
        if (!targetId || typeof targetId !== 'string' || targetId.trim() === '') {
          return
        }

        const edgeId = `e_${sourceId}_${targetId}_${key}`
        // Skip if we've already added this edge
        if (addedEdgeIds.has(edgeId)) {
          return
        }
        addedEdgeIds.add(edgeId)

        // Determine source and target handles
        // Fallback handle selection: only set when explicitly needed
        // For output nodes inside branching nodes, use right-source handle
        // For regular nodes, use bottom-source handle as fallback
        const sourceNode = reactFlowNodes.find(n => n.id === sourceId)
        const isSourceOutputNode = sourceNode?.data?.parentNodeId !== undefined
        // When fallback is needed: output nodes (inside branching) → right, others → bottom
        const sourceHandle = isSourceOutputNode ? 'right-source' : 'bottom-source'
        const targetHandle = undefined // Let ReactFlow choose target handle automatically

        // Preserve existing edge if it exists (handles, style, markerEnd, etc.)
        const existingEdge = existingEdgesMap.get(edgeId) ||
          existingEdges?.find((e) => e.source === sourceId && e.target === targetId)
        const edge = existingEdge
          ? {
            ...existingEdge,
            id: edgeId,
            source: sourceId,
            target: targetId,
            sourceHandle: existingEdge.sourceHandle ?? sourceHandle,
            targetHandle: existingEdge.targetHandle ?? targetHandle,
            // Preserve all edge properties
            markerEnd: existingEdge.markerEnd,
            markerStart: existingEdge.markerStart,
            style: existingEdge.style,
            animated: existingEdge.animated,
            hidden: existingEdge.hidden,
            selected: existingEdge.selected,
            zIndex: existingEdge.zIndex,
          }
          : ({
            id: edgeId,
            source: sourceId,
            target: targetId,
            sourceHandle,
            targetHandle,
            type: 'default',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: 'rgba(148, 163, 184, 0.8)',
            },
            style: {
              strokeWidth: 2,
              stroke: 'rgba(148, 163, 184, 0.8)',
            },
          } as Edge)
        reactFlowEdges.push(edge)
      })
    }

    // Create or update start node if root_module exists - start node's handler points to root_module
    const rootModuleId = dialog.root_module || undefined
    if (rootModuleId && reactFlowNodes.length > 0) {
      const startModule = getStartModule()
      if (startModule) {
        // Find existing start node
        const existingStartNode = existingNodes?.find((n) => isStartModule(n.data?.moduleName))

        let startNode: Node
        if (existingStartNode) {
          // Preserve existing start node position and properties
          startNode = { ...existingStartNode }
          startNode.data = {
            ...startNode.data,
            moduleName: startModule.name,
            connectingFrom: null,
          }
        } else {
          // Create new start node - position it to the left of root module
          const rootNode = reactFlowNodes.find((n) => n.id === rootModuleId)
          const startPosition = rootNode
            ? { x: rootNode.position.x - 250, y: rootNode.position.y }
            : { x: 0, y: 0 }
          startNode = createNodeFromConfig(startModule.type as NodeType, startPosition, {
            moduleName: startModule.name,
            connectingFrom: null,
          })
        }

        // Check if edge from start to root already exists
        const startEdgeId = `start_${rootModuleId}`
        if (!addedEdgeIds.has(startEdgeId)) {
          addedEdgeIds.add(startEdgeId)
          const existingStartEdge = existingEdgesMap.get(startEdgeId) ||
            existingEdges?.find(
              (e) => e.source === startNode.id && e.target === rootModuleId
            )
          if (existingStartEdge) {
            // Preserve existing edge with all properties
            reactFlowEdges.push({
              ...existingStartEdge,
              id: startEdgeId,
              source: startNode.id,
              target: rootModuleId,
              // Preserve all edge properties
              markerEnd: existingStartEdge.markerEnd,
              markerStart: existingStartEdge.markerStart,
              style: existingStartEdge.style,
              animated: existingStartEdge.animated,
              hidden: existingStartEdge.hidden,
              selected: existingStartEdge.selected,
              zIndex: existingStartEdge.zIndex,
            })
          } else {
            // Create new edge with arrow head
            reactFlowEdges.push({
              id: startEdgeId,
              source: startNode.id,
              target: rootModuleId,
              type: 'default',
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
                color: 'rgba(148, 163, 184, 0.8)',
              },
              style: {
                strokeWidth: 2,
                stroke: 'rgba(148, 163, 184, 0.8)',
              },
            } as Edge)
          }
        }

        // Add start node if it's not already in the list
        if (!reactFlowNodes.find((n) => n.id === startNode.id)) {
          reactFlowNodes.push(startNode)
        }
      }
    }

    // Only apply automatic layout if we don't have existing nodes to preserve
    // This prevents breaking the layout when translating back
    const layoutResult = existingNodes && existingNodes.length > 0
      ? { nodes: reactFlowNodes, edges: reactFlowEdges } // Use nodes as-is, preserving positions
      : autoLayout(reactFlowNodes, reactFlowEdges, rootModuleId, undefined) // Apply layout only for new graphs

    const laidOutNodes = layoutResult.nodes
    const laidOutEdges = layoutResult.edges

    return {
      reactFlowData: {
        nodes: laidOutNodes.map((n) => ({
          ...n,
          type: REACTFLOW_NODE_TYPE,
        })),
        edges: laidOutEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          ...(e.sourceHandle ? { sourceHandle: e.sourceHandle || undefined } : {}),
          ...(e.targetHandle ? { targetHandle: e.targetHandle || undefined } : {}),
        })),
      },
      metadata: {
        description: customData.current_bot_version?.description || '',
        language: customData.current_bot_version?.language || '',
        mchannels_bot_id: customData.current_bot_version?.mchannels_bot_id || '',
        name: customData.current_bot_version?.name || '',
        omnichannel_config: customData.current_bot_version?.omnichannel_config || {},
        stickers: dialog.stickers || {},
      },
    }
  }

  // Fallback for unexpected shapes – keep old behavior with empty graph + minimal metadata
  return {
    reactFlowData: {
      nodes: [],
      edges: [],
    },
    metadata: {
      description: '',
      language: '',
      mchannels_bot_id: '',
      name: '',
      omnichannel_config: {},
      stickers: {},
    },
  }
}

/**
 * Validate that custom JSON can be translated back to ReactFlow
 */
export function validateCustomJson(customData: CustomFlowJson): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  const cbv = customData.current_bot_version
  const dialog = cbv?.dialog

  if (!cbv || typeof cbv !== 'object') {
    errors.push('current_bot_version must be an object')
  } else {
    if (typeof cbv.description !== 'string') {
      errors.push('current_bot_version.description must be a string')
    }
    if (typeof cbv.language !== 'string') {
      errors.push('current_bot_version.language must be a string')
    }
    if (typeof cbv.mchannels_bot_id !== 'string') {
      errors.push('current_bot_version.mchannels_bot_id must be a string')
    }
    if (typeof cbv.name !== 'string') {
      errors.push('current_bot_version.name must be a string')
    }
  }

  if (!dialog || typeof dialog !== 'object') {
    errors.push('current_bot_version.dialog must be an object')
  } else {
    if (!dialog.modules || typeof dialog.modules !== 'object') {
      errors.push('dialog.modules must be an object mapping ids to modules')
    } else {
      const moduleEntries = Object.entries(dialog.modules)

      for (const [id, moduleDef] of moduleEntries) {
        if (!id) {
          errors.push('dialog.modules contains a module with empty id')
        }
        if (typeof moduleDef !== 'object' || moduleDef === null) {
          errors.push(`Module "${id}" must be an object`)
          continue
        }
        if (typeof moduleDef.type !== 'string' || !moduleDef.type) {
          errors.push(`Module "${id}" is missing a string "type" field`)
        }
        if (!moduleDef.params || typeof moduleDef.params !== 'object') {
          errors.push(`Module "${id}" must have a "params" object`)
        }
        if (moduleDef.handlers && typeof moduleDef.handlers !== 'object') {
          errors.push(`Module "${id}" has invalid "handlers" (must be an object)`)
        }
      }

      // Type check: handlers should be objects with string values (but don't validate references)
      for (const [id, moduleDef] of moduleEntries) {
        const handlers = (moduleDef as DialogModule).handlers || {}
        Object.entries(handlers).forEach(([key, target]) => {
          if (typeof target !== 'string' || !target) {
            errors.push(`Handler "${key}" on module "${id}" must point to a non-empty string id`)
          }
          // Don't validate that handlers reference existing modules - just type check
        })
      }
    }

    // Type check: root_module should be a string (but don't validate it exists)
    if (typeof dialog.root_module !== 'string' || !dialog.root_module) {
      errors.push('dialog.root_module must be a non-empty string')
    }

    if (
      dialog.initial_user_response_timeout !== undefined &&
      typeof dialog.initial_user_response_timeout !== 'number'
    ) {
      errors.push('dialog.initial_user_response_timeout must be a number if provided')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
