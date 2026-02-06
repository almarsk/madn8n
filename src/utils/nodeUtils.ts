import { type Node } from 'reactflow'
import { type Module } from '../modules'
import nodeConfigs, { type NodeType, NODE_TYPES } from '../nodeConfigs'
import modules from '../modules'
import { isStickerModule } from './moduleHelpers'

// Helper to parse Pythonic type notation recursively (e.g., "list[str]", "dict", "list[list[str]]", "dict[str, dict[str, list[list[str]]]]")
// Returns the base type and the innermost type (for lists, this is the element type)
export const parseType = (typeStr: string | undefined): { base: string; inner?: string; fullType: string } => {
  if (!typeStr) return { base: 'str', fullType: 'str' }

  // Recursively parse nested types like list[list[str]] or dict[str, dict[str, list[list[str]]]]
  const parseRecursive = (str: string, depth: number = 0): { base: string; inner?: string; fullType: string } => {
    // Match list[type]
    const listMatch = str.match(/^list\[(.+)\]$/)
    if (listMatch) {
      const innerResult = parseRecursive(listMatch[1], depth + 1)
      return {
        base: 'list',
        inner: innerResult.inner || innerResult.base, // Get the innermost type
        fullType: str,
      }
    }

    // Match dict[key, value] or dict[key, value, ...] (Pythonic dict syntax)
    // Also handle dict[type] for backwards compatibility
    const dictMatch = str.match(/^dict(?:\[(.+)\])?$/)
    if (dictMatch) {
      if (dictMatch[1]) {
        // Parse the inner part - could be "str, dict[str, list[list[str]]]" or just "type"
        const innerPart = dictMatch[1]
        // Check if it's comma-separated (key, value) or just a single type
        if (innerPart.includes(',')) {
          // It's dict[key, value] - extract the value type (last part after last comma)
          const parts = innerPart.split(',').map(p => p.trim())
          const valueType = parts[parts.length - 1]
          const innerResult = parseRecursive(valueType, depth + 1)
          return {
            base: 'dict',
            inner: innerResult.inner || innerResult.base,
            fullType: str,
          }
        } else {
          // Single type: dict[type]
          const innerResult = parseRecursive(innerPart, depth + 1)
          return {
            base: 'dict',
            inner: innerResult.inner || innerResult.base,
            fullType: str,
          }
        }
      }
      return { base: 'dict', fullType: str }
    }

    // Keep Pythonic types as-is (str, bool, etc.)
    return { base: str, fullType: str }
  }

  return parseRecursive(typeStr)
}

// Helper to convert Pythonic types to display types for UI
export const displayType = (typeStr: string | undefined): string => {
  if (!typeStr) return 'string'

  // Convert Pythonic types to display types
  const typeMap: Record<string, string> = {
    'str': 'string',
    'bool': 'boolean',
    'int': 'number',
    'float': 'number',
  }

  // If it's a simple type, convert it
  if (typeMap[typeStr]) {
    return typeMap[typeStr]
  }

  // For complex types, recursively parse and convert
  const { base, inner, fullType } = parseType(typeStr)

  if (base === 'list' && inner) {
    // For lists, show list[displayType(inner)]
    return `list[${displayType(inner)}]`
  }

  if (base === 'dict') {
    // For dicts, we need to reconstruct the full type with converted inner types
    // Parse the original string to get the structure
    if (inner) {
      // If there's an inner type, convert it recursively
      // For dict[key, value], we show dict[keyType, valueType] with converted types
      const dictMatch = fullType.match(/^dict\[(.+)\]$/)
      if (dictMatch) {
        const innerPart = dictMatch[1]
        if (innerPart.includes(',')) {
          // dict[key, value] format - convert both key and value types
          const parts = innerPart.split(',').map(p => p.trim())
          const keyType = displayType(parts[0])
          const valueType = displayType(parts.slice(1).join(',').trim())
          return `dict[${keyType}, ${valueType}]`
        } else {
          // dict[type] format
          return `dict[${displayType(inner)}]`
        }
      }
      return `dict[${displayType(inner)}]`
    }
    return 'dict'
  }

  // For other types, just convert if it's in the map
  return typeMap[fullType] || fullType
}

// Helper function to get node label from module config and node data
export const getNodeLabel = (module: Module | undefined, nodeData: any, nodeType?: NodeType, stickers?: Record<string, any>): string => {
  if (!module) {
    return nodeData?.label || 'Unknown'
  }

  // For branching output nodes, use the value param directly
  if (nodeType === NODE_TYPES.BRANCHING_OUTPUT_INTERNAL || nodeType === NODE_TYPES.BRANCHING_OUTPUT_LIST_PARAM) {
    if (nodeData?.params?.value !== undefined && nodeData.params.value !== null && nodeData.params.value !== '') {
      return String(nodeData.params.value)
    }
    return nodeData?.label || 'Output'
  }

  // For sticker nodes: use sticker name from stickers data
  // Find the parameter with type "stickers" (not just a parameter named "stickers")
  if (isStickerModule(module.name)) {
    const stickersParam = module.params?.find(p => p.type === 'stickers')
    const stickersParamName = stickersParam?.name
    const stickerIds = stickersParamName ? (nodeData?.params?.[stickersParamName] as string[] | undefined) : undefined
    if (stickerIds && Array.isArray(stickerIds) && stickerIds.length > 0 && stickers) {
      // Use first sticker's name
      const firstStickerId = stickerIds[0]
      const sticker = stickers[firstStickerId]
      if (sticker && sticker.name) {
        return String(sticker.name)
      }
      // Fallback to sticker ID
      return String(firstStickerId)
    }
    // Fallback to module name
    return module.name
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

// ID generator for nodes - generates IDs based on module type
const nodeIdCounters: Record<string, number> = {}

export const getId = (moduleName?: string, nodeType?: string): string => {
  // Determine the base name from module name or node type
  let baseName = 'node'
  if (moduleName) {
    // Convert module name to snake_case for ID
    baseName = moduleName.toLowerCase().replace(/\s+/g, '_')
  } else if (nodeType) {
    // Convert node type to snake_case
    baseName = nodeType.toLowerCase().replace(/\s+/g, '_')
  }

  // Get or initialize counter for this base name
  if (!nodeIdCounters[baseName]) {
    nodeIdCounters[baseName] = 0
  }

  // Increment and return ID
  return `${baseName}_${++nodeIdCounters[baseName]}`
}
