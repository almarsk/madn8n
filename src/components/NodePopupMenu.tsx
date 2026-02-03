import { useEffect, useRef, useState } from 'react'
import { ReactFlowInstance, type Node } from 'reactflow'
import './NodePopupMenu.css'

interface NodePopupMenuProps {
  node: Node
  onClose: () => void
  reactFlowWrapper: React.RefObject<HTMLDivElement>
  reactFlowInstance: ReactFlowInstance | null
}

export default function NodePopupMenu({ node, onClose, reactFlowWrapper, reactFlowInstance }: NodePopupMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!reactFlowInstance || !reactFlowWrapper.current) return

    const updatePosition = () => {
      if (!reactFlowInstance || !reactFlowWrapper.current) return
      
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
      
      setPosition({
        x: wrapperRect.left + screenPos.x,
        y: wrapperRect.top + screenPos.y,
      })
    }

    updatePosition()
    
    // Update position when viewport changes or node moves
    const interval = setInterval(updatePosition, 100)

    return () => clearInterval(interval)
  }, [node.id, node.position, node.style, reactFlowInstance, reactFlowWrapper])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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

    // Use a small delay to prevent immediate closing when opening
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    document.addEventListener('keydown', handleEscape)

    return () => {
      clearTimeout(timeout)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="node-popup-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="node-popup-menu-header">
        <span className="node-popup-menu-title">{node.data.label}</span>
        <button
          type="button"
          className="node-popup-menu-close"
          onClick={onClose}
          title="Close"
        >
          ×
        </button>
      </div>
      <div className="node-popup-menu-content">
        <p style={{ padding: '1rem', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.9rem' }}>
          {node.type === 'branchingOutput' ? 'Output node menu - placeholder' : 'Menu content will be added here'}
        </p>
      </div>
    </div>
  )
}
