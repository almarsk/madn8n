import { Handle, Position, type NodeProps } from 'reactflow'

interface DynamicNodeData {
    label: string
    connectingFrom?: string | null
    debugLogging?: boolean
}

function DynamicNode({ data }: NodeProps<DynamicNodeData>) {
    // Always show source and target handles to ensure React Flow can detect them
    // The handles are invisible but always present in the DOM for proper connection detection
    const showSourceHandles = true
    const showTargetHandles = true

    return (
        <div className="dynamic-node">
            <div className="dynamic-node-label">{data.label}</div>

            {/* Target handles - always rendered to ensure React Flow can detect them */}
            {showTargetHandles && (
                <>
                    <Handle type="target" position={Position.Top} id="top-target" className="invisible-handle" isConnectable={true} />
                    <Handle type="target" position={Position.Right} id="right-target" className="invisible-handle" isConnectable={true} />
                    <Handle type="target" position={Position.Bottom} id="bottom-target" className="invisible-handle" isConnectable={true} />
                    <Handle type="target" position={Position.Left} id="left-target" className="invisible-handle" isConnectable={true} />
                </>
            )}

            {/* Source handles - always rendered to ensure React Flow can detect them */}
            {showSourceHandles && (
                <>
                    <Handle type="source" position={Position.Top} id="top-source" className="invisible-handle" isConnectable={true} />
                    <Handle type="source" position={Position.Right} id="right-source" className="invisible-handle" isConnectable={true} />
                    <Handle type="source" position={Position.Bottom} id="bottom-source" className="invisible-handle" isConnectable={true} />
                    <Handle type="source" position={Position.Left} id="left-source" className="invisible-handle" isConnectable={true} />
                </>
            )}
        </div>
    )
}

export default DynamicNode
