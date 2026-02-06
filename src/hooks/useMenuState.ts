import { useState, useCallback } from 'react'
import { isStartNode } from '../utils/moduleHelpers'

export interface MenuState {
  openMenuNodeId: string | null
  menuPosition: { x: number; y: number } | null
  toolbarMenuOpen: 'stickers' | 'mainConfig' | null
  toolbarMenuPosition: { x: number; y: number } | null
  toolbarMenuSize: { width: number; height: number }
}

export interface MenuActions {
  setOpenMenuNodeId: (id: string | null) => void
  setMenuPosition: (position: { x: number; y: number } | null) => void
  setToolbarMenuOpen: (menu: 'stickers' | 'mainConfig' | null) => void
  setToolbarMenuPosition: (position: { x: number; y: number } | null) => void
  setToolbarMenuSize: (size: { width: number; height: number }) => void
  handleLabelClick: (nodeId: string) => void
  handleCloseMenu: () => void
  handleOpenFlowConfigMenu: () => void
  handleCloseFlowConfigMenu: () => void
  handleOpenStickerMenu: () => void
  handleCloseStickerMenu: () => void
  handleMenuPositionChange: (position: { x: number; y: number } | null) => void
  handlePaneClick: (event: React.MouseEvent) => void
  handleSelectionStart: (event: React.MouseEvent) => void
}

export function useMenuState(
  nodes: any[],
  setNodes: (updater: (nodes: any[]) => any[]) => void
): MenuState & MenuActions {
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState<'stickers' | 'mainConfig' | null>(null)
  const [toolbarMenuPosition, setToolbarMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [toolbarMenuSize, setToolbarMenuSize] = useState<{ width: number; height: number }>({ width: 360, height: 180 })

  const handleLabelClick = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return

    // Prevent menu opening for start node
    if (isStartNode(node)) {
      return
    }

    // Close all other menus first (toolbar menus and other node menus)
    setToolbarMenuOpen(null)
    setToolbarMenuPosition(null)
    if (openMenuNodeId && openMenuNodeId !== nodeId) {
      setOpenMenuNodeId(null)
      setMenuPosition(null)
    }

    // Deselect all nodes when opening menu - only the menu should be "selected" (focused)
    setNodes((nds) => {
      return nds.map((n) => ({
        ...n,
        selected: false,
      }))
    })

    // Open menu immediately - no delay needed since we closed all other menus
    setOpenMenuNodeId(nodeId)
    setMenuPosition(null) // Reset position so menu opens at logical place next to node
  }, [nodes, setNodes, openMenuNodeId])

  const handleCloseMenu = useCallback(() => {
    setOpenMenuNodeId(null)
    setMenuPosition(null)
  }, [])

  const handleOpenFlowConfigMenu = useCallback(() => {
    // Toggle flow config menu: if already open, close it; otherwise open it
    if (toolbarMenuOpen === 'mainConfig') {
      setToolbarMenuOpen(null)
      setToolbarMenuPosition(null)
    } else {
      // Close all other menus first
      setOpenMenuNodeId(null)
      setMenuPosition(null)

      // Open flow config menu immediately
      setToolbarMenuOpen('mainConfig')
      setToolbarMenuPosition(null) // Will be auto-positioned next to toolbar
    }
  }, [toolbarMenuOpen])

  const handleCloseFlowConfigMenu = useCallback(() => {
    if (toolbarMenuOpen === 'mainConfig') {
      setToolbarMenuOpen(null)
      setToolbarMenuPosition(null)
    }
  }, [toolbarMenuOpen])

  const handleOpenStickerMenu = useCallback(() => {
    // Toggle sticker menu: if already open, close it; otherwise open it
    if (toolbarMenuOpen === 'stickers') {
      setToolbarMenuOpen(null)
      setToolbarMenuPosition(null)
    } else {
      // Close all other menus first
      setOpenMenuNodeId(null)
      setMenuPosition(null)

      // Open sticker menu immediately
      setToolbarMenuOpen('stickers')
      setToolbarMenuPosition(null) // Will be auto-positioned next to toolbar
    }
  }, [toolbarMenuOpen])

  const handleCloseStickerMenu = useCallback(() => {
    if (toolbarMenuOpen === 'stickers') {
      setToolbarMenuOpen(null)
      setToolbarMenuPosition(null)
    }
  }, [toolbarMenuOpen])

  const handleMenuPositionChange = useCallback((position: { x: number; y: number } | null) => {
    setMenuPosition(position)
  }, [])

  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    // Check if click is on toolbar buttons - don't close menu in that case
    const target = event.target as HTMLElement
    const isToolbarButton = target.closest('.toolbar-nav-button') !== null
    const isToolbar = target.closest('.nodes-toolbar') !== null

    // Only close menu if clicking on canvas, not on toolbar
    if (!isToolbarButton && !isToolbar) {
      setOpenMenuNodeId(null)
      setMenuPosition(null)
      // Also close toolbar menus
      setToolbarMenuOpen(null)
      setToolbarMenuPosition(null)
    }
  }, [])

  const handleSelectionStart = useCallback((_event: React.MouseEvent) => {
    // Close menus when starting to select (shift+drag or box selection)
    setOpenMenuNodeId(null)
    setMenuPosition(null)
    setToolbarMenuOpen(null)
    setToolbarMenuPosition(null)
  }, [])

  return {
    openMenuNodeId,
    menuPosition,
    toolbarMenuOpen,
    toolbarMenuPosition,
    toolbarMenuSize,
    setOpenMenuNodeId,
    setMenuPosition,
    setToolbarMenuOpen,
    setToolbarMenuPosition,
    setToolbarMenuSize,
    handleLabelClick,
    handleCloseMenu,
    handleOpenFlowConfigMenu,
    handleCloseFlowConfigMenu,
    handleOpenStickerMenu,
    handleCloseStickerMenu,
    handleMenuPositionChange,
    handlePaneClick,
    handleSelectionStart,
  }
}
