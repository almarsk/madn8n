import { type Node, type Edge, MarkerType } from 'reactflow'
import { type NodeType, isBranchingOutputNodeType, isBranchingNodeType } from '../nodeConfigs'
import modules from '../modules'
import { REACTFLOW_NODE_TYPE, createBranchingNodeWithOutputs, createNodeFromConfig } from './nodeCreation'
import { autoLayout } from './layoutHelpers'
import { calculateOutputNodePosition, getBranchingLayoutConstants, calculateBranchingNodeHeight, updateBranchingNodeHeight } from './branchingNodeHelpers'

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
 * Helper: build dialog.modules + handlers map from ReactFlow nodes/edges.
 *
 * - Each "module" corresponds to a node that is NOT a branching output node.
 * - Simple nodes get a single "node_exit" handler if they have an outgoing edge.
 * - Branching nodes collect handlers from their output nodes as "on_0", "on_1", ...
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
    if (moduleName === 'Start' || nodeType === 'outputOnly') {
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

    // Use module name as type (e.g., "Type 1", "Branching") not node type
    // Special case: "End" module exports as "Exit"
    let moduleTypeString = moduleMeta?.name || (nodeType as string) || 'single'
    if (moduleTypeString === 'End') {
      moduleTypeString = 'Exit'
    }

    let params = (node.data?.params || {}) as Record<string, any>

    // For branching nodes with listParam, extract the listParam array from output nodes
    if (isBranchingNodeType(nodeType) && moduleMeta?.outputConfig?.type === 'listParam') {
      const listParamName = moduleMeta.outputConfig.listParamName
      // Find all output nodes for this branching node
      const outputNodes = reactFlowData.nodes.filter(
        (n) => n.data?.parentNodeId === nodeId && isBranchingOutputNodeType(n.data?.nodeType as NodeType)
      )
      // Sort by outputIndex to maintain order
      outputNodes.sort((a, b) => {
        const aIndex = a.data?.outputIndex ?? 0
        const bIndex = b.data?.outputIndex ?? 0
        return aIndex - bIndex
      })
      // Extract values from output nodes and build array
      // Always include all output nodes, even if they have empty values
      let listParamArray: any[] = []
      if (outputNodes.length > 0) {
        listParamArray = outputNodes.map((outputNode) => {
          // Get value from output node's params.value
          return outputNode.data?.params?.value ?? ''
        })
      } else {
        // If no output nodes found but this is a listParam branching node,
        // create at least one empty entry (default output)
        listParamArray = ['']
      }
      // Add the listParam array to params
      params = {
        ...params,
        [listParamName]: listParamArray,
      }
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
  for (const edge of reactFlowData.edges) {
    const sourceNode = nodesById.get(edge.source)
    const targetNode = nodesById.get(edge.target)
    if (!sourceNode || !targetNode) continue

    const sourceType = (sourceNode.data?.nodeType || sourceNode.type) as NodeType

    // Branching output node: map to parent module with on_<index>
    if (isBranchingOutputNodeType(sourceType)) {
      const parentId = sourceNode.data?.parentNodeId as string | undefined
      if (!parentId || !modulesRecord[parentId]) {
        continue
      }
      const outputIndex =
        typeof sourceNode.data?.outputIndex === 'number'
          ? sourceNode.data.outputIndex
          : 0
      const handlerKey = `on_${outputIndex}`
      const parentModule = modulesRecord[parentId]
      if (!parentModule.handlers) parentModule.handlers = {}
      parentModule.handlers[handlerKey] = edge.target
      continue
    }

    // Normal node: single "node_exit" handler
    if (!modulesRecord[edge.source]) continue
    const module = modulesRecord[edge.source]
    if (!module.handlers) module.handlers = {}
    module.handlers.node_exit = edge.target
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
    const nodeType = (node.data?.nodeType || node.type) as NodeType
    const moduleMeta = node.data?.moduleName
      ? modules.find((m) => m.name === node.data.moduleName)
      : undefined

    // Check if this is a sticker node
    if (nodeType === 'sticker' && moduleMeta?.name === 'StickerModule') {
      const stickerIds = node.data?.params?.stickers as string[] | undefined
      if (stickerIds && Array.isArray(stickerIds)) {
        stickerIds.forEach((stickerId) => {
          // Get sticker data from metadata or create placeholder
          const stickerData = metadata.stickers?.[stickerId] || {
            name: stickerId,
            description: '',
            appearance: { color: '#fceaea' },
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
    // Stickers: keep empty for now as requested
    stickers: {},
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

      // Special case: "Exit" maps back to "End" module
      if (moduleTypeStr === 'Exit') {
        moduleTypeStr = 'End'
      }

      // Find module definition by name (type field contains module name)
      const moduleMeta = modules.find((m) => m.name === moduleTypeStr)

      const nodeType: NodeType =
        (moduleMeta?.type as NodeType) ?? ('single' as NodeType)

      let params = (moduleDef.params || {}) as Record<string, any>

      if (isBranchingNodeType(nodeType) && moduleMeta?.outputConfig) {
        // Branching node – create parent + output nodes using helper
        let outputCount = 1
        let listParamArray: any[] | null = null
        
        if (moduleMeta.outputConfig.type === 'internal') {
          outputCount = moduleMeta.outputConfig.outputCount
        } else if (moduleMeta.outputConfig.type === 'listParam') {
          const listParamName = moduleMeta.outputConfig.listParamName
          listParamArray = Array.isArray(params[listParamName])
            ? params[listParamName]
            : []
          outputCount = listParamArray.length || 1
          
          // Remove listParam from params since it will be represented by output nodes
          // We'll restore it when translating back, but for ReactFlow it's in output nodes
          const { [listParamName]: _, ...paramsWithoutListParam } = params
          params = paramsWithoutListParam
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
          
          // For listParam type, set the value from the array
          if (moduleMeta.outputConfig.type === 'listParam' && listParamArray) {
            const value = listParamArray[outputIndex] ?? ''
            out.data = {
              ...out.data,
              parentNodeId: moduleId,
              outputIndex: outputIndex,
              params: {
                ...out.data?.params,
                value: value,
              },
            }
          } else {
            out.data = {
              ...out.data,
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

        const edgeId = `e_${sourceId}_${targetId}_${key}`
        // Skip if we've already added this edge
        if (addedEdgeIds.has(edgeId)) {
          return
        }
        addedEdgeIds.add(edgeId)

        // Preserve existing edge if it exists (handles, style, markerEnd, etc.)
        const existingEdge = existingEdgesMap.get(edgeId) ||
          existingEdges?.find((e) => e.source === sourceId && e.target === targetId)
        const edge = existingEdge
          ? { 
              ...existingEdge, 
              id: edgeId, 
              source: sourceId, 
              target: targetId,
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
      const startModule = modules.find((m) => m.name === 'Start')
      if (startModule) {
        // Find existing start node
        const existingStartNode = existingNodes?.find((n) => n.data?.moduleName === 'Start')
        
        let startNode: Node
        if (existingStartNode) {
          // Preserve existing start node position and properties
          startNode = { ...existingStartNode }
          startNode.data = {
            ...startNode.data,
            moduleName: 'Start',
            connectingFrom: null,
          }
        } else {
          // Create new start node - position it to the left of root module
          const rootNode = reactFlowNodes.find((n) => n.id === rootModuleId)
          const startPosition = rootNode
            ? { x: rootNode.position.x - 250, y: rootNode.position.y }
            : { x: 0, y: 0 }
          startNode = createNodeFromConfig(startModule.type as NodeType, startPosition, {
            moduleName: 'Start',
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
    const laidOutNodes = existingNodes && existingNodes.length > 0
      ? reactFlowNodes // Use nodes as-is, preserving positions
      : autoLayout(reactFlowNodes, reactFlowEdges, rootModuleId) // Apply layout only for new graphs

    return {
      reactFlowData: {
        nodes: laidOutNodes.map((n) => ({
          ...n,
          type: REACTFLOW_NODE_TYPE,
        })),
        edges: reactFlowEdges.map((e) => ({
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
      if (moduleEntries.length === 0) {
        errors.push('dialog.modules must contain at least one module')
      }

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

      // Validate handlers point to existing modules
      const moduleIds = new Set(Object.keys(dialog.modules))
      for (const [id, moduleDef] of moduleEntries) {
        const handlers = (moduleDef as DialogModule).handlers || {}
        Object.entries(handlers).forEach(([key, target]) => {
          if (typeof target !== 'string' || !target) {
            errors.push(`Handler "${key}" on module "${id}" must point to a non-empty string id`)
          } else if (!moduleIds.has(target)) {
            errors.push(`Handler "${key}" on module "${id}" references unknown module "${target}"`)
          }
        })
      }
    }

    if (typeof dialog.root_module !== 'string' || !dialog.root_module) {
      errors.push('dialog.root_module must be a non-empty string')
    } else if (!dialog.modules || !dialog.modules[dialog.root_module]) {
      errors.push('dialog.root_module must reference an existing module id')
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
