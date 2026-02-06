import type { Node } from 'reactflow'
import type { Module } from '../../modules'
import { displayType, renderParamInput } from './helpers'
import { getDefaultValueForType, isParamObligatory, isEmpty } from '../../utils/configHelpers'

interface BranchingNodeBodyProps {
  node: Node
  module: Module
  params: Record<string, any>
  handleParamChange: (paramName: string, value: any) => void
  onAddOutput?: (nodeId: string) => void
}

export default function BranchingNodeBody({
  node,
  module,
  params,
  handleParamChange,
  onAddOutput,
}: BranchingNodeBodyProps) {
  return (
    <div style={{ padding: '1rem' }}>
      {/* Show module params - hide listParam if it's used for outputs */}
      {module.params.map((param) => {
        // Skip listParam if it's used for outputs
        if (module.outputConfig?.type === 'listParam' && module.outputConfig.listParamName === param.name) {
          return null
        }

        const defaultValue = getDefaultValueForType(param.type)
        const isObligatory = isParamObligatory(param)
        const currentValue = params[param.name] ?? defaultValue
        const valueIsEmpty = isEmpty(currentValue)
        const hasError = isObligatory && valueIsEmpty

        return (
          <div key={param.name} style={{ marginBottom: '0.75rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.375rem',
                color: hasError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(226, 232, 240, 0.9)',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {param.name}
              {isObligatory && <span style={{ color: 'rgba(239, 68, 68, 0.8)', marginLeft: '0.25rem' }}>*</span>}
              {param.type ? ` (${displayType(param.type)})` : ''}
            </label>
            {renderParamInput(param.type, params[param.name] ?? defaultValue, (value) => handleParamChange(param.name, value))}
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
  )
}
