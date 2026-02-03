import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow'

interface BranchingNodeData {
    label: string
    outputCount: number
    connectingFrom?: string | null
    onLabelClick?: (nodeId: string) => void
}

function BranchingNode({ data, id }: NodeProps<BranchingNodeData>) {
    const { getNodes, getEdges } = useReactFlow()
    const nodes = getNodes()
    const edges = getEdges()
    const currentNode = nodes.find(n => n.id === id)
    const connectingFrom = currentNode?.data?.connectingFrom
    const isDraggingConnection = connectingFrom !== null
    const isSourceNode = connectingFrom === id

    // Branching nodes have no outputs, only target handles
    const showTargetHandlesVisible = isDraggingConnection && !isSourceNode

    // Get output nodes for this branching node
    const outputNodes = nodes.filter(n => n.type === 'branchingOutput' && n.data.parentNodeId === id)

    const handleLabelClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (data.onLabelClick) {
            data.onLabelClick(id)
        }
    }

    return (
        <div
            className="dynamic-node branching-node"
            style={{ cursor: 'grab', position: 'relative', display: 'flex', flexDirection: 'column', padding: 0 }}
        >
            <div
                className="dynamic-node-label branching-node-header"
                onClick={handleLabelClick}
            >
                {data.label}
                <span className="dynamic-node-label-menu-icon">⋮</span>
            </div>

            {/* Target handles - visible when dragging a connection */}
            {/* Target handles can receive connections but cannot start them */}
            <Handle
                type="target"
                position={Position.Top}
                id="top-target"
                className={showTargetHandlesVisible ? "visible-handle" : "invisible-handle"}
                isConnectable={true}
                isConnectableStart={false}
            />
            <Handle
                type="target"
                position={Position.Right}
                id="right-target"
                className={showTargetHandlesVisible ? "visible-handle" : "invisible-handle"}
                isConnectable={true}
                isConnectableStart={false}
            />
            <Handle
                type="target"
                position={Position.Bottom}
                id="bottom-target"
                className={showTargetHandlesVisible ? "visible-handle" : "invisible-handle"}
                isConnectable={true}
                isConnectableStart={false}
            />
            <Handle
                type="target"
                position={Position.Left}
                id="left-target"
                className={showTargetHandlesVisible ? "visible-handle" : "invisible-handle"}
                isConnectable={true}
                isConnectableStart={false}
            />

            {/* Branching nodes have NO source handles - they don't output directly */}
        </div>
    )
}

export default BranchingNode
