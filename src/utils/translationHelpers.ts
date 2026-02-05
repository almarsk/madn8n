import { type Node, type Edge } from 'reactflow'
import { type NodeType, isBranchingOutputNodeType, isBranchingNodeType } from '../nodeConfigs'
import modules from '../modules'
import { REACTFLOW_NODE_TYPE, createBranchingNodeWithOutputs, createNodeFromConfig } from './nodeCreation'
import { autoLayout } from './layoutHelpers'

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
  rootModuleIdHint?: string
): DialogConfig {
  const nodesById = new Map<string, ReactFlowJson['nodes'][number]>()
  reactFlowData.nodes.forEach((n) => nodesById.set(n.id, n))

  // 1) Decide which ReactFlow nodes are "modules" (exclude branching outputs)
  const moduleIds: string[] = []
  for (const node of reactFlowData.nodes) {
    const nodeType = (node.data?.nodeType || node.type) as NodeType
    if (isBranchingOutputNodeType(nodeType)) {
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
    const moduleTypeString = moduleMeta?.name || (nodeType as string) || 'single'

    const params = (node.data?.params || {}) as Record<string, any>

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

  // 4) Determine root module – prefer explicit hint, otherwise first node without incoming edges
  const incomingTargets = new Set<string>()
  for (const edge of reactFlowData.edges) {
    incomingTargets.add(edge.target)
  }

  let rootModule = rootModuleIdHint && moduleIds.includes(rootModuleIdHint)
    ? rootModuleIdHint
    : moduleIds.find((id) => !incomingTargets.has(id)) || moduleIds[0] || ''

  if (!rootModule) {
    // No nodes – return an empty dialog skeleton
    return {
      modules: {},
      root_module: '',
      stickers: {},
      initial_user_response_timeout: 1800,
    }
  }

  return {
    modules: modulesRecord,
    root_module: rootModule,
    stickers: {}, // stickers handled separately in metadata, keep dialog stickers empty for now
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
  const dialog = buildDialogFromReactFlow(reactFlowData)

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
 */
export function translateCustomToReactFlow(customData: CustomFlowJson): {
  reactFlowData: ReactFlowJson
  metadata: CustomFlowMetadata
} {
  const dialog = customData.current_bot_version?.dialog

  const reactFlowNodes: Node[] = []
  const reactFlowEdges: Edge[] = []

  if (dialog && dialog.modules) {
    const entries = Object.entries(dialog.modules)

    // First pass: create module nodes (including branching parents and any auto-generated outputs)
    const branchingParentIds = new Set<string>()
    const outputNodesByParent = new Map<string, Node[]>()

    for (const [moduleId, moduleDef] of entries) {
      const moduleTypeStr = moduleDef.type as string

      // Find module definition by name (type field contains module name)
      const moduleMeta = modules.find((m) => m.name === moduleTypeStr)

      const nodeType: NodeType =
        (moduleMeta?.type as NodeType) ?? ('single' as NodeType)

      const params = (moduleDef.params || {}) as Record<string, any>

      if (isBranchingNodeType(nodeType) && moduleMeta?.outputConfig) {
        // Branching node – create parent + output nodes using helper
        let outputCount = 1
        if (moduleMeta.outputConfig.type === 'internal') {
          outputCount = moduleMeta.outputConfig.outputCount
        } else if (moduleMeta.outputConfig.type === 'listParam') {
          const listParamName = moduleMeta.outputConfig.listParamName
          const currentArray = Array.isArray(params[listParamName])
            ? params[listParamName]
            : []
          outputCount = currentArray.length || 1
        }

        const created = createBranchingNodeWithOutputs(
          { x: 0, y: 0 },
          outputCount,
          moduleMeta.name,
          nodeType
        )

        // First node is the branching parent
        const parentNode = { ...created[0] }
        parentNode.id = moduleId
        parentNode.data = {
          ...parentNode.data,
          moduleName: moduleMeta.name,
          nodeType,
          params,
        }

        reactFlowNodes.push(parentNode)
        branchingParentIds.add(moduleId)

        const outputs: Node[] = []
        for (let i = 1; i < created.length; i++) {
          const out = { ...created[i] }
          out.data = {
            ...out.data,
            parentNodeId: moduleId,
          }
          outputs.push(out)
          reactFlowNodes.push(out)
        }
        outputNodesByParent.set(moduleId, outputs)
      } else {
        // Simple node
        const node = createNodeFromConfig(nodeType, { x: 0, y: 0 }, {
          moduleName: moduleMeta?.name || moduleTypeStr,
          params,
        })
        node.id = moduleId
        reactFlowNodes.push(node)
      }
    }

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
        reactFlowEdges.push({
          id: edgeId,
          source: sourceId,
          target: targetId,
          type: 'default',
        } as Edge)
      })
    }

    // Apply automatic layout – use dialog.root_module as a hint
    const rootModuleId = dialog.root_module || undefined
    const laidOutNodes = autoLayout(reactFlowNodes, reactFlowEdges, rootModuleId)

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
