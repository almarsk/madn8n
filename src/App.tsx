import { useCallback, useRef, useState } from 'react'
import { ReactFlowInstance, useEdgesState, useNodesState, type Node } from 'reactflow'
import './App.css'
import modules from './modules'
import Toolbar from './components/Toolbar'
import FlowCanvas from './components/FlowCanvas'
import Minimap from './Minimap'
import { useConnectionHandlers } from './hooks/useConnectionHandlers'

const initialNodes: Node[] = []
const initialEdges: any[] = []

const getId = (() => {
  let id = 0
  return () => `node_${id++}`
})()

function App() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [debugLogging, setDebugLogging] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const { isValidConnection, onConnectStart, onConnectEnd, onConnect } = useConnectionHandlers({
    edges,
    setEdges,
    setNodes,
    debugLogging,
  })

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      if (!reactFlowWrapper.current || !reactFlowInstance) {
        return
      }

      const type = event.dataTransfer.getData('application/reactflow')
      if (!type) {
        return
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const module = modules.find((m) => m.name === type)
      const newNode: Node = {
        id: getId(),
        type: 'dynamic',
        position,
        data: {
          label: module?.name ?? type,
          connectingFrom: null,
          debugLogging: debugLogging,
        },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes, debugLogging]
  )

  const onNodeDragStart = (type: string) => (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onSidebarNodeClick = useCallback(
    (moduleName: string) => {
      if (!reactFlowInstance) {
        return
      }

      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!bounds) {
        return
      }

      const centerX = bounds.width / 2
      const centerY = bounds.height / 2

      const position = reactFlowInstance.screenToFlowPosition({
        x: centerX,
        y: centerY,
      })

      const module = modules.find((m) => m.name === moduleName)
      const newNode: Node = {
        id: getId(),
        type: 'dynamic',
        position,
        data: {
          label: module?.name ?? moduleName,
          connectingFrom: null,
          debugLogging: debugLogging,
        },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes, debugLogging]
  )

  const handleZoomIn = () => {
    reactFlowInstance?.zoomIn?.()
  }

  const handleZoomOut = () => {
    reactFlowInstance?.zoomOut?.()
  }

  const handleFitView = () => {
    reactFlowInstance?.fitView?.({ padding: 0.2 })
  }

  const onMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
      setViewport(viewport)
    },
    []
  )

  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      setReactFlowInstance(instance)
      const viewport = instance.getViewport()
      setViewport(viewport)
    },
    []
  )

  // Wrap onEdgesChange to maintain compatibility
  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      onEdgesChange(changes)
    },
    [onEdgesChange]
  )

  return (
    <div className="app-root">
      <main className="canvas-wrapper" ref={reactFlowWrapper}>
        <Toolbar
          modules={modules}
          onNodeDragStart={onNodeDragStart}
          onSidebarNodeClick={onSidebarNodeClick}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          isLocked={isLocked}
          onLockToggle={() => setIsLocked((prev) => !prev)}
          debugLogging={debugLogging}
          onDebugToggle={() => setDebugLogging((prev) => !prev)}
          showMinimap={showMinimap}
          onMinimapToggle={() => setShowMinimap((prev) => !prev)}
        />

        <FlowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onInit={onInit}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onMove={onMove}
          isLocked={isLocked}
        />

        {showMinimap && reactFlowInstance && (
          <Minimap
            nodes={nodes}
            edges={edges}
            reactFlowInstance={reactFlowInstance}
            viewport={viewport}
            reactFlowWrapper={reactFlowWrapper}
          />
        )}
      </main>
    </div>
  )
}

export default App
