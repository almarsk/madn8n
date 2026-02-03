export interface Module {
    name: string
    description: string
    params: Record<string, string>
    outputCountConfig?: {
        min: number
        max: number
    }
}

const modules: Module[] = [
    {
        "name": "Branching",
        "description": "Branching node that contains output nodes",
        "params": {},
        "outputCountConfig": {
            "min": 1,
            "max": 10
        }
    },
    {
        "name": "Type 1",
        "description": "Module 1 description",
        "params": {
            "what": "string"
        }
    },
    {
        "name": "Type 2",
        "description": "Module 2 description",
        "params": {
            "what": "string"
        }
    },
    {
        "name": "Type Q",
        "description": "Module Q description",
        "params": {
            "what": "string"
        }
    }
]

export default modules
