import { type NodeType } from './nodeConfigs'

// Module types are node types except those that are auto-generated
// Auto-generated types are: branchingOutputInternal, branchingOutputListParam
type ExcludedModuleTypes = 'branchingOutputInternal' | 'branchingOutputListParam'
export type ModuleType = Exclude<NodeType, ExcludedModuleTypes>

// Param can be any type - no restrictions
export interface Param {
    name: string
    type?: string // Optional type hint for UI rendering, but params can be any value
    obligatory?: boolean // Whether this param is required (default: true if not specified)
}

// Discriminated union for type-safe output configuration
export type OutputConfig =
    | {
        type: 'listParam'
        listParamName: string // REQUIRED for listParam type
    }
    | {
        type: 'internal'
        outputCount: number // REQUIRED for internal type
    }

export interface Module {
    name: string
    type: ModuleType
    description: string
    params: Param[]
    // Name of the param that should be used as the node label (must be a primitive type)
    labelParam?: string
    // Output configuration for branching nodes
    outputConfig?: OutputConfig
    // Predefined labels for output nodes when using internal handling
    outputLabels?: string[]
    // Documentation string for the module (displayed as tooltip)
    documentation?: string
    // Default handlers for this module (e.g., "node_exit" for single nodes, "on_0", "on_1" for branching)
    handlers?: string[]
    // Source configuration (optional)
    source?: {
        path?: string
        unpack_params?: boolean
    }
    // Whether this module should appear in the toolbar (default: true)
    showInToolbar?: boolean
    // Whether this module's nodes should show the menu icon (default: true)
    showMenu?: boolean
    // Whether nodes of this module can be duplicated (default: true)
    canDuplicate?: boolean
    // For listParam branching nodes: whether duplicating an output node should add it to the parent (default: true)
    duplicateOutputAddsToParent?: boolean
}

// Default modules - these are always available
// Order: Type1, Branching, Branching2, Sticker, End, ... rest
const defaultModules: Module[] = [
    {
        "name": "Type 1",
        "type": "single",
        "description": "Module 1 description",
        "params": [
            {
                "name": "what",
                "type": "str"
            },
            {
                "name": "how",
                "type": "int"
            },
            {
                "name": "why",
                "type": "bool"
            }
        ],
        "labelParam": "what",
        "handlers": ["on_1"],
        "source": {
            "path": "",
            "unpack_params": true
        },
        "documentation": "Placeholder documentation for Type 1 module"
    },
    {
        "name": "Branching",
        "type": "branchingListParam",
        "description": "Branching node that contains output nodes",
        "params": [
            {
                "name": "outputs",
                "type": "list[str]",
                "obligatory": true
            }
        ],
        "labelParam": undefined,
        "outputConfig": {
            "type": "listParam",
            "listParamName": "outputs"
        },
        "handlers": ["on_0", "on_1"],
        "source": {
            "path": "",
            "unpack_params": true
        },
        "documentation": "Placeholder documentation for Branching module"
    },
    {
        "name": "Branching2",
        "type": "branchingInternal",
        "description": "Branching node that contains output nodes",
        "params": [],
        "labelParam": undefined,
        "outputConfig": {
            "type": "internal",
            "outputCount": 2
        },
        "outputLabels": ["Output 1", "Output 2"],
        "handlers": ["on_0", "on_1"],
        "source": {
            "path": "",
            "unpack_params": true
        },
        "canDuplicate": false, // Internal branching nodes and their outputs cannot be duplicated
        "documentation": "Placeholder documentation for Branching2 module"
    },
    {
        "name": "StickerModule",
        "type": "sticker",
        "description": "Sticker node for visual organization",
        "params": [
            {
                "name": "stickers",
                "type": "list[str]",
                "obligatory": true
            }
        ],
        "labelParam": undefined, // Will be computed from stickers array
        "handlers": ["node_exit"],
        "source": {
            "path": "",
            "unpack_params": true
        },
        "documentation": "Sticker node for visual organization with color coding"
    },
    {
        "name": "End",
        "type": "inputOnly",
        "description": "End node - exit point of the flow",
        "params": [],
        "source": {
            "path": "",
            "unpack_params": true
        },
        "documentation": "End node marks the end of the flow"
    },
    {
        "name": "Type 2",
        "type": "single",
        "description": "Module 2 description",
        "params": [
            {
                "name": "what",
                "type": "str"
            }
        ],
        "labelParam": "what",
        "handlers": ["node_exit"],
        "source": {
            "path": "",
            "unpack_params": true
        },
        "documentation": "Placeholder documentation for Type 2 module"
    },
    {
        "name": "Type Q",
        "type": "single",
        "description": "Module Q description",
        "params": [
            {
                "name": "what",
                "type": "str"
            }
        ],
        "labelParam": "what",
        "handlers": ["node_exit"],
        "source": {
            "path": "",
            "unpack_params": true
        },
        "documentation": "Placeholder documentation for Type Q module"
    },
    {
        "name": "Start",
        "type": "outputOnly",
        "description": "Start node - entry point of the flow",
        "params": [],
        "handlers": ["node_exit"],
        "source": {
            "path": "",
            "unpack_params": true
        },
        "showInToolbar": false, // Start node should not appear in toolbar
        "showMenu": false, // Start node should not show menu icon
        "canDuplicate": false, // Start node cannot be duplicated
        "documentation": "Start node marks the beginning of the flow"
    }
]

// Dynamically loaded modules (will be populated by downloadModules)
let dynamicModules: Module[] = []

// Combined modules list - this will be updated when dynamic modules are loaded
let modules: Module[] = [...defaultModules]

/**
 * Download additional modules from server (placeholder for future implementation)
 * @param mchannelsBotId - The mchannels bot ID to fetch modules for
 */
export async function downloadModules(mchannelsBotId: string): Promise<Module[]> {
    // TODO: Implement actual API call to fetch modules
    // For now, return empty array
    // Example:
    // const response = await fetch(`/api/modules?bot_id=${mchannelsBotId}`)
    // const data = await response.json()
    // return data.modules as Module[]

    console.log('downloadModules called with mchannels_bot_id:', mchannelsBotId)
    return []
}

/**
 * Add dynamically loaded modules to the modules list
 */
export function addDynamicModules(newModules: Module[]): void {
    dynamicModules = [...newModules]
    modules = [...defaultModules, ...dynamicModules]
}

// Export the modules array (will be updated by addDynamicModules)
export default modules
