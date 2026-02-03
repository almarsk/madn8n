import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import NodeList from './NodeList'

interface ToolbarProps {
  modules: Array<{ name: string; description: string; params: Record<string, string> }>
  onNodeDragStart: (type: string) => (event: React.DragEvent) => void
  onSidebarNodeClick: (moduleName: string) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
  isLocked: boolean
  onLockToggle: () => void
  showMinimap: boolean
  onMinimapToggle: () => void
}

export default function Toolbar({
  modules,
  onNodeDragStart,
  onSidebarNodeClick,
  onZoomIn,
  onZoomOut,
  onFitView,
  isLocked,
  onLockToggle,
  showMinimap,
  onMinimapToggle,
}: ToolbarProps) {
  const [toolbarPosition, setToolbarPosition] = useState({ x: 16, y: 16 })
  const [toolbarSize, setToolbarSize] = useState({ width: 280, height: 260 })
  const [isToolbarMinimized, setIsToolbarMinimized] = useState(false)

  // Fixed width based on button bar - buttons will wrap to new lines
  const TOOLBAR_FIXED_WIDTH = 280

  const onToolbarMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startY = event.clientY
    const { x, y } = toolbarPosition

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      setToolbarPosition({ x: x + deltaX, y: y + deltaY })
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const onToolbarResizeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const startY = event.clientY
    const { height } = toolbarSize

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY

      const nextHeight = Math.max(160, height + deltaY)

      // Only allow vertical resizing, width is fixed
      setToolbarSize({ width: TOOLBAR_FIXED_WIDTH, height: nextHeight })
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      className={`nodes-toolbar ${isToolbarMinimized ? 'nodes-toolbar--minimized' : ''}`}
      style={{
        transform: `translate(${toolbarPosition.x}px, ${toolbarPosition.y}px)`,
        width: TOOLBAR_FIXED_WIDTH,
        height: isToolbarMinimized ? 'auto' : toolbarSize.height,
      }}
    >
      <div className="nodes-toolbar-header" onMouseDown={onToolbarMouseDown}>
        <span className="nodes-toolbar-title">Toolbar</span>
        <button
          type="button"
          className="nodes-toolbar-toggle"
          onClick={(e) => {
            e.stopPropagation()
            setIsToolbarMinimized((prev) => !prev)
          }}
        >
          {isToolbarMinimized ? '_' : '–'}
        </button>
      </div>

      {!isToolbarMinimized && (
        <div className="nodes-toolbar-body">
          <section className="nodes-toolbar-section">
            <div className="toolbar-nav">
              <button
                type="button"
                className="toolbar-nav-button"
                onClick={onZoomOut}
                title="Zoom out"
              >
                -
              </button>
              <button
                type="button"
                className="toolbar-nav-button"
                onClick={onFitView}
                title="Fit view"
              >
                ⛶
              </button>
              <button
                type="button"
                className="toolbar-nav-button"
                onClick={onZoomIn}
                title="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className={`toolbar-nav-button toolbar-lock-button ${isLocked ? 'toolbar-lock-button--active' : ''}`}
                onClick={onLockToggle}
                title={isLocked ? 'Unlock canvas interactions' : 'Lock canvas interactions'}
              >
                {isLocked ? '🔒' : '🔓'}
              </button>
              <button
                type="button"
                className={`toolbar-nav-button ${showMinimap ? 'toolbar-lock-button--active' : ''}`}
                onClick={onMinimapToggle}
                title={showMinimap ? 'Hide minimap' : 'Show minimap'}
              >
                🗺️
              </button>
            </div>
          </section>
          <section className="nodes-toolbar-section">
            <NodeList
              modules={modules}
              onNodeDragStart={onNodeDragStart}
              onSidebarNodeClick={onSidebarNodeClick}
            />
          </section>

          <div
            className="nodes-toolbar-resize-handle"
            onMouseDown={onToolbarResizeMouseDown}
          />
        </div>
      )}
    </div>
  )
}
