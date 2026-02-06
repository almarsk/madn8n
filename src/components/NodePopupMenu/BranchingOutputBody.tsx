import type { Node } from 'reactflow'
import type { Module } from '../../modules'
import { parseType, displayType, renderParamInput } from './helpers'
import { isEmpty } from '../../utils/configHelpers'

interface BranchingOutputBodyProps {
  node: Node
  module: Module
  params: Record<string, any>
  handleOutputValueChange: (value: any) => void
}

export default function BranchingOutputBody({
  module,
  params,
  handleOutputValueChange,
}: BranchingOutputBodyProps) {
  if (!module.outputConfig || module.outputConfig.type !== 'listParam') {
    return null
  }

  const listParamName = module.outputConfig.listParamName
  const listParam = listParamName ? module.params.find((p) => p.name === listParamName) : undefined

  if (!listParam) {
    return null
  }

  // Output node value is always obligatory when linked to param
  const isObligatory = true
  const currentValue = params.value ?? ''
  const valueIsEmpty = isEmpty(currentValue)
  const hasError = isObligatory && valueIsEmpty

  // For output nodes, show only the element type, not "list[...]"
  const { inner } = parseType(listParam.type)
  const elementType = inner || 'str' // Show element type, fallback to str
  const inputType = inner || 'str'

  return (
    <div style={{ padding: '0.75rem' }}>
      <label
        style={{
          display: 'block',
          marginBottom: '0.375rem',
          color: hasError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(226, 232, 240, 0.9)',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        Value
        <span style={{ color: 'rgba(239, 68, 68, 0.8)', marginLeft: '0.25rem' }}>*</span>
        {elementType ? ` (${displayType(elementType)})` : ''}
      </label>
      {renderParamInput(inputType, params.value ?? '', handleOutputValueChange)}
    </div>
  )
}
