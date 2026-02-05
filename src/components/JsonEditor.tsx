import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SaveIcon from '@mui/icons-material/Save'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import './JsonEditor.css'
import { translateCustomToReactFlow, validateCustomJson, type CustomFlowJson } from '../utils/translationHelpers'
import { exportFlowToJson } from '../utils/exportHelpers'
import { translateReactFlowToCustom, type CustomFlowMetadata } from '../utils/translationHelpers'

interface JsonEditorProps {
  initialJson: CustomFlowJson
  initialReactFlowData?: { nodes: any[]; edges: any[] }
  initialMetadata?: CustomFlowMetadata
  currentNodes?: any[]
  currentEdges?: any[]
  currentMetadata?: CustomFlowMetadata
  onClose: () => void
  onSave: (reactFlowData: { nodes: any[]; edges: any[] }, metadata: any) => void
}

type JsonFormat = 'custom' | 'reactflow'

export default function JsonEditor({ initialJson, initialReactFlowData, initialMetadata, currentNodes, currentEdges, currentMetadata, onClose, onSave }: JsonEditorProps) {
  const [jsonFormat, setJsonFormat] = useState<JsonFormat>('custom')
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initialJson, null, 2))
  const [validationResult, setValidationResult] = useState<{ isValid: boolean | null; message: string }>({
    isValid: null,
    message: '',
  })
  const [isCopied, setIsCopied] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const userHasEditedRef = useRef(false) // Track if user has manually edited JSON
  
  // Store ReactFlow data for format switching
  const reactFlowDataRef = useRef<{ nodes: any[]; edges: any[] } | null>(initialReactFlowData || null)
  const metadataRef = useRef<CustomFlowMetadata | null>(initialMetadata || null)
  
  // Sync with canvas changes - update editor content when canvas changes (unless user is editing)
  useEffect(() => {
    if (userHasEditedRef.current || !currentNodes || !currentEdges) return
    
    try {
      if (jsonFormat === 'custom') {
        const reactFlowData = { nodes: currentNodes, edges: currentEdges }
        const metadata = currentMetadata || initialMetadata || {
          description: '',
          language: '',
          mchannels_bot_id: '',
          name: '',
          omnichannel_config: {},
          stickers: {},
        }
        const customData = translateReactFlowToCustom(reactFlowData, metadata)
        setJsonText(JSON.stringify(customData, null, 2))
        reactFlowDataRef.current = reactFlowData
        metadataRef.current = metadata
      } else {
        const reactFlowData = { nodes: currentNodes, edges: currentEdges }
        setJsonText(JSON.stringify(reactFlowData, null, 2))
        reactFlowDataRef.current = reactFlowData
        metadataRef.current = currentMetadata || initialMetadata || null
      }
    } catch (error) {
      console.error('Error syncing JSON editor:', error)
    }
  }, [currentNodes, currentEdges, currentMetadata, jsonFormat, initialMetadata, translateReactFlowToCustom])

  // Focus textarea on mount
  useEffect(() => {
    const textarea = editorRef.current?.querySelector('textarea')
    if (textarea) {
      textarea.focus()
      // Place cursor at end
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
  }, [])

  // Handle format switching
  const handleFormatSwitch = () => {
    try {
      if (jsonFormat === 'custom') {
        // Switch to ReactFlow format
        const parsed = JSON.parse(jsonText)
        const validation = validateCustomJson(parsed as CustomFlowJson)
        
        if (!validation.isValid) {
          setValidationResult({
            isValid: false,
            message: `Cannot switch: Validation errors:\n${validation.errors.join('\n')}`,
          })
          return
        }

        const { reactFlowData, metadata } = translateCustomToReactFlow(parsed as CustomFlowJson)
        reactFlowDataRef.current = reactFlowData
        metadataRef.current = metadata
        setJsonText(JSON.stringify(reactFlowData, null, 2))
        setJsonFormat('reactflow')
        setValidationResult({ isValid: null, message: '' })
      } else {
        // Switch to Custom format
        const parsed = JSON.parse(jsonText)
        if (!parsed.nodes || !parsed.edges) {
          setValidationResult({
            isValid: false,
            message: 'Invalid ReactFlow JSON: missing nodes or edges',
          })
          return
        }

        const metadata = metadataRef.current || {
          description: '',
          language: '',
          mchannels_bot_id: '',
          name: '',
          omnichannel_config: {},
          stickers: {},
        }
        const customData = translateReactFlowToCustom(parsed, metadata)
        setJsonText(JSON.stringify(customData, null, 2))
        setJsonFormat('custom')
        setValidationResult({ isValid: null, message: '' })
      }
    } catch (error) {
      setValidationResult({
        isValid: false,
        message: `Cannot switch format: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(jsonText)
      
      if (jsonFormat === 'custom') {
        const validation = validateCustomJson(parsed as CustomFlowJson)
        
        if (validation.isValid) {
          setValidationResult({
            isValid: true,
            message: 'Mappie JSON is valid and can be translated to ReactFlow format',
          })
        } else {
          setValidationResult({
            isValid: false,
            message: `Validation errors:\n${validation.errors.join('\n')}`,
          })
        }
      } else {
        // Validate ReactFlow format
        if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
          setValidationResult({
            isValid: false,
            message: 'Invalid ReactFlow JSON: missing or invalid nodes array',
          })
          return
        }
        if (!parsed.edges || !Array.isArray(parsed.edges)) {
          setValidationResult({
            isValid: false,
            message: 'Invalid ReactFlow JSON: missing or invalid edges array',
          })
          return
        }
        setValidationResult({
          isValid: true,
          message: 'ReactFlow JSON is valid',
        })
      }
    } catch (error) {
      setValidationResult({
        isValid: false,
        message: `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonText)
      
      if (jsonFormat === 'custom') {
        const validation = validateCustomJson(parsed as CustomFlowJson)
        
        if (!validation.isValid) {
          setValidationResult({
            isValid: false,
            message: `Cannot save: Validation errors:\n${validation.errors.join('\n')}`,
          })
          return
        }

        const { reactFlowData, metadata } = translateCustomToReactFlow(parsed as CustomFlowJson)
        reactFlowDataRef.current = reactFlowData
        metadataRef.current = metadata
        onSave(reactFlowData, metadata)
        // Don't close editor - let user continue editing
      } else {
        // Save ReactFlow format
        if (!parsed.nodes || !parsed.edges) {
          setValidationResult({
            isValid: false,
            message: 'Cannot save: Invalid ReactFlow JSON: missing nodes or edges',
          })
          return
        }

        const metadata = metadataRef.current || {
          description: '',
          language: '',
          mchannels_bot_id: '',
          name: '',
          omnichannel_config: {},
          stickers: {},
        }
        onSave(parsed, metadata)
        // Don't close editor - let user continue editing
      }
    } catch (error) {
      setValidationResult({
        isValid: false,
        message: `Cannot save: Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleOverwriteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setJsonText(text)
      setValidationResult({ isValid: null, message: '' })
    } catch (err) {
      console.error('Failed to paste:', err)
    }
  }

  return createPortal(
    <div className="json-editor-overlay" onClick={onClose}>
      <div
        className="json-editor-container"
        onClick={(e) => e.stopPropagation()}
        ref={editorRef}
      >
        <div className="json-editor-header">
          <h2>JSON Editor</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="json-editor-button json-editor-button--secondary"
              onClick={handleFormatSwitch}
              title={`Switch to ${jsonFormat === 'custom' ? 'ReactFlow' : 'Mappie'} format`}
              style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', minWidth: '120px', width: '120px' }}
            >
              <SwapHorizIcon fontSize="small" />
              {jsonFormat === 'custom' ? 'ReactFlow' : 'Mappie'}
            </button>
            <button
              type="button"
              className="json-editor-close-button"
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon fontSize="small" />
            </button>
          </div>
        </div>

        <div className="json-editor-content">
          <div className="json-editor-textarea-wrapper">
            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setValidationResult({ isValid: null, message: '' })
                userHasEditedRef.current = true // Mark that user has edited
              }}
              className="json-editor-textarea"
              spellCheck={false}
            />
          </div>

          {validationResult.message && (
            <div
              className={`json-editor-validation ${
                validationResult.isValid ? 'json-editor-validation--valid' : 'json-editor-validation--invalid'
              }`}
            >
              <pre>{validationResult.message}</pre>
            </div>
          )}

          <div className="json-editor-actions">
            <button
              type="button"
              className="json-editor-button json-editor-button--secondary"
              onClick={handleCopy}
              title="Copy JSON to clipboard"
            >
              <ContentCopyIcon fontSize="small" />
              {isCopied ? 'Copied!' : 'Copy JSON'}
            </button>
            <button
              type="button"
              className="json-editor-button json-editor-button--secondary"
              onClick={handleOverwriteFromClipboard}
              title="Overwrite from clipboard"
            >
              <ContentPasteIcon fontSize="small" />
              Overwrite from clipboard
            </button>
            <button
              type="button"
              className="json-editor-button json-editor-button--secondary"
              onClick={handleValidate}
              title="Validate JSON"
            >
              <CheckCircleIcon fontSize="small" />
              Validate JSON
            </button>
            <button
              type="button"
              className="json-editor-button json-editor-button--primary"
              onClick={handleSave}
              title="Save and apply changes"
            >
              <SaveIcon fontSize="small" />
              Save to canvas
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
