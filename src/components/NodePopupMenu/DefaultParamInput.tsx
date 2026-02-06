import type { Param } from '../../modules'
import { displayType, renderParamInput } from './helpers'

interface DefaultParamInputProps {
    param: Param
    value: any
    defaultValue: any
    onChange: (value: any) => void
    hasError: boolean
    isObligatory: boolean
}

export default function DefaultParamInput({
    param,
    value,
    defaultValue,
    onChange,
    hasError,
    isObligatory,
}: DefaultParamInputProps) {
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
                {param.name}
                {isObligatory && <span style={{ color: 'rgba(239, 68, 68, 0.8)', marginLeft: '0.25rem' }}>*</span>}
                {param.type ? ` (${displayType(param.type)})` : ''}
            </label>
            {renderParamInput(param.type, value ?? defaultValue, onChange)}
        </div>
    )
}
