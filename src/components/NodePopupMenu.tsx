import { useEffect, useRef, useState } from 'react'
import { ReactFlowInstance, type Node } from 'reactflow'
import './NodePopupMenu.css'
import modules, { type Module } from '../modules'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES } from '../nodeConfigs'

interface NodePopupMenuProps {
  node: Node
  onClose: () => void
  reactFlowWrapper: React.RefObject<HTMLDivElement>
  reactFlowInstance: ReactFlowInstance | null
  onOutputCountChange?: (nodeId: string, count: number) => void
}

export default function NodePopupMenu({ node, onClose, reactFlowWrapper, reactFlowInstance, onOutputCountChange }: NodePopupMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const nodeType = (node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType
  const module = modules.find((m: Module) => m.type === nodeType)
  const outputCountConfig = module?.outputCountConfig || { min: 1, max: 10 }
  const [outputCount, setOutputCount] = useState(node.data.outputCount || 1)

  useEffect(() => {
    console.log('node.data', node.data)
    if (isBranchingNodeType(nodeType)) {
      setOutputCount(node.data.outputCount || 2)
    }
  }, [node.data.outputCount, nodeType])

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

    // Calculate position immediately
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

  // Don't render until position is calculated
  if (!position) {
    return null
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
        {isBranchingNodeType(nodeType) && onOutputCountChange ? (() => {
          const handleCountChange = (newCount: number) => {
            if (newCount < outputCountConfig.min) return
            if (outputCountConfig.max && newCount > outputCountConfig.max) return
            setOutputCount(newCount)
            onOutputCountChange(node.id, newCount)
          }

          return (
            <div style={{ padding: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'rgba(226, 232, 240, 0.9)', fontSize: '0.9rem' }}>
                Number of Outputs:
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleCountChange(outputCount - 1)}
                  disabled={outputCount <= outputCountConfig.min}
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: '1px solid rgba(148, 163, 184, 0.7)',
                    borderRadius: '4px',
                    background: outputCount <= outputCountConfig.min ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.9)',
                    color: '#e5e7eb',
                    cursor: outputCount <= outputCountConfig.min ? 'not-allowed' : 'pointer',
                  }}
                >
                  −
                </button>
                <input
                  type="number"
                  min={outputCountConfig.min}
                  max={outputCountConfig.max}
                  value={outputCount}
                  onChange={(e) => handleCountChange(parseInt(e.target.value) || outputCountConfig.min)}
                  style={{
                    width: '60px',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid rgba(148, 163, 184, 0.7)',
                    borderRadius: '4px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    color: '#e5e7eb',
                    textAlign: 'center',
                  }}
                  className="number-input-no-arrows"
                />
                <button
                  type="button"
                  onClick={() => handleCountChange(outputCount + 1)}
                  disabled={outputCountConfig.max ? outputCount >= outputCountConfig.max : false}
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: '1px solid rgba(148, 163, 184, 0.7)',
                    borderRadius: '4px',
                    background: outputCountConfig.max && outputCount >= outputCountConfig.max ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.9)',
                    color: '#e5e7eb',
                    cursor: outputCountConfig.max ? outputCount >= outputCountConfig.max ? 'not-allowed' : 'pointer' : 'pointer',
                  }}
                >
                  +
                </button>
              </div>
            </div>
          )
        })() : (
          <p style={{ padding: '1rem', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.9rem' }}>
            {isBranchingOutputNodeType(nodeType) ? 'Output node menu - placeholder' : 'Menu content will be added here'}
          </p>
        )}
      </div>
    </div>
  )
}
