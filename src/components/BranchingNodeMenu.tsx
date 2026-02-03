import { useEffect, useRef, useState } from 'react'
import { ReactFlowInstance, type Node } from 'reactflow'
import './NodePopupMenu.css'

interface BranchingNodeMenuProps {
  node: Node
  onClose: () => void
  reactFlowWrapper: React.RefObject<HTMLDivElement>
  reactFlowInstance: ReactFlowInstance | null
  onOutputCountChange: (nodeId: string, count: number) => void
}

export default function BranchingNodeMenu({ 
  node, 
  onClose, 
  reactFlowWrapper, 
  reactFlowInstance,
  onOutputCountChange 
}: BranchingNodeMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [outputCount, setOutputCount] = useState(node.data.outputCount || 1)

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

  const handleCountChange = (newCount: number) => {
    if (newCount < 1) return
    if (newCount > 10) return // Reasonable limit
    setOutputCount(newCount)
    onOutputCountChange(node.id, newCount)
  }

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
        <div style={{ padding: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'rgba(226, 232, 240, 0.9)', fontSize: '0.9rem' }}>
            Number of Outputs:
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleCountChange(outputCount - 1)}
              disabled={outputCount <= 1}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid rgba(148, 163, 184, 0.7)',
                borderRadius: '4px',
                background: outputCount <= 1 ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.9)',
                color: '#e5e7eb',
                cursor: outputCount <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              −
            </button>
            <input
              type="number"
              min="1"
              max="10"
              value={outputCount}
              onChange={(e) => handleCountChange(parseInt(e.target.value) || 1)}
              style={{
                width: '60px',
                padding: '0.25rem 0.5rem',
                border: '1px solid rgba(148, 163, 184, 0.7)',
                borderRadius: '4px',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#e5e7eb',
                textAlign: 'center',
              }}
            />
            <button
              type="button"
              onClick={() => handleCountChange(outputCount + 1)}
              disabled={outputCount >= 10}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid rgba(148, 163, 184, 0.7)',
                borderRadius: '4px',
                background: outputCount >= 10 ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.9)',
                color: '#e5e7eb',
                cursor: outputCount >= 10 ? 'not-allowed' : 'pointer',
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
