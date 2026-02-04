import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow'
import nodeConfigs, { type NodeConfig, type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES } from './nodeConfigs'

interface NodeFactoryData extends NodeConfig {
    label: string
    nodeType: NodeType
    connectingFrom?: string | null
    attemptingFromBlockedNode?: string | null
    onLabelClick?: (nodeId: string) => void
    // For branching nodes
    outputCount?: number
    // For branching output nodes
    parentNodeId?: string
}

function NodeFactory({ data, id }: NodeProps<NodeFactoryData>) {
    const { getNodes, getEdges } = useReactFlow()
    const nodes = getNodes()
    const edges = getEdges()
    const currentNode = nodes.find(n => n.id === id)
    const connectingFrom = currentNode?.data?.connectingFrom
    const isDraggingConnection = connectingFrom !== null
    const isSourceNode = connectingFrom === id

    // Get node configuration
    const nodeType = data.nodeType || NODE_TYPES.SINGLE
    const config = nodeConfigs[nodeType]
    
    if (!config) {
        console.warn(`Unknown node type: ${nodeType}`)
        return null
    }

    // Check if this node already has an outgoing edge
    const hasOutgoingEdge = edges.some(edge => edge.source === id)

    // Show target handles visibly when dragging a connection (and this is not the source node)
    const showTargetHandlesVisible = isDraggingConnection && !isSourceNode && config.hasTargetHandles

    const handleLabelClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (data.onLabelClick) {
            data.onLabelClick(id)
        }
    }

    // For branching output nodes, make the entire node clickable
    const handleNodeClick = (e: React.MouseEvent) => {
        if (isBranchingOutputNodeType(nodeType)) {
            e.stopPropagation()
            if (data.onLabelClick) {
                data.onLabelClick(id)
            }
        }
    }

    // Determine if source handles should be shown
    // For single nodes: only show if not connected yet
    // For branchingOutput: only show if not connected yet
    // For branching: never show (config.hasSourceHandles is false)
    const showSourceHandles = config.hasSourceHandles && !hasOutgoingEdge

    // Determine CSS classes
    const baseClasses = 'dynamic-node'
    const connectedClass = hasOutgoingEdge ? 'dynamic-node--connected' : ''
    const typeClass = config.className || ''
    const nodeClasses = `${baseClasses} ${typeClass} ${connectedClass}`.trim()

    // Determine cursor style
    const cursorStyle = hasOutgoingEdge ? 'default' : 'grab'

    return (
        <div
            className={nodeClasses}
            style={{ cursor: cursorStyle }}
            onClick={isBranchingOutputNodeType(nodeType) ? handleNodeClick : undefined}
        >
            <div
                className={`dynamic-node-label ${isBranchingNodeType(nodeType) ? 'branching-node-header' : ''}`}
                onClick={handleLabelClick}
            >
                <span>{data.label}</span>
                <span className="dynamic-node-label-menu-icon">⋮</span>
            </div>

            {/* Target handles - render if config allows */}
            {config.hasTargetHandles && (
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

            {/* Source handles - render if config allows and conditions are met */}
            {showSourceHandles && (
                <>
                    <Handle
                        type="source"
                        position={Position.Top}
                        id="top-source"
                        className="invisible-handle"
                        isConnectable={true}
                        isConnectableStart={config.canStartConnection}
                    />
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="right-source"
                        className="invisible-handle"
                        isConnectable={true}
                        isConnectableStart={config.canStartConnection}
                    />
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="bottom-source"
                        className="invisible-handle"
                        isConnectable={true}
                        isConnectableStart={config.canStartConnection}
                    />
                    <Handle
                        type="source"
                        position={Position.Left}
                        id="left-source"
                        className="invisible-handle"
                        isConnectable={true}
                        isConnectableStart={config.canStartConnection}
                    />
                </>
            )}
        </div>
    )
}

export default NodeFactory
