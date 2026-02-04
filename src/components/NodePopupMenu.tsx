import { useEffect, useRef, useState } from 'react'
import { ReactFlowInstance, type Node } from 'reactflow'
import './NodePopupMenu.css'
import modules, { type Module } from '../modules'
import { type NodeType, isBranchingNodeType, isBranchingOutputNodeType, NODE_TYPES } from '../nodeConfigs'

// Helper to parse Pythonic type notation (e.g., "list[str]", "dict", "list[number]")
const parseType = (typeStr: string | undefined): { base: string; inner?: string } => {
  if (!typeStr) return { base: 'string' }

  // Match list[type] or dict[type]
  const listMatch = typeStr.match(/^list\[(.+)\]$/)
  if (listMatch) {
    return { base: 'list', inner: listMatch[1] }
  }

  const dictMatch = typeStr.match(/^dict(?:\[(.+)\])?$/)
  if (dictMatch) {
    return { base: 'dict', inner: dictMatch[1] }
  }

  return { base: typeStr }
}

interface NodePopupMenuProps {
  node: Node
  onClose: () => void
  reactFlowWrapper: React.RefObject<HTMLDivElement>
  reactFlowInstance: ReactFlowInstance | null
  onOutputCountChange?: (nodeId: string, count: number) => void
  onNodeDataUpdate?: (nodeId: string, updatedData: any) => void
  onAddOutput?: (nodeId: string) => void
}

// Helper to get default value based on type
const getDefaultValue = (typeStr: string | undefined): any => {
  const { base } = parseType(typeStr)
  if (base === 'number') return 0
  if (base === 'boolean') return false
  if (base === 'list') return []
  if (base === 'dict') return {}
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

export default function NodePopupMenu({
  node,
  onClose,
  reactFlowWrapper,
  reactFlowInstance,
  onNodeDataUpdate,
  onAddOutput
}: NodePopupMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const nodeType = (node.data?.nodeType || NODE_TYPES.SINGLE) as NodeType
  const module = node.data?.moduleName ? modules.find((m: Module) => m.name === node.data.moduleName) : undefined

  // Initialize params state from node data
  const [params, setParams] = useState<Record<string, any>>(node.data?.params || {})

  useEffect(() => {
    // Update params when node data changes
    setParams(node.data?.params || {})
  }, [node.data.params])

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

  const handleParamChange = (paramName: string, value: any) => {
    const updatedParams = { ...params, [paramName]: value }
    setParams(updatedParams)

    if (onNodeDataUpdate) {
      onNodeDataUpdate(node.id, { params: updatedParams })
    }
  }

  const handleOutputValueChange = (value: any) => {
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
        {/* Single Node Menu - Show all params */}
        {!isBranchingNodeType(nodeType) && !isBranchingOutputNodeType(nodeType) && module && (
          <div style={{ padding: '0.75rem' }}>
            {Object.keys(module.params).map((paramName) => {
              const param = module.params[paramName]
              const defaultValue = getDefaultValue(param.type)
              return (
                <div key={paramName} style={{ marginBottom: '0.75rem' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    color: 'rgba(226, 232, 240, 0.9)',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}>
                    {param.name}{param.type ? ` (${param.type})` : ''}
                  </label>
                  {renderParamInput(
                    param.type,
                    params[paramName] ?? defaultValue,
                    (value) => handleParamChange(paramName, value)
                  )}
                </div>
              )
            })}
            {Object.keys(module.params).length === 0 && (
              <p style={{ padding: '0.5rem', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.875rem' }}>
                No parameters configured
              </p>
            )}
          </div>
        )}

        {/* Branching Node Menu - Show params only (output count determined by config) */}
        {isBranchingNodeType(nodeType) && module && (
          <div style={{ padding: '0.75rem' }}>
            {/* Show module params - hide listParam if it's used for outputs */}
            {Object.keys(module.params).map((paramName) => {
              // Skip listParam if it's used for outputs
              if (module.outputConfig?.type === 'listParam' &&
                module.outputConfig.listParamName === paramName) {
                return null
              }

              const param = module.params[paramName]
              const defaultValue = getDefaultValue(param.type)
              return (
                <div key={paramName} style={{ marginBottom: '0.75rem' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    color: 'rgba(226, 232, 240, 0.9)',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}>
                    {param.name}{param.type ? ` (${param.type})` : ''}
                  </label>
                  {renderParamInput(
                    param.type,
                    params[paramName] ?? defaultValue,
                    (value) => handleParamChange(paramName, value)
                  )}
                </div>
              )
            })}

            {/* Add output button for listParam type */}
            {module.outputConfig?.type === 'listParam' && onAddOutput && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
                <button
                  type="button"
                  onClick={() => onAddOutput(node.id)}
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

        {/* Branching Output Node Menu */}
        {isBranchingOutputNodeType(nodeType) && module && module.outputConfig && (
          <div style={{ padding: '0.75rem' }}>
            {module.outputConfig.type === 'listParam' && module.outputConfig.listParamName ? (
              (() => {
                const listParam = module.params[module.outputConfig.listParamName]
                if (listParam) {
                  return (
                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.375rem',
                        color: 'rgba(226, 232, 240, 0.9)',
                        fontSize: '0.875rem',
                        fontWeight: 500
                      }}>
                        Value{listParam.type && ` (${listParam.type})`}
                      </label>
                      {renderParamInput('string', params.value ?? '', handleOutputValueChange)}
                    </div>
                  )
                }
                return null
              })()
            ) : (
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.375rem',
                  color: 'rgba(226, 232, 240, 0.9)',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}>
                  Name
                </label>
                <input
                  type="text"
                  value={params.value || node.data.label || ''}
                  onChange={(e) => {
                    const value = e.target.value
                    handleOutputValueChange(value)
                  }}
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
            )}
          </div>
        )}

        {/* Fallback for nodes without module */}
        {!module && (
          <p style={{ padding: '0.75rem', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.875rem' }}>
            No module configuration found
          </p>
        )}
      </div>
    </div>
  )
}
