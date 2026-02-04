import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ReactFlowInstance, type Node } from 'reactflow'
import './NodePopupMenu.css'
import modules, { type Module } from '../modules'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES, nodeConfigs, canOutputNodeBeDeleted } from '../nodeConfigs'


// Import parseType from utils instead of duplicating
import { parseType, displayType } from '../utils/nodeUtils'

interface NodePopupMenuProps {
  node?: Node
  onClose: () => void
  reactFlowWrapper: React.RefObject<HTMLDivElement>
  reactFlowInstance: ReactFlowInstance | null
  onNodeDataUpdate?: (nodeId: string, updatedData: any) => void
  onAddOutput?: (nodeId: string) => void
  onDeleteNode?: (nodeId: string) => void
  initialPosition?: { x: number; y: number } | null
  onPositionChange?: (position: { x: number; y: number } | null) => void
  // Flow config mode
  isFlowConfig?: boolean
  flowMetadata?: {
    description: string
    userInitialTimeout: number
    voice: string
  }
  onFlowMetadataUpdate?: (metadata: { description: string; userInitialTimeout: number; voice: string }) => void
  toolbarRef?: React.RefObject<HTMLDivElement>
  title?: string
}

// Helper to get default value based on type
const getDefaultValue = (typeStr: string | undefined): any => {
  const { base, inner } = parseType(typeStr)
  if (base === 'number') return 0
  if (base === 'boolean') return false
  if (base === 'list') return []
  if (base === 'dict') return {}
  // For other types, use inner type if available (e.g., for list[string], inner is 'string')
  if (inner === 'number') return 0
  if (inner === 'boolean') return false
  return ''
}

// Helper to render input field based on param type
const renderParamInput = (
  paramType: string | undefined,
  value: any,
  onChange: (value: any) => void
) => {
  const { base } = parseType(paramType)

  switch (base) {
    case 'number':
    case 'int':
    case 'float':
      return (
        <input
          type="number"
          value={value ?? 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
          }}
        />
      )
    case 'boolean':
    case 'bool':
      return (
        <input
          type="checkbox"
          checked={value ?? false}
          onChange={(e) => onChange(e.target.checked)}
          style={{
            width: '1.2rem',
            height: '1.2rem',
            cursor: 'pointer',
          }}
        />
      )
    case 'list':
      return (
        <textarea
          value={Array.isArray(value) ? JSON.stringify(value, null, 2) : ''}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value)
              if (Array.isArray(parsed)) {
                onChange(parsed)
              }
            } catch {
              // Invalid JSON, ignore
            }
          }}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            minHeight: '80px',
            resize: 'vertical',
          }}
        />
      )
    case 'dict':
      return (
        <textarea
          value={typeof value === 'object' && value !== null && !Array.isArray(value) ? JSON.stringify(value, null, 2) : '{}'}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value)
              if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                onChange(parsed)
              }
            } catch {
              // Invalid JSON, ignore
            }
          }}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            minHeight: '80px',
            resize: 'vertical',
          }}
        />
      )
    case 'string':
    default:
      return (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
          }}
        />
      )
  }
}

const PLACEHOLDER_VOICES = ['Voice 1', 'Voice 2', 'Voice 3']

export default function NodePopupMenu({
  node,
  onClose,
  reactFlowWrapper,
  reactFlowInstance,
  onNodeDataUpdate,
  onAddOutput,
  onDeleteNode,
  initialPosition,
  onPositionChange,
  isFlowConfig = false,
  flowMetadata,
  onFlowMetadataUpdate,
  toolbarRef,
  title,
}: NodePopupMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(initialPosition || null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [menuSize, setMenuSize] = useState({ width: 280, height: 180 })
  const questionMarkRef = useRef<HTMLSpanElement>(null)
  const nodeType = node ? ((node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType) : undefined
  const module = node?.data?.moduleName ? modules.find((m: Module) => m.name === node.data.moduleName) : undefined

  // Track if user has manually positioned the menu
  const userPositionedRef = useRef(!!initialPosition)

  // Initialize params state from node data (only for node config)
  const [params, setParams] = useState<Record<string, any>>(node?.data?.params || {})

  // Initialize flow metadata state (only for flow config)
  const [metadata, setMetadata] = useState(flowMetadata || { description: '', userInitialTimeout: 0, voice: 'Voice 1' })

  useEffect(() => {
    if (isFlowConfig && flowMetadata) {
      setMetadata(flowMetadata)
    }
  }, [isFlowConfig, flowMetadata])

  useEffect(() => {
    // Update params when node data changes (only for node config)
    if (!isFlowConfig && node) {
      setParams(node.data?.params || {})
    }
  }, [node?.data.params, isFlowConfig])

  // Track if position update is needed (prevent updates during undo/redo)
  const shouldUpdatePositionRef = useRef(true)

  // Initialize position from initialPosition if provided
  useEffect(() => {
    if (initialPosition) {
      setPosition(initialPosition)
      userPositionedRef.current = true
    }
  }, [initialPosition])

  useEffect(() => {
    // If user has manually positioned, don't auto-update
    if (userPositionedRef.current || isDragging) return

    const updatePosition = () => {
      if (!shouldUpdatePositionRef.current || isDragging || userPositionedRef.current) return

      let newPosition: { x: number; y: number }

      if (isFlowConfig && toolbarRef?.current) {
        // Position next to toolbar for flow config
        const toolbarRect = toolbarRef.current.getBoundingClientRect()
        const spacing = 10

        newPosition = {
          x: toolbarRect.right + spacing,
          y: toolbarRect.top,
        }
      } else if (!isFlowConfig && node && reactFlowInstance && reactFlowWrapper.current) {
        // Position next to node for node config
        const nodePosition = node.position
        const style = node.style || {}
        const nodeWidth = typeof style.width === 'number' ? style.width : 150

        // Convert flow position to screen position
        const screenPos = reactFlowInstance.flowToScreenPosition({
          x: nodePosition.x + nodeWidth + 10,
          y: nodePosition.y,
        })

        // Get the wrapper's bounding rect to adjust for its position
        const wrapperRect = reactFlowWrapper.current.getBoundingClientRect()

        newPosition = {
          x: wrapperRect.left + screenPos.x,
          y: wrapperRect.top + screenPos.y,
        }
      } else {
        return
      }

      // Constrain menu to viewport bounds
      if (menuRef.current) {
        const menuRect = menuRef.current.getBoundingClientRect()
        const menuWidth = menuRect.width || 280
        const menuHeight = menuRect.height || 200

        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const margin = 10

        const minX = margin
        const minY = margin
        const maxX = viewportWidth - menuWidth - margin
        const maxY = viewportHeight - menuHeight - margin

        newPosition.x = Math.max(minX, Math.min(maxX, newPosition.x))
        newPosition.y = Math.max(minY, Math.min(maxY, newPosition.y))
      }

      setPosition(newPosition)
      if (onPositionChange) {
        onPositionChange(newPosition)
      }
    }

    // Calculate position immediately
    updatePosition()

    // Update position when viewport changes or node moves (only for node config)
    if (!isFlowConfig && node) {
      const interval = setInterval(updatePosition, 100)
      return () => clearInterval(interval)
    } else {
      // For flow config, update on window resize
      window.addEventListener('resize', updatePosition)
      return () => window.removeEventListener('resize', updatePosition)
    }
  }, [isFlowConfig, node?.id, node?.position, node?.style, reactFlowInstance, reactFlowWrapper, isDragging, onPositionChange, toolbarRef, menuSize])

  // Re-enable position updates after a short delay (allows undo/redo to complete)
  useEffect(() => {
    if (!isFlowConfig && node) {
      shouldUpdatePositionRef.current = true
    }
  }, [isFlowConfig, node?.id, node?.position])

  // Update tooltip position when question mark moves (e.g., menu is dragged)
  useEffect(() => {
    if (!showTooltip || !questionMarkRef.current || !node) return

    const updateTooltipPosition = () => {
      if (!questionMarkRef.current) return

      const rect = questionMarkRef.current.getBoundingClientRect()
      const tooltipWidth = 300
      const tooltipHeight = 100
      const margin = 10

      let finalX = rect.left + (rect.width / 2) - (tooltipWidth / 2)
      let finalY = rect.top - tooltipHeight - margin

      if (finalX < margin) {
        finalX = margin
      }
      if (finalX + tooltipWidth > window.innerWidth - margin) {
        finalX = window.innerWidth - tooltipWidth - margin
      }
      if (finalY < margin) {
        finalY = rect.bottom + margin
      }

      setTooltipPosition({ x: finalX, y: finalY })
    }

    updateTooltipPosition()
    const interval = setInterval(updateTooltipPosition, 100)
    return () => clearInterval(interval)
  }, [showTooltip, position])

  // Reset user positioning when node changes (but preserve if initialPosition provided)
  useEffect(() => {
    // Always reset when node changes, unless initialPosition is explicitly provided
    if (!initialPosition) {
      userPositionedRef.current = false
      // Force position recalculation
      shouldUpdatePositionRef.current = true
      // Reset position to null so it recalculates
      setPosition(null)
    } else {
      userPositionedRef.current = true
    }
  }, [node?.id, initialPosition, isFlowConfig])

  // Apply viewport constraints when menu is first opened or position changes
  useEffect(() => {
    if (!position || !menuRef.current) return

    const constrainToViewport = () => {
      if (!menuRef.current || !position) return

      const menuRect = menuRef.current.getBoundingClientRect()
      const menuWidth = menuRect.width || 280
      const menuHeight = menuRect.height || 150

      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const margin = 10

      const minX = margin
      const minY = margin
      const maxX = viewportWidth - menuWidth - margin
      const maxY = viewportHeight - menuHeight - margin

      let constrainedX = Math.max(minX, Math.min(maxX, position.x))
      let constrainedY = Math.max(minY, Math.min(maxY, position.y))

      if (constrainedX !== position.x || constrainedY !== position.y) {
        const newPosition = { x: constrainedX, y: constrainedY }
        setPosition(newPosition)
        if (onPositionChange) {
          onPositionChange(newPosition)
        }
      }
    }

    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(constrainToViewport)
  }, [position, onPositionChange])


  // Handle dragging
  useEffect(() => {
    if (!isDragging || !position) return

    // Disable position updates while dragging
    shouldUpdatePositionRef.current = false
    // Mark as user positioned when drag starts
    userPositionedRef.current = true

    const handleMouseMove = (e: MouseEvent) => {
      let newPosition = {
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      }

      // Constrain menu to viewport bounds while dragging
      if (menuRef.current) {
        const menuRect = menuRef.current.getBoundingClientRect()
        const menuWidth = menuRect.width || 280
        const menuHeight = menuRect.height || 200

        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const margin = 10

        const minX = margin
        const minY = margin
        const maxX = viewportWidth - menuWidth - margin
        const maxY = viewportHeight - menuHeight - margin

        newPosition.x = Math.max(minX, Math.min(maxX, newPosition.x))
        newPosition.y = Math.max(minY, Math.min(maxY, newPosition.y))
      }

      setPosition(newPosition)
      if (onPositionChange) {
        onPositionChange(newPosition)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // Re-enable position updates after a delay (but userPositionedRef stays true)
      setTimeout(() => {
        shouldUpdatePositionRef.current = true
      }, 100)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset, position, onPositionChange])

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (!position || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
    setIsDragging(true)
    userPositionedRef.current = true
    e.preventDefault()
  }

  const justOpenedRef = useRef(false)

  useEffect(() => {
    // Mark menu as just opened when it mounts
    justOpenedRef.current = true
    const timeout = setTimeout(() => {
      justOpenedRef.current = false
    }, 150) // Small delay to prevent immediate closing

    return () => clearTimeout(timeout)
  }, [node?.id])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const isMenuIcon = target.closest('.dynamic-node-label-menu-icon') !== null
      const isToolbar = target.closest('.nodes-toolbar') !== null
      const isToolbarButton = target.closest('.toolbar-nav-button') !== null
      const isFlowConfigButton = target.closest('.flow-config-button') !== null

      // Don't close if clicking on toolbar, toolbar buttons, or flow config button
      if (isToolbar || isToolbarButton || isFlowConfigButton) {
        return
      }

      // If clicking on a menu icon, don't interfere - let the menu icon's click handler fire
      // The menu icon handler will close this menu and open the new one
      if (isMenuIcon) {
        // Reset the justOpened flag so the new menu can open properly
        justOpenedRef.current = false
        // Don't close here - let the menu icon's click handler do it
        // This ensures the menu icon click handler fires and opens the new menu
        return
      }

      // Don't close if menu was just opened (and it's not a menu icon click)
      if (justOpenedRef.current) {
        return
      }

      if (menuRef.current && event.target && !menuRef.current.contains(event.target as HTMLElement)) {
        onClose()
      }
    }

    // Close on escape key
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    // Use a small delay to ensure menu is fully rendered before adding listener
    // This prevents the click that opens the menu from immediately closing it
    // Use click instead of mousedown to avoid conflicts with menu icon clicks
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true) // Use capture phase
    }, 50)

    document.addEventListener('keydown', handleEscape)

    return () => {
      clearTimeout(timeout)
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose, node?.id])

  const handleParamChange = (paramName: string, value: any) => {
    if (!node) return
    const updatedParams = { ...params, [paramName]: value }
    setParams(updatedParams)

    if (onNodeDataUpdate) {
      onNodeDataUpdate(node.id, { params: updatedParams })
    }
  }

  const handleOutputValueChange = (value: any) => {
    if (!node) return
    const updatedParams = { ...params, value }
    setParams(updatedParams)

    // For branching output, the value is also the label - always update it
    if (onNodeDataUpdate) {
      const updatedData: any = { params: updatedParams }
      // Always set label from value, even if empty (will fallback to "Output")
      updatedData.label = value !== null && value !== undefined && value !== '' ? String(value) : 'Output'
      onNodeDataUpdate(node.id, updatedData)
    }
  }

  // Don't render until position is calculated
  if (!position) {
    return null
  }

  // Handle menu resize
  const onMenuResizeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const startY = event.clientY
    const { height } = menuSize
    const startTop = position?.y || 0

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY
      let nextHeight = Math.max(200, height + deltaY)

      // Constrain height to viewport
      const viewportHeight = window.innerHeight
      const margin = 10
      const maxHeight = viewportHeight - startTop - margin
      nextHeight = Math.min(nextHeight, maxHeight)

      setMenuSize({ width: menuSize.width, height: nextHeight })
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
      ref={menuRef}
      className="node-popup-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${menuSize.width}px`,
        height: `${menuSize.height}px`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        ref={headerRef}
        className="node-popup-menu-header"
        onMouseDown={handleHeaderMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <span className="node-popup-menu-title" title={title || (() => {
          if (isFlowConfig) return 'Flow Configuration'
          // For output nodes, show the node's label instead of parent module name
          if (nodeType && isBranchingOutputNodeType(nodeType)) {
            return node?.data?.label || 'Output'
          }
          return module?.name || node?.data?.moduleName || nodeType || 'Node'
        })()}>
          {title || (() => {
            if (isFlowConfig) return 'Flow Configuration'
            // For output nodes, show the node's label instead of parent module name
            let displayName: string
            if (nodeType && isBranchingOutputNodeType(nodeType)) {
              displayName = node?.data?.label || 'Output'
            } else {
              displayName = module?.name || node?.data?.moduleName || nodeType || 'Node'
            }
            // Show up to 3 words fully, then truncate with ellipsis
            const words = displayName.split(' ')
            if (words.length <= 3) {
              return displayName
            }
            // Show first 3 words + ellipsis
            return words.slice(0, 3).join(' ') + '...'
          })()}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {module?.documentation && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <span
                ref={questionMarkRef}
                style={{
                  cursor: 'help',
                  fontSize: '0.875rem',
                  color: 'rgba(148, 163, 184, 0.8)',
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.25rem',
                  height: '1.25rem',
                  borderRadius: '50%',
                  border: '1px solid rgba(148, 163, 184, 0.5)',
                  backgroundColor: 'rgba(148, 163, 184, 0.1)',
                }}
                onMouseEnter={() => {
                  if (!questionMarkRef.current || !reactFlowWrapper.current) return

                  // Use same strategy as menu positioning - get bounding rect
                  const rect = questionMarkRef.current.getBoundingClientRect()

                  // Position tooltip above the question mark, centered
                  const tooltipWidth = 300
                  const tooltipHeight = 100 // approximate
                  const margin = 10

                  let finalX = rect.left + (rect.width / 2) - (tooltipWidth / 2)
                  let finalY = rect.top - tooltipHeight - margin

                  // Adjust if tooltip would go off left edge
                  if (finalX < margin) {
                    finalX = margin
                  }
                  // Adjust if tooltip would go off right edge
                  if (finalX + tooltipWidth > window.innerWidth - margin) {
                    finalX = window.innerWidth - tooltipWidth - margin
                  }
                  // Adjust if tooltip would go off top edge
                  if (finalY < margin) {
                    finalY = rect.bottom + margin
                  }

                  setTooltipPosition({ x: finalX, y: finalY })
                  setShowTooltip(true)
                }}
                onMouseLeave={() => {
                  setShowTooltip(false)
                }}
              >
                ?
              </span>
              {showTooltip && createPortal(
                <div
                  style={{
                    position: 'fixed',
                    left: `${tooltipPosition.x}px`,
                    top: `${tooltipPosition.y}px`,
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'rgba(15, 23, 42, 0.98)',
                    color: '#e5e7eb',
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    maxWidth: '300px',
                    width: 'max-content',
                    zIndex: 10001,
                    pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                  }}
                >
                  {module?.documentation}
                </div>,
                document.body
              )}
            </div>
          )}
          {!isFlowConfig && onDeleteNode && node && (() => {
            const nodeType = node.data?.nodeType as NodeType | undefined
            // Don't show delete button for output nodes that cannot be deleted (using config)
            if (nodeType && isBranchingOutputNodeType(nodeType)) {

              if (!canOutputNodeBeDeleted(nodeType)) {
                return null // Hide delete button for non-deletable output nodes
              }
            }

            return (
              <button
                type="button"
                className="node-popup-menu-delete"
                onClick={() => {
                  if (onDeleteNode && node) {
                    onDeleteNode(node.id)
                  }
                  onClose()
                }}
                title="Delete node"
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(239, 68, 68, 0.8)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  lineHeight: 1,
                  padding: '0.25rem 0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '0.375rem',
                  transition: 'background 0.2s ease',
                  minWidth: '24px',
                  height: '24px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                🗑️
              </button>
            )
          })()}
          <button
            type="button"
            className="node-popup-menu-close"
            onClick={onClose}
            title="Close"
            onMouseDown={(e) => e.stopPropagation()}
          >
            ×
          </button>
        </div>
      </div>
      <div className="node-popup-menu-content" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {/* Flow Config Menu */}
        {isFlowConfig && (
          <div style={{ padding: '1rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'rgba(226, 232, 240, 0.9)',
                fontSize: '0.875rem',
                fontWeight: 500
              }}>
                Description
              </label>
              <textarea
                value={metadata.description}
                onChange={(e) => {
                  const updated = { ...metadata, description: e.target.value }
                  setMetadata(updated)
                  if (onFlowMetadataUpdate) {
                    onFlowMetadataUpdate(updated)
                  }
                }}
                placeholder="Enter flow description..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid rgba(148, 163, 184, 0.7)',
                  borderRadius: '4px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#e5e7eb',
                  fontSize: '0.875rem',
                  minHeight: '60px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'rgba(226, 232, 240, 0.9)',
                fontSize: '0.875rem',
                fontWeight: 500
              }}>
                User Initial Timeout (ms)
              </label>
              <input
                type="number"
                value={metadata.userInitialTimeout}
                onChange={(e) => {
                  const updated = { ...metadata, userInitialTimeout: parseFloat(e.target.value) || 0 }
                  setMetadata(updated)
                  if (onFlowMetadataUpdate) {
                    onFlowMetadataUpdate(updated)
                  }
                }}
                min="0"
                step="100"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid rgba(148, 163, 184, 0.7)',
                  borderRadius: '4px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#e5e7eb',
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'rgba(226, 232, 240, 0.9)',
                fontSize: '0.875rem',
                fontWeight: 500
              }}>
                Voice
              </label>
              <select
                value={metadata.voice}
                onChange={(e) => {
                  const updated = { ...metadata, voice: e.target.value }
                  setMetadata(updated)
                  if (onFlowMetadataUpdate) {
                    onFlowMetadataUpdate(updated)
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid rgba(148, 163, 184, 0.7)',
                  borderRadius: '4px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#e5e7eb',
                }}
              >
                {PLACEHOLDER_VOICES.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Single Node Menu - Show all params */}
        {!isFlowConfig && nodeType && !isBranchingNodeType(nodeType) && !isBranchingOutputNodeType(nodeType) && module && (
          <div style={{ padding: '1rem' }}>
            {module.params.map((param) => {
              const defaultValue = getDefaultValue(param.type)
              // Default to obligatory if not specified (backwards compatibility)
              const isObligatory = param.obligatory !== false
              const currentValue = params[param.name] ?? defaultValue
              const isEmpty = currentValue === null || currentValue === undefined || currentValue === '' ||
                (Array.isArray(currentValue) && currentValue.length === 0) ||
                (typeof currentValue === 'object' && !Array.isArray(currentValue) && Object.keys(currentValue).length === 0)
              const hasError = isObligatory && isEmpty

              return (
                <div key={param.name} style={{ marginBottom: '0.75rem' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    color: hasError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(226, 232, 240, 0.9)',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}>
                    {param.name}
                    {isObligatory && <span style={{ color: 'rgba(239, 68, 68, 0.8)', marginLeft: '0.25rem' }}>*</span>}
                    {param.type ? ` (${displayType(param.type)})` : ''}
                  </label>
                  {renderParamInput(
                    param.type,
                    params[param.name] ?? defaultValue,
                    (value) => handleParamChange(param.name, value)
                  )}
                </div>
              )
            })}
            {module.params.length === 0 && (
              <p style={{ padding: '0.5rem', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.875rem' }}>
                No parameters configured
              </p>
            )}
          </div>
        )}

        {/* Branching Node Menu - Show params only (output count determined by config) */}
        {!isFlowConfig && nodeType && isBranchingNodeType(nodeType) && module && (
          <div style={{ padding: '1rem' }}>
            {/* Show module params - hide listParam if it's used for outputs */}
            {module.params.map((param) => {
              // Skip listParam if it's used for outputs
              if (module.outputConfig?.type === 'listParam' &&
                module.outputConfig.listParamName === param.name) {
                return null
              }

              const defaultValue = getDefaultValue(param.type)
              // Default to obligatory if not specified (backwards compatibility)
              const isObligatory = param.obligatory !== false
              const currentValue = params[param.name] ?? defaultValue
              const isEmpty = currentValue === null || currentValue === undefined || currentValue === '' ||
                (Array.isArray(currentValue) && currentValue.length === 0) ||
                (typeof currentValue === 'object' && !Array.isArray(currentValue) && Object.keys(currentValue).length === 0)
              const hasError = isObligatory && isEmpty

              return (
                <div key={param.name} style={{ marginBottom: '0.75rem' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    color: hasError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(226, 232, 240, 0.9)',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}>
                    {param.name}
                    {isObligatory && <span style={{ color: 'rgba(239, 68, 68, 0.8)', marginLeft: '0.25rem' }}>*</span>}
                    {param.type ? ` (${displayType(param.type)})` : ''}
                  </label>
                  {renderParamInput(
                    param.type,
                    params[param.name] ?? defaultValue,
                    (value) => handleParamChange(param.name, value)
                  )}
                </div>
              )
            })}

            {/* Add output button for listParam type */}
            {module.outputConfig?.type === 'listParam' && onAddOutput && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
                <button
                  type="button"
                  onClick={() => node && onAddOutput && onAddOutput(node.id)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid rgba(148, 163, 184, 0.7)',
                    borderRadius: '4px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    color: '#e5e7eb',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(30, 64, 175, 0.3)'
                    e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.6)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(15, 23, 42, 0.9)'
                    e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.7)'
                  }}
                >
                  <span>+</span>
                  <span>Add Output</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Branching Output Node Menu - only show for listParam type, not internal */}
        {!isFlowConfig && nodeType && isBranchingOutputNodeType(nodeType) && node && module && module.outputConfig && module.outputConfig.type === 'listParam' && (() => {
          // Use node config to check if autogenerated instead of hardcoding
          const nodeConfig = nodeConfigs[nodeType]
          const isAutogenerated = nodeConfig?.isModuleType === false
          return !isAutogenerated || !node.data?.isInternalOutput
        })() && (
            <div style={{ padding: '0.75rem' }}>
              {(() => {
                const listParamName = module.outputConfig.type === 'listParam' ? module.outputConfig.listParamName : undefined
                const listParam = listParamName ? module.params.find(p => p.name === listParamName) : undefined
                if (listParam) {
                  // Output node value is always obligatory when linked to param
                  const isObligatory = true
                  const currentValue = params.value ?? ''
                  const isEmpty = currentValue === null || currentValue === undefined || currentValue === ''
                  const hasError = isObligatory && isEmpty

                  return (
                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.375rem',
                        color: hasError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(226, 232, 240, 0.9)',
                        fontSize: '0.875rem',
                        fontWeight: 500
                      }}>
                        Value
                        <span style={{ color: 'rgba(239, 68, 68, 0.8)', marginLeft: '0.25rem' }}>*</span>
                        {(() => {
                          // For output nodes, show only the element type, not "list[...]"
                          const { inner } = parseType(listParam.type)
                          const elementType = inner || 'str' // Show element type, fallback to str
                          return elementType ? ` (${displayType(elementType)})` : ''
                        })()}
                      </label>
                      {(() => {
                        // Use the element type for the input
                        const { inner } = parseType(listParam.type)
                        const inputType = inner || 'str'
                        return renderParamInput(inputType, params.value ?? '', handleOutputValueChange)
                      })()}
                    </div>
                  )
                }
                return null
              })()}
            </div>
          )}

        {/* Fallback for nodes without module */}
        {!module && (
          <p style={{ padding: '0.75rem', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.875rem' }}>
            No module configuration found
          </p>
        )}
      </div>
      <div
        className="node-popup-menu-resize-handle"
        onMouseDown={onMenuResizeMouseDown}
      />
    </div>
  )
}
