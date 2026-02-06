import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow'
import nodeConfigs, {
    type NodeConfig,
    type NodeType,
    isBranchingNodeType,
    isBranchingOutputNodeType,
    NODE_TYPES,
} from './nodeConfigs'
import modules from './modules'
import { useCallback } from 'react'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Tooltip from '@mui/material/Tooltip'

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
    const { getNodes, getEdges, setNodes } = useReactFlow()
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

    const handleMenuIconClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        if (data.onLabelClick) {
            data.onLabelClick(id)
        }
    }

    // For branching output nodes, clicking the node itself should select it
    // But menu only opens via the three dots icon
    const handleNodeClick = useCallback((e: React.MouseEvent) => {
        if (isBranchingOutputNodeType(nodeType)) {
            e.stopPropagation()

            // Explicitly select only this node and deselect parent and all other nodes
            setNodes((nds) => {
                return nds.map((node) => {
                    // Deselect parent if it exists
                    if (data.parentNodeId && node.id === data.parentNodeId) {
                        return { ...node, selected: false }
                    }
                    // Select the clicked output node
                    if (node.id === id) {
                        return { ...node, selected: true }
                    }
                    // Deselect all other nodes
                    return { ...node, selected: false }
                })
            })
        }
    }, [nodeType, data.parentNodeId, id, setNodes])

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

    // Check if menu should be shown - check module config
    // For branching output nodes: show menu only if it's a listParam type (linked param), not internal
    // For other nodes: show menu unless module has showMenu=false
    const moduleName = currentNode?.data?.moduleName
    const module = moduleName ? modules.find((m) => m.name === moduleName) : undefined
    let showMenu = false
    if (isBranchingOutputNodeType(nodeType)) {
        // Show menu for listParam output nodes (linked param), not for internal ones
        showMenu = module?.outputConfig?.type === 'listParam'
    } else {
        // For non-output nodes, show menu unless explicitly disabled
        showMenu = module?.showMenu !== false
    }

    // For branching nodes, prevent clicks on the container from selecting the node
    // Only the header should be clickable for selection (but not menu opening - that's only via three dots)
    const handleBranchingNodeMouseDown = (e: React.MouseEvent) => {
        // Only allow clicks on the header to select the node
        // If click is not on the header, prevent selection
        const target = e.target as HTMLElement
        const isClickOnHeader = target.closest('.branching-node-header') !== null
        const isClickOnMenuIcon = target.closest('.dynamic-node-label-menu-icon') !== null

        // Allow menu icon clicks to work
        if (isClickOnMenuIcon) {
            return
        }

        if (!isClickOnHeader) {
            e.stopPropagation()
            e.preventDefault()
        }
    }

    // Helper to determine appropriate text color based on background brightness
    const getTextColorForBackground = (bgColor: string | undefined): string | undefined => {
        if (!bgColor || typeof bgColor !== 'string') return undefined

        // Support hex colors in the form #RRGGBB or #RGB
        let hex = bgColor.trim()
        if (hex.startsWith('#')) {
            hex = hex.slice(1)
        }

        if (hex.length === 3) {
            // Expand #RGB to #RRGGBB
            hex = hex.split('').map(ch => ch + ch).join('')
        }

        if (hex.length !== 6) {
            return undefined
        }

        const r = parseInt(hex.slice(0, 2), 16)
        const g = parseInt(hex.slice(2, 4), 16)
        const b = parseInt(hex.slice(4, 6), 16)
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
            return undefined
        }

        // Perceived brightness (relative luminance approximation)
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255

        // For light backgrounds (brightness above threshold), use dark text for readability.
        // Lower threshold slightly so text switches to dark on medium-light colors as well.
        // Otherwise keep light text to contrast darker backgrounds.
        return brightness > 0.5 ? '#020617' : '#e5e7eb'
    }

    // Apply sticker color if available and adjust text color for readability
    const stickerColor = (data as any).stickerColor as string | undefined
    const stickerTextColor = getTextColorForBackground(stickerColor)
    const nodeStyle = stickerColor
        ? {
            cursor: cursorStyle,
            backgroundColor: stickerColor,
            ...(stickerTextColor ? { color: stickerTextColor } : {}),
        }
        : { cursor: cursorStyle }

    return (
        <div
            className={nodeClasses}
            style={nodeStyle}
            onClick={isBranchingOutputNodeType(nodeType) ? handleNodeClick : undefined}
            onMouseDown={isBranchingNodeType(nodeType) ? handleBranchingNodeMouseDown : undefined}
        >
            <div
                className={`dynamic-node-label ${isBranchingNodeType(nodeType) ? 'branching-node-header' : ''}`}
                style={stickerTextColor ? { color: stickerTextColor } : undefined}
            >
                <span
                    className="dynamic-node-label-text"
                    style={stickerTextColor ? { color: stickerTextColor } : undefined}
                >
                    {data.label}
                </span>
                {showMenu && (
                    <div
                        className="dynamic-node-label-menu-opener"
                        onClick={handleMenuIconClick}
                        title="Open node menu"
                    >
                        <Tooltip title="Open node menu" arrow placement="top" disableInteractive>
                            <button
                                type="button"
                                className="dynamic-node-label-menu-icon"
                                onClick={handleMenuIconClick}
                                aria-label="Open node menu"
                            >
                                <MoreVertIcon fontSize="small" />
                            </button>
                        </Tooltip>
                    </div>
                )}
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
