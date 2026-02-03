import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow'

interface DynamicNodeData {
    label: string
    connectingFrom?: string | null
    attemptingFromBlockedNode?: string | null
    onLabelClick?: (nodeId: string) => void
}

function DynamicNode({ data, id }: NodeProps<DynamicNodeData>) {
    const { getNodes, getEdges } = useReactFlow()
    const nodes = getNodes()
    const edges = getEdges()
    const currentNode = nodes.find(n => n.id === id)
    const connectingFrom = currentNode?.data?.connectingFrom
    const isDraggingConnection = connectingFrom !== null
    const isSourceNode = connectingFrom === id

    // Check if this node already has an outgoing edge
    const hasOutgoingEdge = edges.some(edge => edge.source === id)

    // Show target handles visibly when dragging a connection (and this is not the source node)
    const showTargetHandlesVisible = isDraggingConnection && !isSourceNode

    // Always render target handles for React Flow detection
    const showTargetHandles = true

    const handleLabelClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (data.onLabelClick) {
            data.onLabelClick(id)
        }
    }

    return (
        <div
            className={`dynamic-node ${hasOutgoingEdge ? 'dynamic-node--connected' : ''}`}
            style={{ cursor: hasOutgoingEdge ? 'default' : 'grab' }}
        >

            <div
                className="dynamic-node-label"
                onClick={handleLabelClick}
            >
                {data.label}
                <span className="dynamic-node-label-menu-icon">⋮</span>
            </div>

            {/* Target handles - visible when dragging a connection */}
            {/* Target handles can receive connections but cannot start them */}
            {showTargetHandles && (
                <>
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
                </>
            )}

            {/* Source handles - only render if node is not connected yet */}
            {/* Once connected, no need for source handles */}
            {/* Source handles can start connections */}
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

export default DynamicNode
