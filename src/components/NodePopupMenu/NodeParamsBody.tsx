import type { Module } from '../../modules'
import { getDefaultValueForType, isParamObligatory, isEmpty } from '../../utils/configHelpers'
import StickerParamInput from './StickerParamInput'
import DefaultParamInput from './DefaultParamInput'

interface NodeParamsBodyProps {
  module: Module
  params: Record<string, any>
  handleParamChange: (paramName: string, value: any) => void
  stickers?: Record<string, any>
  flowMetadata?: {
    stickers?: Record<string, any>
  }
  metadata?: {
    stickers?: Record<string, any>
  }
  onOpenStickerMenu?: () => void
}

export default function NodeParamsBody({
  module,
  params,
  handleParamChange,
  stickers,
  flowMetadata,
  metadata,
  onOpenStickerMenu,
}: NodeParamsBodyProps) {
  return (
    <div style={{ padding: '1rem' }}>
      {module.params.map((param) => {
        const defaultValue = getDefaultValueForType(param.type)
        const isObligatory = isParamObligatory(param)
        const currentValue = params[param.name] ?? defaultValue
        const valueIsEmpty = isEmpty(currentValue)
        const hasError = isObligatory && valueIsEmpty

        // Use type-based check to identify sticker params (not name-based)
        if (param.type === 'stickers') {
          const availableStickers = stickers || flowMetadata?.stickers || metadata?.stickers || {}

          return (
            <StickerParamInput
              key={param.name}
              param={param}
              value={currentValue}
              onChange={(value) => handleParamChange(param.name, value)}
              availableStickers={availableStickers}
              hasError={hasError}
              isObligatory={isObligatory}
              onOpenStickerMenu={onOpenStickerMenu}
            />
          )
        }

        // Default rendering for all other params
        return (
          <DefaultParamInput
            key={param.name}
            param={param}
            value={params[param.name]}
            defaultValue={defaultValue}
            onChange={(value) => handleParamChange(param.name, value)}
            hasError={hasError}
            isObligatory={isObligatory}
          />
        )
      })}
      {module.params.length === 0 && (
        <p style={{ padding: '0.5rem', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.875rem' }}>
          No parameters configured
        </p>
      )}
    </div>
  )
}
