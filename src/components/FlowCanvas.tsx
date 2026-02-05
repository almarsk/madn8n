import { useMemo } from 'react'
import ReactFlow, {
  ReactFlowInstance,
  type Node,
  type Edge,
  type Connection,
} from 'reactflow'
import 'reactflow/dist/style.css'
import NodeFactory from '../NodeFactory'
import HierarchicalGridBackground from './HierarchicalGridBackground'

interface FlowCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: any[]) => void
  onEdgesChange: (changes: any[]) => void
  onConnect: (params: Edge | Connection) => void
  onConnectStart: (event: React.MouseEvent | React.TouchEvent, params: { nodeId: string | null; handleId: string | null }) => void
  onConnectEnd: (event: MouseEvent | TouchEvent) => void
  isValidConnection: (connection: Connection) => boolean
  onInit: (instance: ReactFlowInstance) => void
  onDrop: (event: React.DragEvent) => void
  onDragOver: (event: React.DragEvent) => void
  onMove: (event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => void
  onPaneClick?: (event: React.MouseEvent) => void
  onNodeDrag?: (event: React.MouseEvent | React.TouchEvent, node: Node) => void
  onNodeDragStop?: (event: React.MouseEvent | React.TouchEvent, node: Node) => void
  onSelectionStart?: (event: React.MouseEvent) => void
  isLocked: boolean
  viewport: { x: number; y: number; zoom: number }
}

export default function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onConnectStart,
  onConnectEnd,
  isValidConnection,
  onInit,
  onDrop,
  onDragOver,
  onMove,
  onPaneClick,
  onNodeDrag,
  onNodeDragStop,
  onSelectionStart,
  isLocked,
  viewport,
}: FlowCanvasProps) {
  const nodeTypes = useMemo(
    () => ({
      nodeFactory: NodeFactory,
    }),
    []
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={!isLocked ? onNodesChange : undefined}
      onEdgesChange={!isLocked ? onEdgesChange : undefined}
      onConnect={!isLocked ? onConnect : undefined}
      onConnectStart={!isLocked ? onConnectStart : undefined}
      onConnectEnd={!isLocked ? onConnectEnd : undefined}
      isValidConnection={isValidConnection}
      onInit={!isLocked ? onInit : undefined}
      onDrop={!isLocked ? onDrop : undefined}
      onDragOver={!isLocked ? onDragOver : undefined}
      onMove={onMove}
      onPaneClick={onPaneClick}
      onNodeDrag={!isLocked ? onNodeDrag : undefined}
      onNodeDragStop={!isLocked ? onNodeDragStop : undefined}
      onSelectionStart={!isLocked ? onSelectionStart : undefined}
      nodesDraggable={!isLocked}
      nodesConnectable={!isLocked}
      elementsSelectable={!isLocked}
      deleteKeyCode={!isLocked ? 'Backspace' : undefined}
      minZoom={0.02}
      proOptions={{ hideAttribution: true }}
      elevateNodesOnSelect={false}
      elevateEdgesOnSelect={false}
      connectionRadius={40}
      snapToGrid={false}
    >
      <HierarchicalGridBackground zoom={viewport.zoom} />
    </ReactFlow>
  )
}
