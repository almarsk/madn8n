import { type NodeType } from './nodeConfigs'

// Module types are node types except branchingOutput (which is created automatically)
export type ModuleType = Exclude<NodeType, 'branchingOutput'>

// Param can be any type - no restrictions
export interface Param {
    name: string
    type?: string // Optional type hint for UI rendering, but params can be any value
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
    params: Record<string, Param>
    // Name of the param that should be used as the node label (must be a primitive type)
    labelParam?: string
    // Output configuration for branching nodes
    outputConfig?: OutputConfig
}

const modules: Module[] = [
    {
        "name": "Branching",
        "type": "branching",
        "description": "Branching node that contains output nodes",
        "params": {
            "outputs": {
                "name": "outputs",
                "type": "list[str]"
            }
        },
        "labelParam": undefined,
        "outputConfig": {
            "type": "listParam",
            "listParamName": "outputs"
        }
    },
    {
        "name": "Branching2",
        "type": "branching",
        "description": "Branching node that contains output nodes",
        "params": {},
        "labelParam": undefined,
        "outputConfig": {
            "type": "internal",
            "outputCount": 2
        }
    },
    {
        "name": "Type 1",
        "type": "single",
        "description": "Module 1 description",
        "params": {
            "what": {
                "name": "what",
                "type": "string"
            },
            "how": {
                "name": "how",
                "type": "string"
            }
        },
        "labelParam": "what"
    },
    {
        "name": "Type 2",
        "type": "single",
        "description": "Module 2 description",
        "params": {
            "what": {
                "name": "what",
                "type": "string"
            }
        },
        "labelParam": "what"
    },
    {
        "name": "Type Q",
        "type": "single",
        "description": "Module Q description",
        "params": {
            "what": {
                "name": "what",
                "type": "string"
            }
        },
        "labelParam": "what"
    }
]

export default modules
