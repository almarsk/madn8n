import type { Param } from '../../modules'

interface StickerParamInputProps {
    param: Param
    value: any
    onChange: (value: any) => void
    availableStickers: Record<string, any>
    hasError: boolean
    isObligatory: boolean
    onOpenStickerMenu?: () => void
}

export default function StickerParamInput({
    param,
    value,
    onChange,
    availableStickers,
    hasError,
    isObligatory,
    onOpenStickerMenu,
}: StickerParamInputProps) {
    // Always read from the param's name key, but handle array format
    const selectedArray = Array.isArray(value) ? value : []
    const selected = selectedArray[0] ?? ''

    return (
        <div style={{ marginBottom: '0.75rem' }}>
            <label
                style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    color: hasError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(226, 232, 240, 0.9)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                }}
            >
                Sticker
                {isObligatory && <span style={{ color: 'rgba(239, 68, 68, 0.8)', marginLeft: '0.25rem' }}>*</span>}
            </label>
            <select
                value={selected}
                onChange={(e) => {
                    const nextValue = e.target.value
                    const arrayValue = nextValue ? [nextValue] : []
                    // Store under the param's name - generic, not hardcoded
                    onChange(arrayValue)
                }}
                style={{
                    width: '100%',
                    padding: '0.5rem 1.75rem 0.5rem 0.5rem',
                    border: '1px solid rgba(148, 163, 184, 0.7)',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    color: '#e5e7eb',
                    fontSize: '0.875rem',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                }}
            >
                <option value="">Select sticker…</option>
                {Object.entries(availableStickers).map(([id, sticker]: [string, any]) => (
                    <option key={id} value={id}>
                        {(sticker as any).name || id}
                    </option>
                ))}
            </select>
            {onOpenStickerMenu && (
                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={() => {
                            onOpenStickerMenu()
                        }}
                        style={{
                            padding: '0.375rem 0.75rem',
                            borderRadius: '4px',
                            border: '1px solid rgba(148, 163, 184, 0.7)',
                            background: 'rgba(30, 41, 59, 0.9)',
                            color: '#e5e7eb',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                        }}
                    >
                        Manage stickers…
                    </button>
                </div>
            )}
        </div>
    )
}
