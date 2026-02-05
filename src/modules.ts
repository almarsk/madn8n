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
}

const modules: Module[] = [
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
        "documentation": "Placeholder documentation for Branching2 module"
    },
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
        "handlers": ["node_exit"],
        "source": {
            "path": "",
            "unpack_params": true
        },
        "documentation": "Placeholder documentation for Type 1 module"
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
    }
]

export default modules
