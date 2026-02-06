interface FlowConfigBodyProps {
  metadata: {
    description: string
    language: string
    mchannels_bot_id: string
    name: string
    omnichannel_config?: Record<string, any>
    stickers?: Record<string, any>
  }
  setMetadata: (metadata: any) => void
  onFlowMetadataUpdate?: (metadata: any) => void
}

export default function FlowConfigBody({ metadata, setMetadata, onFlowMetadataUpdate }: FlowConfigBodyProps) {
  const omni = metadata.omnichannel_config || {}
  const voice = omni.voice || {}
  const tts = voice.tts || {}
  const prosody = tts.prosody || {}
  const stt = voice.stt || {}

  const updateOmnichannel = (updater: (current: any) => any) => {
    const current = metadata.omnichannel_config || {}
    const updatedOmni = updater(current)
    const updated = { ...metadata, omnichannel_config: updatedOmni }
    setMetadata(updated)
    if (onFlowMetadataUpdate) {
      onFlowMetadataUpdate(updated)
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Name
        </label>
        <input
          type="text"
          value={metadata.name}
          onChange={(e) => {
            const updated = { ...metadata, name: e.target.value }
            setMetadata(updated)
            if (onFlowMetadataUpdate) {
              onFlowMetadataUpdate(updated)
            }
          }}
          placeholder="Enter flow name..."
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
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Description
        </label>
        <textarea
          value={metadata.description}
          onChange={(e) => {
            const updated = { ...metadata, description: e.target.value }
            setMetadata(updated)
            if (onFlowMetadataUpdate) {
              onFlowMetadataUpdate(updated)
            }
          }}
          placeholder="Enter flow description..."
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
            fontSize: '0.875rem',
            minHeight: '60px',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Language
        </label>
        <select
          value={metadata.language}
          onChange={(e) => {
            const updated = { ...metadata, language: e.target.value }
            setMetadata(updated)
            if (onFlowMetadataUpdate) {
              onFlowMetadataUpdate(updated)
            }
          }}
          style={{
            width: '100%',
            padding: '0.5rem 1.75rem 0.5rem 0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
            fontSize: '0.875rem',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
        >
          <option value="">Select language…</option>
          <option value="cs">cs</option>
          <option value="en">en</option>
          <option value="de">de</option>
        </select>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          MChannels Bot ID
        </label>
        <input
          type="text"
          value={metadata.mchannels_bot_id}
          onChange={(e) => {
            const updated = { ...metadata, mchannels_bot_id: e.target.value }
            setMetadata(updated)
            if (onFlowMetadataUpdate) {
              onFlowMetadataUpdate(updated)
            }
          }}
          placeholder="Enter mchannels bot ID..."
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
      </div>

      {/* Omnichannel config – voice, TTS, STT as individual fields */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Voice initial user response timeout
        </label>
        <input
          type="number"
          step={100}
          value={voice.initial_user_response_timeout ?? ''}
          onChange={(e) => {
            const value = e.target.value === '' ? '' : Number(e.target.value)
            updateOmnichannel((current) => {
              const v = current.voice || {}
              return {
                ...current,
                voice: {
                  ...v,
                  initial_user_response_timeout: value,
                },
              }
            })
          }}
          placeholder="e.g. 1800"
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
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Voice inactivity timeout
        </label>
        <input
          type="number"
          step={100}
          value={voice.inactivity_timeout ?? ''}
          onChange={(e) => {
            const value = e.target.value === '' ? '' : Number(e.target.value)
            updateOmnichannel((current) => {
              const v = current.voice || {}
              return {
                ...current,
                voice: {
                  ...v,
                  inactivity_timeout: value,
                },
              }
            })
          }}
          placeholder="e.g. 4000"
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
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          TTS voice
        </label>
        <select
          value={tts.voice ?? ''}
          onChange={(e) => {
            const value = e.target.value
            updateOmnichannel((current) => {
              const v = current.voice || {}
              const t = v.tts || {}
              return {
                ...current,
                voice: {
                  ...v,
                  tts: {
                    ...t,
                    voice: value,
                  },
                },
              }
            })
          }}
          style={{
            width: '100%',
            padding: '0.5rem 1.75rem 0.5rem 0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
            fontSize: '0.875rem',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
        >
          <option value="">Select TTS voice…</option>
          <option value="cs-CZ_TomasU8">cs-CZ_TomasU8</option>
          <option value="cs-CZ_JanaU8">cs-CZ_JanaU8</option>
          <option value="en-US_Alloy">en-US_Alloy</option>
        </select>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          TTS provider
        </label>
        <select
          value={tts.provider ?? ''}
          onChange={(e) => {
            const value = e.target.value
            updateOmnichannel((current) => {
              const v = current.voice || {}
              const t = v.tts || {}
              return {
                ...current,
                voice: {
                  ...v,
                  tts: {
                    ...t,
                    provider: value,
                  },
                },
              }
            })
          }}
          style={{
            width: '100%',
            padding: '0.5rem 1.75rem 0.5rem 0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
            fontSize: '0.875rem',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
        >
          <option value="">Select TTS provider…</option>
          <option value="mvoice">mvoice</option>
          <option value="azure">azure</option>
        </select>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          TTS prosody rate
        </label>
        {(() => {
          const rawRate = typeof prosody.rate === 'string' ? prosody.rate : '100%'
          const match = rawRate.match(/(\d+)/)
          const rateNumber = match ? Number(match[1]) : 100
          const clamped = Math.min(150, Math.max(50, rateNumber || 100))
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="range"
                min={50}
                max={150}
                step={5}
                value={clamped}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  const rateString = `${value}%`
                  updateOmnichannel((current) => {
                    const v = current.voice || {}
                    const t = v.tts || {}
                    const p = t.prosody || {}
                    return {
                      ...current,
                      voice: {
                        ...v,
                        tts: {
                          ...t,
                          prosody: {
                            ...p,
                            rate: rateString,
                          },
                        },
                      },
                    }
                  })
                }}
                style={{ flex: 1 }}
              />
              <span style={{ minWidth: '3rem', textAlign: 'right', fontSize: '0.8rem', color: '#e5e7eb' }}>
                {clamped}%
              </span>
            </div>
          )
        })()}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'rgba(226, 232, 240, 0.9)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          STT provider
        </label>
        <select
          value={stt.provider ?? ''}
          onChange={(e) => {
            const value = e.target.value
            updateOmnichannel((current) => {
              const v = current.voice || {}
              const s = v.stt || {}
              return {
                ...current,
                voice: {
                  ...v,
                  stt: {
                    ...s,
                    provider: value,
                  },
                },
              }
            })
          }}
          style={{
            width: '100%',
            padding: '0.5rem 1.75rem 0.5rem 0.5rem',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#e5e7eb',
            fontSize: '0.875rem',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
        >
          <option value="">Select STT provider…</option>
          <option value="azure">azure</option>
          <option value="mvoice">mvoice</option>
        </select>
      </div>
    </div>
  )
}
