import { type NodeType } from './nodeConfigs'

// Module types are node types except branchingOutput (which is created automatically)
export type ModuleType = Exclude<NodeType, 'branchingOutput'>

export interface Module {
    name: string
    type: ModuleType
    description: string
    params: Record<string, string>
    outputCountConfig?: {
        min: number
        max?: number
    }
}

const modules: Module[] = [
    {
        "name": "Branching",
        "type": "branching",
        "description": "Branching node that contains output nodes",
        "params": {},
        "outputCountConfig": {
            "min": 0
        }
    },
    {
        "name": "Branching2",
        "type": "branching",
        "description": "Branching node that contains output nodes",
        "params": {},
        "outputCountConfig": {
            "min": 0
        }
    },
    {
        "name": "Type 1",
        "type": "single",
        "description": "Module 1 description",
        "params": {
            "what": "string"
        }
    },
    {
        "name": "Type 2",
        "type": "single",
        "description": "Module 2 description",
        "params": {
            "what": "string"
        }
    },
    {
        "name": "Type Q",
        "type": "single",
        "description": "Module Q description",
        "params": {
            "what": "string"
        }
    }
]

export default modules
