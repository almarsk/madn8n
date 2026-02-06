import { parseType, displayType } from '../../utils/nodeUtils'

// Helper to render input field based on param type
export const renderParamInput = (
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
            width: 'auto',
            cursor: 'pointer',
          }}
        />
      )
    case 'list':
      return (
        <textarea
          value={Array.isArray(value) ? JSON.stringify(value, null, 2) : '[]'}
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
          placeholder="Enter JSON array..."
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
            fontSize: '0.875rem',
            minHeight: '80px',
            resize: 'vertical',
            fontFamily: 'monospace',
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
          placeholder="Enter JSON object..."
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
            fontSize: '0.875rem',
            minHeight: '80px',
            resize: 'vertical',
            fontFamily: 'monospace',
          }}
        />
      )
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
            fontSize: '0.875rem',
          }}
        />
      )
  }
}

export { parseType, displayType }
