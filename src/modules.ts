import { type NodeType } from './nodeConfigs'

// Module types are node types except branchingOutput (which is created automatically)
export type ModuleType = Exclude<NodeType, 'branchingOutput'>

// Param can be any type - no restrictions
export interface Param {
    name: string
    type?: string // Optional type hint for UI rendering, but params can be any value
}

export type OutputConfigType = 'listParam' | 'internal'

export interface OutputConfig {
    type: OutputConfigType
    // For listParam type, REQUIRED: specify which param contains the list
    listParamName?: string
    // For internal type, REQUIRED: specify the fixed number of outputs
    outputCount?: number
}

export interface Module {
    name: string
    type: ModuleType
    description: string
    params: Record<string, Param>
    // Name of the param that should be used as the node label (must be a primitive type)
    labelParam?: string
    outputCountConfig?: {
        min: number
        max?: number
    }
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
        "outputCountConfig": {
            "min": 0
        },
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
        "outputCountConfig": {
            "min": 0
        },
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
