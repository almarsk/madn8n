import { useMemo } from 'react'
import ReactFlow, {
  ReactFlowInstance,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type Connection,
} from 'reactflow'
import 'reactflow/dist/style.css'
import DynamicNode from '../DynamicNode'

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
  isLocked: boolean
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
  isLocked,
}: FlowCanvasProps) {
  const nodeTypes = useMemo(
    () => ({
      dynamic: DynamicNode,
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
      nodesDraggable={!isLocked}
      nodesConnectable={!isLocked}
      elementsSelectable={!isLocked}
      deleteKeyCode={!isLocked ? 'Backspace' : undefined}
      minZoom={0.02}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#94a3b8" />
    </ReactFlow>
  )
}
