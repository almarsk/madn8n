export interface Module {
    name: string
    description: string
    params: Record<string, string>
}

const modules: Module[] = [
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
