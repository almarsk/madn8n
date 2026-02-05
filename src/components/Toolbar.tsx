import { useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import NodeList from './NodeList'

import { type Module } from '../modules'
import SettingsIcon from '@mui/icons-material/Settings'
import MapIcon from '@mui/icons-material/Map'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import CodeIcon from '@mui/icons-material/Code'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import LabelIcon from '@mui/icons-material/Label'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import Tooltip from '@mui/material/Tooltip'

interface ToolbarProps {
  modules: Module[]
  onNodeDragStart: (type: string) => (event: React.DragEvent) => void
  onSidebarNodeClick: (moduleName: string) => void
  showMinimap: boolean
  onMinimapToggle: () => void
  onValidate: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  hasNodes: boolean
  toolbarRef: React.RefObject<HTMLDivElement>
  onOpenFlowConfigMenu: () => void
  onOpenJsonEditor: () => void
  onAutoLayout: () => void
  onOpenStickerMenu: () => void
  onFitView: () => void
}

export default function Toolbar({
  modules,
  onNodeDragStart,
  onSidebarNodeClick,
  showMinimap,
  onMinimapToggle,
  onValidate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  hasNodes,
  toolbarRef,
  onOpenFlowConfigMenu,
  onOpenJsonEditor,
  onAutoLayout,
  onOpenStickerMenu,
  onFitView,
}: ToolbarProps) {
  const [toolbarPosition, setToolbarPosition] = useState({ x: 16, y: 16 })
  const [toolbarSize, setToolbarSize] = useState({ width: 240, height: 390 }) // 1.5x of 260, wider for 3x3 buttons
  const [isToolbarMinimized, setIsToolbarMinimized] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter modules based on search query (substring search, case-insensitive)
  const filteredModules = modules.filter((module) =>
    module.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Width for 3x3 button grid - buttons spaced evenly
  const TOOLBAR_FIXED_WIDTH = 240 // Wider for 3x3 buttons with even spacing

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
    const startTop = toolbarPosition.y

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY
      // Calculate minimum height based on header + minimum body content
      // Header is ~40px, minimum body should allow at least the button bar (~60px)
      const minHeight = 100
      let nextHeight = Math.max(minHeight, height + deltaY)

      // Constrain height to viewport
      const viewportHeight = window.innerHeight
      const margin = 10
      const maxHeight = viewportHeight - startTop - margin
      nextHeight = Math.min(nextHeight, maxHeight)

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
        <div className="nodes-toolbar-body" style={{ minHeight: 0, maxHeight: '100%', overflow: 'hidden' }}>
          <section className="nodes-toolbar-section">
            <div className="toolbar-nav">
              {/* Line 1: map + verify + auto layout */}
              <div className="toolbar-nav-row">
                <Tooltip
                  title={
                    hasNodes
                      ? showMinimap
                        ? 'Hide minimap'
                        : 'Show minimap'
                      : 'No nodes to display'
                  }
                  arrow
                  placement="top"
                  disableInteractive
                >
                  <span style={{ flex: 1 }}>
                    <button
                      type="button"
                      className={`toolbar-nav-button ${showMinimap ? 'toolbar-lock-button--active' : ''}`}
                      onClick={onMinimapToggle}
                      disabled={!hasNodes}
                      style={{
                        opacity: hasNodes ? 1 : 0.5,
                        cursor: hasNodes ? 'pointer' : 'not-allowed',
                        width: '100%',
                      }}
                    >
                      <MapIcon fontSize="small" />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip
                  title={hasNodes ? 'Validate flow' : 'No nodes to validate'}
                  arrow
                  placement="top"
                  disableInteractive
                >
                  <span style={{ flex: 1 }}>
                    <button
                      type="button"
                      className="toolbar-nav-button"
                      onClick={onValidate}
                      disabled={!hasNodes}
                      style={{
                        opacity: hasNodes ? 1 : 0.5,
                        cursor: hasNodes ? 'pointer' : 'not-allowed',
                        width: '100%',
                      }}
                    >
                      <CheckCircleIcon fontSize="small" />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip
                  title={hasNodes ? 'Auto layout flow' : 'No nodes to layout'}
                  arrow
                  placement="top"
                  disableInteractive
                >
                  <span style={{ flex: 1 }}>
                    <button
                      type="button"
                      className="toolbar-nav-button"
                      onClick={onAutoLayout}
                      disabled={!hasNodes}
                      style={{
                        opacity: hasNodes ? 1 : 0.5,
                        cursor: hasNodes ? 'pointer' : 'not-allowed',
                        width: '100%',
                      }}
                    >
                      <AccountTreeIcon fontSize="small" />
                    </button>
                  </span>
                </Tooltip>
              </div>
              {/* Line 2: stickers, json editor, main config */}
              <div className="toolbar-nav-row toolbar-nav-row--secondary">
                <Tooltip title="Manage stickers" arrow placement="top" disableInteractive>
                  <span style={{ flex: 1 }}>
                    <button
                      type="button"
                      className="toolbar-nav-button"
                      onClick={onOpenStickerMenu}
                      style={{ width: '100%' }}
                    >
                      <LabelIcon fontSize="small" />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip title="Open JSON editor" arrow placement="top" disableInteractive>
                  <span style={{ flex: 1 }}>
                    <button
                      type="button"
                      className="toolbar-nav-button"
                      onClick={onOpenJsonEditor}
                      style={{ width: '100%' }}
                    >
                      <CodeIcon fontSize="small" />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip title="Flow configuration" arrow placement="top" disableInteractive>
                  <span style={{ flex: 1 }}>
                    <button
                      type="button"
                      className="toolbar-nav-button flow-config-button"
                      onClick={onOpenFlowConfigMenu}
                      style={{ width: '100%' }}
                    >
                      <SettingsIcon fontSize="small" />
                    </button>
                  </span>
                </Tooltip>
              </div>
              {/* Line 3: undo redo center */}
              <div className="toolbar-nav-row toolbar-nav-row--secondary">
                <Tooltip title={canUndo ? 'Undo' : 'Nothing to undo'} arrow placement="top" disableInteractive>
                  <span style={{ flex: 1 }}>
                    <button
                      type="button"
                      className="toolbar-nav-button"
                      onClick={onUndo}
                      disabled={!canUndo}
                      style={{
                        opacity: canUndo ? 1 : 0.5,
                        cursor: canUndo ? 'pointer' : 'not-allowed',
                        width: '100%',
                      }}
                    >
                      <UndoIcon fontSize="small" />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip title={hasNodes ? 'Center view' : 'No nodes to center'} arrow placement="top" disableInteractive>
                  <span style={{ flex: 1 }}>
                    <button
                      type="button"
                      className="toolbar-nav-button"
                      onClick={onFitView}
                      disabled={!hasNodes}
                      style={{
                        opacity: hasNodes ? 1 : 0.5,
                        cursor: hasNodes ? 'pointer' : 'not-allowed',
                        width: '100%',
                      }}
                    >
                      <CenterFocusStrongIcon fontSize="small" />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip title={canRedo ? 'Redo' : 'Nothing to redo'} arrow placement="top" disableInteractive>
                  <span style={{ flex: 1 }}>
                    <button
                      type="button"
                      className="toolbar-nav-button"
                      onClick={onRedo}
                      disabled={!canRedo}
                      style={{
                        opacity: canRedo ? 1 : 0.5,
                        cursor: canRedo ? 'pointer' : 'not-allowed',
                        width: '100%',
                      }}
                    >
                      <RedoIcon fontSize="small" />
                    </button>
                  </span>
                </Tooltip>
              </div>
            </div>
          </section>
          <section className="nodes-toolbar-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Search bar - in modules section, stays visible */}
            <div style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
              <input
                type="text"
                placeholder="Search modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onMouseDown={(e) => {
                  // Prevent text selection when clicking on empty input (placeholder text)
                  if (!searchQuery) {
                    e.preventDefault()
                    e.currentTarget.focus()
                  }
                }}
                onSelect={(e) => {
                  // Prevent selecting placeholder text when input is empty
                  if (!searchQuery) {
                    e.preventDefault()
                    e.currentTarget.setSelectionRange(0, 0)
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid rgba(148, 163, 184, 0.7)',
                  borderRadius: '4px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#e5e7eb',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            {/* NodeList - scrollable, no visible scrollbar */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, scrollbarWidth: 'none', msOverflowStyle: 'none' }} className="nodes-list-wrapper">
              <NodeList
                modules={filteredModules}
                onNodeDragStart={onNodeDragStart}
                onSidebarNodeClick={onSidebarNodeClick}
              />
            </div>
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
