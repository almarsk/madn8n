import modules from '../modules'
import { nodeConfigs, type NodeType } from '../nodeConfigs'

/**
 * Helper functions to identify special modules from configuration
 * instead of hard-coding module names.
 */

/**
 * Find the Start module (entry point of the flow).
 * Identified by checking node configs: module type must be 'outputOnly' in node config,
 * and the module should have showInToolbar=false and showMenu=false (derived from config behavior).
 */
export const getStartModule = () => {
  return modules.find((m) => {
    // Check if this module's type corresponds to 'outputOnly' in node configs
    const nodeConfig = nodeConfigs[m.type as NodeType]
    if (!nodeConfig || nodeConfig.type !== 'outputOnly') {
      return false
    }
    // Start module should not appear in toolbar and should not show menu
    // This is determined by the module's showInToolbar and showMenu flags
    // which should be set based on the node config type
    return m.showInToolbar === false && m.showMenu === false
  })
}

/**
 * Check if a module is the Start module.
 */
export const isStartModule = (moduleName: string | undefined): boolean => {
  if (!moduleName) return false
  const startModule = getStartModule()
  return startModule?.name === moduleName
}

/**
 * Check if a node is a Start node.
 */
export const isStartNode = (node: { data?: { moduleName?: string } } | null | undefined): boolean => {
  if (!node?.data?.moduleName) return false
  return isStartModule(node.data.moduleName)
}

/**
 * Find the Sticker module.
 * Identified by: type === 'sticker'
 * Note: If there are multiple modules with type 'sticker', this returns the first one.
 * Use isStickerModule() to check if a specific module name is a sticker module.
 */
export const getStickerModule = () => {
  return modules.find((m) => m.type === 'sticker')
}

/**
 * Check if a module is a Sticker module.
 * A module is considered a sticker module if it has at least one parameter with type 'stickers'.
 * This is based on functionality, not naming conventions.
 */
export const isStickerModule = (moduleName: string | undefined): boolean => {
  if (!moduleName) return false
  const module = modules.find((m) => m.name === moduleName)
  return module?.params?.some((p) => p.type === 'stickers') ?? false
}

/**
 * Check if a node is a Sticker node.
 * A node is a sticker node if its module has at least one parameter with type 'stickers'.
 * This is based on functionality (the ability to choose stickers), not naming conventions.
 */
export const isStickerNode = (
  node: { data?: { moduleName?: string } } | null | undefined
): boolean => {
  if (!node?.data?.moduleName) return false
  return isStickerModule(node.data.moduleName)
}

/**
 * Get module by name.
 */
export const getModuleByName = (moduleName: string | undefined) => {
  if (!moduleName) return undefined
  return modules.find((m) => m.name === moduleName)
}
