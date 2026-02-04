import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react'
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
  onExportJson: () => void
  onValidate: () => void
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
  onExportJson,
  onValidate,
}: ToolbarProps) {
  const [toolbarPosition, setToolbarPosition] = useState({ x: 16, y: 16 })
  const [toolbarSize, setToolbarSize] = useState({ width: 280, height: 260 })
  const [isToolbarMinimized, setIsToolbarMinimized] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

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

      // Calculate new position
      let newX = x + deltaX
      let newY = y + deltaY

      // Get actual toolbar dimensions from the DOM element
      const toolbarElement = toolbarRef.current
      if (toolbarElement) {
        const toolbarRect = toolbarElement.getBoundingClientRect()
        const toolbarWidth = toolbarRect.width
        const toolbarHeight = toolbarRect.height

        // Get viewport dimensions
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        // Constrain position to keep toolbar within viewport
        // Minimum position: 0, 0 (top-left corner)
        // Maximum position: viewport - toolbar dimensions
        const minX = 0
        const minY = 0
        const maxX = viewportWidth - toolbarWidth
        const maxY = viewportHeight - toolbarHeight

        // Clamp the position
        newX = Math.max(minX, Math.min(maxX, newX))
        newY = Math.max(minY, Math.min(maxY, newY))
      }

      setToolbarPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Snap toolbar into viewport when unminimized
  useEffect(() => {
    if (!isToolbarMinimized && toolbarRef.current) {
      // Wait for DOM to update after unminimizing
      requestAnimationFrame(() => {
        if (!toolbarRef.current) return

        const toolbarElement = toolbarRef.current
        const toolbarRect = toolbarElement.getBoundingClientRect()
        const toolbarWidth = toolbarRect.width
        const toolbarHeight = toolbarRect.height

        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        let newX = toolbarPosition.x
        let newY = toolbarPosition.y

        // Check if toolbar is outside viewport and adjust if needed
        const minX = 0
        const minY = 0
        const maxX = viewportWidth - toolbarWidth
        const maxY = viewportHeight - toolbarHeight

        // Clamp position to viewport bounds
        if (newX < minX || newX > maxX || newY < minY || newY > maxY) {
          newX = Math.max(minX, Math.min(maxX, newX))
          newY = Math.max(minY, Math.min(maxY, newY))
          setToolbarPosition({ x: newX, y: newY })
        }
      })
    }
  }, [isToolbarMinimized])

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
      ref={toolbarRef}
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
                className={`toolbar-nav-button ${showMinimap ? 'toolbar-lock-button--active' : ''}`}
                onClick={onMinimapToggle}
                title={showMinimap ? 'Hide minimap' : 'Show minimap'}
              >
                🗺️
              </button>
              <button
                type="button"
                className="toolbar-nav-button"
                onClick={onExportJson}
                title="Export JSON to console"
              >
                📋
              </button>
              <button
                type="button"
                className="toolbar-nav-button"
                onClick={onValidate}
                title="Validate flow"
              >
                ✓
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
