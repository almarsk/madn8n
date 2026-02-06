interface StickerMenuBodyProps {
  metadata: {
    stickers?: Record<string, any>
  }
  setMetadata: (metadata: any) => void
  onFlowMetadataUpdate?: (metadata: any) => void
}

// Convert rgba string to hex for HTML color input
function rgbaToHex(rgba: string): string {
  // Match rgba(r, g, b, a) format
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/)
  if (match) {
    const r = parseInt(match[1], 10)
    const g = parseInt(match[2], 10)
    const b = parseInt(match[3], 10)
    return `#${[r, g, b].map(x => {
      const hex = x.toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }).join('')}`
  }
  // If already hex or invalid, return as-is
  return rgba.startsWith('#') ? rgba : '#1e293b' // Default to dark gray hex
}

// Convert hex to rgba (for when color picker changes)
function hexToRgba(hex: string, alpha: number = 0.95): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (result) {
    const r = parseInt(result[1], 16)
    const g = parseInt(result[2], 16)
    const b = parseInt(result[3], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return hex // Return as-is if not valid hex
}

export default function StickerMenuBody({ metadata, setMetadata, onFlowMetadataUpdate }: StickerMenuBodyProps) {
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: 'rgba(226, 232, 240, 0.9)', fontSize: '1rem', fontWeight: 600 }}>
          Stickers
        </h3>
        <button
          type="button"
          onClick={() => {
            // Generate a new sticker ID
            const newId = `S${Object.keys(metadata.stickers || {}).length + 1}`
            const updated = {
              ...metadata,
              stickers: {
                ...metadata.stickers,
                [newId]: {
                  name: 'default',
                  description: '',
                  appearance: { color: 'rgba(30, 41, 59, 0.95)' },
                },
              },
            }
            setMetadata(updated)
            if (onFlowMetadataUpdate) {
              onFlowMetadataUpdate(updated)
            }
          }}
          style={{
            padding: '0.375rem 0.75rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(30, 41, 59, 0.9)',
            color: '#e5e7eb',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          + Add Sticker
        </button>
      </div>
      {metadata.stickers && Object.keys(metadata.stickers).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {Object.entries(metadata.stickers).map(([id, sticker]: [string, any]) => (
            <div
              key={id}
              style={{
                padding: '0.75rem',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: '4px',
                background: 'rgba(30, 41, 59, 0.5)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    value={sticker.name || ''}
                    onChange={(e) => {
                      const updated = {
                        ...metadata,
                        stickers: {
                          ...metadata.stickers,
                          [id]: {
                            ...sticker,
                            name: e.target.value,
                          },
                        },
                      }
                      setMetadata(updated)
                      if (onFlowMetadataUpdate) {
                        onFlowMetadataUpdate(updated)
                      }
                    }}
                    placeholder="Sticker name"
                    style={{
                      width: '100%',
                      padding: '0.375rem 0.5rem',
                      border: '1px solid rgba(148, 163, 184, 0.5)',
                      borderRadius: '4px',
                      background: 'rgba(15, 23, 42, 0.9)',
                      color: '#e5e7eb',
                      fontSize: '0.875rem',
                      marginBottom: '0.5rem',
                    }}
                  />
                  <textarea
                    value={sticker.description || ''}
                    onChange={(e) => {
                      const updated = {
                        ...metadata,
                        stickers: {
                          ...metadata.stickers,
                          [id]: {
                            ...sticker,
                            description: e.target.value,
                          },
                        },
                      }
                      setMetadata(updated)
                      if (onFlowMetadataUpdate) {
                        onFlowMetadataUpdate(updated)
                      }
                    }}
                    placeholder="Description (optional)"
                    style={{
                      width: '100%',
                      padding: '0.375rem 0.5rem',
                      border: '1px solid rgba(148, 163, 184, 0.5)',
                      borderRadius: '4px',
                      background: 'rgba(15, 23, 42, 0.9)',
                      color: '#e5e7eb',
                      fontSize: '0.875rem',
                      minHeight: '50px',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated = { ...metadata }
                    const newStickers = { ...updated.stickers }
                    delete newStickers[id]
                    updated.stickers = newStickers
                    setMetadata(updated)
                    if (onFlowMetadataUpdate) {
                      onFlowMetadataUpdate(updated)
                    }
                  }}
                  style={{
                    marginLeft: '0.5rem',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    borderRadius: '4px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Delete
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ color: 'rgba(226, 232, 240, 0.9)', fontSize: '0.875rem' }}>Color:</label>
                <input
                  type="color"
                  value={rgbaToHex(sticker.appearance?.color || 'rgba(30, 41, 59, 0.95)')}
                  onChange={(e) => {
                    // Extract alpha from existing color if it's rgba, otherwise use 0.95
                    const existingColor = sticker.appearance?.color || 'rgba(30, 41, 59, 0.95)'
                    const alphaMatch = existingColor.match(/rgba?\([\d\s,]+,\s*([\d.]+)\)/)
                    const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 0.95
                    const rgbaColor = hexToRgba(e.target.value, alpha)
                    
                    const updated = {
                      ...metadata,
                      stickers: {
                        ...metadata.stickers,
                        [id]: {
                          ...sticker,
                          appearance: {
                            ...sticker.appearance,
                            color: rgbaColor,
                          },
                        },
                      },
                    }
                    setMetadata(updated)
                    if (onFlowMetadataUpdate) {
                      onFlowMetadataUpdate(updated)
                    }
                  }}
                  style={{
                    width: '40px',
                    height: '30px',
                    border: '1px solid rgba(148, 163, 184, 0.5)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                />
                <input
                  type="text"
                  value={sticker.appearance?.color || 'rgba(30, 41, 59, 0.95)'}
                  onChange={(e) => {
                    const updated = {
                      ...metadata,
                      stickers: {
                        ...metadata.stickers,
                        [id]: {
                          ...sticker,
                          appearance: {
                            ...sticker.appearance,
                            color: e.target.value,
                          },
                        },
                      },
                    }
                    setMetadata(updated)
                    if (onFlowMetadataUpdate) {
                      onFlowMetadataUpdate(updated)
                    }
                  }}
                  placeholder="rgba(30, 41, 59, 0.95)"
                  style={{
                    flex: 1,
                    padding: '0.375rem 0.5rem',
                    border: '1px solid rgba(148, 163, 184, 0.5)',
                    borderRadius: '4px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    color: '#e5e7eb',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ padding: '0.5rem', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.875rem' }}>
          No stickers defined. Click "Add Sticker" to create one.
        </p>
      )}
    </div>
  )
}
