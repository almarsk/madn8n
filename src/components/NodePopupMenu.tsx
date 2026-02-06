import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ReactFlowInstance, type Node } from 'reactflow'
import './NodePopupMenu.css'
import modules, { type Module } from '../modules'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES, canOutputNodeBeDeleted } from '../nodeConfigs'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CloseIcon from '@mui/icons-material/Close'
import Tooltip from '@mui/material/Tooltip'


// Import body components
import FlowConfigBody from './NodePopupMenu/FlowConfigBody'
import StickerMenuBody from './NodePopupMenu/StickerMenuBody'
import NodeParamsBody from './NodePopupMenu/NodeParamsBody'
import BranchingNodeBody from './NodePopupMenu/BranchingNodeBody'
import BranchingOutputBody from './NodePopupMenu/BranchingOutputBody'

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
  // Sticker menu mode (shows only sticker management)
  isStickerMenu?: boolean
  flowMetadata?: {
    description: string
    language: string
    mchannels_bot_id: string
    name: string
    omnichannel_config?: Record<string, any>
    stickers?: Record<string, any>
  }
  // For sticker nodes, we need access to flowMetadata to show sticker dropdown
  stickers?: Record<string, any>
  // Allow node menu to open the global sticker management menu
  onOpenStickerMenu?: () => void
  onFlowMetadataUpdate?: (metadata: {
    description: string
    language: string
    mchannels_bot_id: string
    name: string
    omnichannel_config?: Record<string, any>
    stickers?: Record<string, any>
  }) => void
  toolbarRef?: React.RefObject<HTMLDivElement>
  title?: string
  toolbarMenuSize?: { width: number; height: number }
  onToolbarMenuSizeChange?: (size: { width: number; height: number }) => void
}

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
  isStickerMenu = false,
  flowMetadata,
  onOpenStickerMenu,
  onFlowMetadataUpdate,
  toolbarRef,
  title,
  stickers,
  toolbarMenuSize,
  onToolbarMenuSizeChange,
}: NodePopupMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(initialPosition || null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  // Default menu height: 2/3 of toolbar height for toolbar menus (flow config, sticker menu), otherwise 180
  const getDefaultMenuHeight = useCallback(() => {
    if ((isFlowConfig || isStickerMenu) && toolbarRef?.current) {
      const toolbarHeight = toolbarRef.current.getBoundingClientRect().height
      return Math.round(toolbarHeight * (2 / 3))
    }
    return 180
  }, [isFlowConfig, isStickerMenu, toolbarRef])

  // For toolbar menus, use persisted size; otherwise use default
  const getInitialMenuSize = useCallback(() => {
    if ((isFlowConfig || isStickerMenu) && toolbarMenuSize) {
      return toolbarMenuSize
    }
    return { width: 360, height: getDefaultMenuHeight() }
  }, [isFlowConfig, isStickerMenu, toolbarMenuSize, getDefaultMenuHeight])

  const [menuSize, setMenuSize] = useState(getInitialMenuSize)

  // Update menu size when toolbar menu size changes (for toolbar menus)
  useEffect(() => {
    if ((isFlowConfig || isStickerMenu) && toolbarMenuSize) {
      setMenuSize(toolbarMenuSize)
    }
  }, [isFlowConfig, isStickerMenu, toolbarMenuSize])
  const questionMarkRef = useRef<HTMLButtonElement | null>(null)
  const nodeType = node ? ((node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType) : undefined
  const module = node?.data?.moduleName ? modules.find((m: Module) => m.name === node.data.moduleName) : undefined

  // Track if user has manually positioned the menu
  const userPositionedRef = useRef(!!initialPosition)
  // Track if user has manually resized toolbar menus
  const hasManualHeightRef = useRef(false)

  // Initialize params state from node data (only for node config)
  const [params, setParams] = useState<Record<string, any>>(node?.data?.params || {})

  // Initialize flow metadata state (only for flow config)
  const [metadata, setMetadata] = useState(
    flowMetadata || {
      description: '',
      language: '',
      mchannels_bot_id: '',
      name: '',
      omnichannel_config: {},
      stickers: {},
    }
  )

  useEffect(() => {
    if (isFlowConfig && flowMetadata) {
      setMetadata(flowMetadata)
    }
  }, [isFlowConfig, flowMetadata])

  // Focus helper: first real input in the menu (skip buttons and checkboxes)
  const focusFirstField = () => {
    if (!menuRef.current) return
    const focusable = menuRef.current.querySelectorAll<HTMLElement>(
      'input:not([type="checkbox"]):not([type="radio"]), textarea, select'
    )
    if (focusable.length > 0) {
      focusable[0].focus()
    }
  }

  // When the menu becomes visible (position is set) or node changes, focus the first field
  useEffect(() => {
    if (!position) return
    // Defer to next frame so DOM/content are fully rendered
    const id = requestAnimationFrame(focusFirstField)
    return () => cancelAnimationFrame(id)
  }, [position, node?.id, isFlowConfig])

  useEffect(() => {
    // Update params when node data changes (only for node config)
    if (!isFlowConfig && node) {
      const nodeParams = node.data?.params || {}
      // Only update if the params actually changed (deep comparison via JSON)
      // This prevents unnecessary updates and ensures dropdown stays in sync
      const prevParamsStr = JSON.stringify(params)
      const nodeParamsStr = JSON.stringify(nodeParams)
      if (prevParamsStr !== nodeParamsStr) {
        setParams(nodeParams)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, node?.data?.params, isFlowConfig])

  // Track if position update is needed (prevent updates during undo/redo)
  const shouldUpdatePositionRef = useRef(true)
  // Track when the user is actively resizing so we don't auto-close on outside click
  const isResizingRef = useRef(false)
  // Track a short grace period right after resizing ends to avoid accidental close
  const resizeJustEndedRef = useRef(false)

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
        const nodeWidth = typeof style.width === 'number' ? style.width : 180

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

      // Constrain menu to viewport bounds BEFORE setting position
      // Try to open as big as possible, but reduce size if needed to fit
      const margin = 10
      const horizontalMargin = isFlowConfig ? 0 : margin
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      // Calculate maximum available size
      const maxAvailableWidth = viewportWidth - newPosition.x - horizontalMargin - margin
      const maxAvailableHeight = viewportHeight - newPosition.y - margin - margin

      // Try to use desired size, but reduce if needed (down to minimum)
      const minWidth = 280
      const minHeight = 100
      const desiredWidth = menuSize.width || 360
      const desiredHeight = menuSize.height || 180

      // Adjust size to fit viewport, but don't go below minimum
      const adjustedWidth = Math.max(minWidth, Math.min(desiredWidth, maxAvailableWidth))
      const adjustedHeight = Math.max(minHeight, Math.min(desiredHeight, maxAvailableHeight))

      // Update menu size if it needs to be adjusted
      if (adjustedWidth !== menuSize.width || adjustedHeight !== menuSize.height) {
        setMenuSize({ width: adjustedWidth, height: adjustedHeight })
      }

      const menuWidth = adjustedWidth
      const menuHeight = adjustedHeight

      const minX = horizontalMargin
      const minY = margin
      const maxX = viewportWidth - menuWidth - horizontalMargin
      const maxY = viewportHeight - menuHeight - margin

      newPosition.x = Math.max(minX, Math.min(maxX, newPosition.x))
      newPosition.y = Math.max(minY, Math.min(maxY, newPosition.y))

      setPosition(newPosition)
      if (onPositionChange) {
        onPositionChange(newPosition)
      }
    }

    // Calculate position immediately - use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      updatePosition()
    })

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

      const tooltipElement = document.querySelector('[data-tooltip-doc]') as HTMLElement
      if (!tooltipElement) return

      const iconRect = questionMarkRef.current.getBoundingClientRect()
      const tooltipRect = tooltipElement.getBoundingClientRect()
      const tooltipWidth = tooltipRect.width || 300
      const margin = 8

      // Center tooltip horizontally relative to icon
      let finalX = iconRect.left + (iconRect.width / 2) - (tooltipWidth / 2)

      // Position tooltip so its bottom edge is just above the icon with a bit more space
      let finalY = iconRect.top - tooltipRect.height - margin

      // Adjust if tooltip would go off left edge
      if (finalX < margin) {
        finalX = margin
      }
      // Adjust if tooltip would go off right edge
      if (finalX + tooltipWidth > window.innerWidth - margin) {
        finalX = window.innerWidth - tooltipWidth - margin
      }
      // If tooltip would go off top, show below icon instead
      if (finalY < margin) {
        finalY = iconRect.bottom + margin
      }

      setTooltipPosition({ x: finalX, y: finalY })
    }

    // Use requestAnimationFrame to ensure tooltip is rendered before calculating position
    let interval: number | null = null
    requestAnimationFrame(() => {
      updateTooltipPosition()
      interval = setInterval(updateTooltipPosition, 100)
    })

    return () => {
      if (interval !== null) clearInterval(interval)
    }
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

      const constrainedX = Math.max(minX, Math.min(maxX, position.x))
      const constrainedY = Math.max(minY, Math.min(maxY, position.y))

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
      const newPosition = {
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
      // Don't close while actively resizing the menu
      if (isResizingRef.current || resizeJustEndedRef.current) {
        return
      }

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

    // Close on escape key or backspace key (when menu is focused)
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'Backspace') {
        const activeElement = document.activeElement
        if (menuRef.current && activeElement && menuRef.current.contains(activeElement)) {
          // Focus is inside the menu: only close if not actively editing non-empty input
          const isInput = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA'
          if (!isInput || (isInput && (activeElement as HTMLInputElement | HTMLTextAreaElement).value === '')) {
            event.preventDefault()
            onClose()
          }
        } else if (menuRef.current) {
          // Focus is outside the menu (e.g. canvas): treat Backspace as a close shortcut
          event.preventDefault()
          onClose()
        }
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

  // Handle menu resize (horizontal + vertical from bottom-right corner)
  const onMenuResizeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startY = event.clientY
    const { width, height } = menuSize
    const startTop = position?.y || 0

    isResizingRef.current = true

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      // Minimums: keep height reasonable and width not too small
      const minHeight = 100 // header + some content
      const minWidth = 280  // slightly narrower than default width

      let nextHeight = Math.max(minHeight, height + deltaY)
      let nextWidth = Math.max(minWidth, width + deltaX)

      // Constrain size to viewport (don't allow going outside)
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const margin = 10
      // For flow config, allow width to go fully to the right edge (no horizontal margin)
      const horizontalMargin = isFlowConfig ? 0 : margin

      const maxHeight = viewportHeight - startTop - margin
      const maxWidth = viewportWidth - (position?.x || 0) - horizontalMargin

      nextHeight = Math.min(nextHeight, maxHeight)
      nextWidth = Math.min(nextWidth, maxWidth)

      const newSize = { width: nextWidth, height: nextHeight }
      setMenuSize(newSize)
      // Update shared toolbar menu size state for toolbar menus
      if ((isFlowConfig || isStickerMenu) && onToolbarMenuSizeChange) {
        onToolbarMenuSizeChange(newSize)
      }
    }

    const handleMouseUp = () => {
      // Mark resize as just ended so the next outside click doesn't immediately close the menu
      isResizingRef.current = false
      resizeJustEndedRef.current = true
      // Mark that user has manually set the height (for toolbar menus)
      if (isFlowConfig || isStickerMenu) {
        hasManualHeightRef.current = true
      }
      setTimeout(() => {
        resizeJustEndedRef.current = false
      }, 150)
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
          {module?.documentation && !isFlowConfig && nodeType && !isBranchingOutputNodeType(nodeType) && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                ref={questionMarkRef}
                type="button"
                className="node-popup-menu-icon-button"
                style={{ cursor: 'help' }}
                onMouseEnter={() => {
                  if (!questionMarkRef.current || !reactFlowWrapper.current) return

                  // Calculate position after tooltip is shown, using requestAnimationFrame to avoid jump
                  setShowTooltip(true)

                  // Use requestAnimationFrame to wait for tooltip to render, then position correctly
                  requestAnimationFrame(() => {
                    const tooltipElement = document.querySelector('[data-tooltip-doc]') as HTMLElement
                    if (!tooltipElement || !questionMarkRef.current) return

                    const iconRect = questionMarkRef.current.getBoundingClientRect()
                    const tooltipRect = tooltipElement.getBoundingClientRect()
                    const tooltipWidth = tooltipRect.width || 300
                    const margin = 8 // Small gap between icon and tooltip

                    // Center tooltip horizontally relative to icon
                    let finalX = iconRect.left + (iconRect.width / 2) - (tooltipWidth / 2)

                    // Position tooltip so its bottom edge is just above the icon with a bit more space
                    let finalY = iconRect.top - tooltipRect.height - margin

                    // Adjust if tooltip would go off left edge
                    if (finalX < margin) {
                      finalX = margin
                    }
                    // Adjust if tooltip would go off right edge
                    if (finalX + tooltipWidth > window.innerWidth - margin) {
                      finalX = window.innerWidth - tooltipWidth - margin
                    }
                    // If tooltip would go off top, show below icon instead
                    if (finalY < margin) {
                      finalY = iconRect.bottom + margin
                    }

                    setTooltipPosition({ x: finalX, y: finalY })
                  })
                }}
                onMouseLeave={() => {
                  setShowTooltip(false)
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <InfoOutlinedIcon fontSize="small" />
              </button>
              {showTooltip &&
                createPortal(
                  <div
                    data-tooltip-doc
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
              <Tooltip title="Delete node" arrow placement="top" disableInteractive>
                <button
                  type="button"
                  className="node-popup-menu-icon-button node-popup-menu-delete"
                  onClick={() => {
                    if (onDeleteNode && node) {
                      onDeleteNode(node.id)
                    }
                    onClose()
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </button>
              </Tooltip>
            )
          })()}
          <Tooltip title="Close" arrow placement="top" disableInteractive>
            <button
              type="button"
              className="node-popup-menu-icon-button node-popup-menu-close"
              onClick={onClose}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <CloseIcon fontSize="small" />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="node-popup-menu-content" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {/* Sticker Management Menu */}
        {isStickerMenu && (
          <StickerMenuBody metadata={metadata} setMetadata={setMetadata} onFlowMetadataUpdate={onFlowMetadataUpdate} />
        )}

        {/* Flow Config Menu */}
        {isFlowConfig && !isStickerMenu && (
          <FlowConfigBody metadata={metadata} setMetadata={setMetadata} onFlowMetadataUpdate={onFlowMetadataUpdate} />
        )}

        {/* Single Node Menu - Show all params (with special handling for sticker params) */}
        {!isFlowConfig && nodeType && !isBranchingNodeType(nodeType) && !isBranchingOutputNodeType(nodeType) && module && (
          <NodeParamsBody
            module={module}
            params={params}
            handleParamChange={handleParamChange}
            stickers={stickers}
            flowMetadata={flowMetadata}
            metadata={metadata}
            onOpenStickerMenu={onOpenStickerMenu}
          />
        )}

        {/* Branching Node Menu - Show params only (output count determined by config) */}
        {!isFlowConfig && nodeType && isBranchingNodeType(nodeType) && module && node && (
          <BranchingNodeBody
            node={node}
            module={module}
            params={params}
            handleParamChange={handleParamChange}
            onAddOutput={onAddOutput}
          />
        )}

        {/* Branching Output Node Menu - only show for listParam type, not internal */}
        {!isFlowConfig && nodeType && isBranchingOutputNodeType(nodeType) && node && module && module.outputConfig && module.outputConfig.type === 'listParam' && (
          <BranchingOutputBody
            node={node}
            module={module}
            params={params}
            handleOutputValueChange={handleOutputValueChange}
          />
        )}

        {/* Fallback for nodes without module (only for node config, not flow config) */}
        {!isFlowConfig && !module && (
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
