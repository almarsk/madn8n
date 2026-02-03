import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow'

interface BranchingNodeOutputData {
    label: string
    parentNodeId: string
    connectingFrom?: string | null
    onLabelClick?: (nodeId: string) => void
}

function BranchingNodeOutput({ data, id }: NodeProps<BranchingNodeOutputData>) {
    const { getNodes, getEdges } = useReactFlow()
    const nodes = getNodes()
    const edges = getEdges()
    const currentNode = nodes.find(n => n.id === id)
    const connectingFrom = currentNode?.data?.connectingFrom
    const isDraggingConnection = connectingFrom !== null
    const isSourceNode = connectingFrom === id

    // Check if this output node already has an outgoing edge
    const hasOutgoingEdge = edges.some(edge => edge.source === id)

    // Show target handles visibly when dragging a connection (and this is not the source node)
    const showTargetHandlesVisible = isDraggingConnection && !isSourceNode

    const handleLabelClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (data.onLabelClick) {
            data.onLabelClick(id)
        }
    }

    return (
        <div
            className={`dynamic-node branching-node-output ${hasOutgoingEdge ? 'dynamic-node--connected' : ''}`}
            style={{ cursor: hasOutgoingEdge ? 'default' : 'grab' }}
        >
            <div
                className="dynamic-node-label"
                onClick={handleLabelClick}
            >
                {data.label}
                <span className="dynamic-node-label-menu-icon">⋮</span>
            </div>

            {/* Output nodes have NO target handles - they only output */}
            {/* Source handles - only render if node is not connected yet */}
            {/* Output nodes can have one output each */}
            {!hasOutgoingEdge && (
                <>
                    <Handle
                        type="source"
                        position={Position.Top}
                        id="top-source"
                        className="invisible-handle"
                        isConnectable={true}
                        isConnectableStart={true}
                    />
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="right-source"
                        className="invisible-handle"
                        isConnectable={true}
                        isConnectableStart={true}
                    />
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="bottom-source"
                        className="invisible-handle"
                        isConnectable={true}
                        isConnectableStart={true}
                    />
                    <Handle
                        type="source"
                        position={Position.Left}
                        id="left-source"
                        className="invisible-handle"
                        isConnectable={true}
                        isConnectableStart={true}
                    />
                </>
            )}
        </div>
    )
}

export default BranchingNodeOutput
