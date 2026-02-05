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
  // Remember last used format from localStorage
  const [jsonFormat, setJsonFormat] = useState<JsonFormat>(() => {
    const saved = localStorage.getItem('jsonEditorFormat')
    return (saved === 'reactflow' || saved === 'custom') ? saved : 'custom'
  })
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initialJson, null, 4))
  const [validationResult, setValidationResult] = useState<{ isValid: boolean | null; message: string }>({
    isValid: null,
    message: '',
  })
  const [isCopied, setIsCopied] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const userHasEditedRef = useRef(false) // Track if user has manually edited JSON
  const hasInitializedRef = useRef(false) // Track if we've initialized from initialJson
  
  // Store ReactFlow data for format switching
  const reactFlowDataRef = useRef<{ nodes: any[]; edges: any[] } | null>(initialReactFlowData || null)
  const metadataRef = useRef<CustomFlowMetadata | null>(initialMetadata || null)
  
  // Initialize from initialJson on mount (only once)
  // For custom format, use initialJson (which is already translated)
  // For reactflow format, use initialReactFlowData
  useEffect(() => {
    if (!hasInitializedRef.current) {
      if (jsonFormat === 'custom' && initialJson) {
        setJsonText(JSON.stringify(initialJson, null, 4))
      } else if (jsonFormat === 'reactflow' && initialReactFlowData) {
        setJsonText(JSON.stringify(initialReactFlowData, null, 4))
      }
      hasInitializedRef.current = true
    }
  }, [initialJson, initialReactFlowData, jsonFormat])
  
  // Sync with canvas changes - only for ReactFlow format
  // For custom format, we don't auto-sync - it's only translated on open and save
  useEffect(() => {
    if (userHasEditedRef.current || !currentNodes || !currentEdges || !hasInitializedRef.current) return
    
    // Only auto-sync for ReactFlow format, not custom format
    if (jsonFormat === 'reactflow') {
      try {
        const reactFlowData = { nodes: currentNodes, edges: currentEdges }
        setJsonText(JSON.stringify(reactFlowData, null, 4))
        reactFlowDataRef.current = reactFlowData
        metadataRef.current = currentMetadata || initialMetadata || null
      } catch (error) {
        console.error('Error syncing JSON editor:', error)
      }
    }
  }, [currentNodes, currentEdges, currentMetadata, jsonFormat, initialMetadata])

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

        const { reactFlowData, metadata } = translateCustomToReactFlow(
          parsed as CustomFlowJson,
          currentNodes,
          currentEdges
        )
        reactFlowDataRef.current = reactFlowData
        metadataRef.current = metadata
        setJsonText(JSON.stringify(reactFlowData, null, 4))
        setJsonFormat('reactflow')
        localStorage.setItem('jsonEditorFormat', 'reactflow')
        setValidationResult({ isValid: null, message: '' })
        userHasEditedRef.current = false // Reset edit flag when switching
      } else {
        // Switch to Custom format - translate current ReactFlow data from canvas
        // Always use current canvas state, not stored ref
        const reactFlowData = { nodes: currentNodes || [], edges: currentEdges || [] }
        const metadata = currentMetadata || metadataRef.current || {
          description: '',
          language: '',
          mchannels_bot_id: '',
          name: '',
          omnichannel_config: {},
          stickers: {},
        }
        const customData = translateReactFlowToCustom(reactFlowData, metadata)
        setJsonText(JSON.stringify(customData, null, 4))
        setJsonFormat('custom')
        localStorage.setItem('jsonEditorFormat', 'custom')
        setValidationResult({ isValid: null, message: '' })
        userHasEditedRef.current = false // Reset edit flag when switching
        // Update refs for future use
        reactFlowDataRef.current = reactFlowData
        metadataRef.current = metadata
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

        const { reactFlowData, metadata } = translateCustomToReactFlow(
          parsed as CustomFlowJson,
          currentNodes,
          currentEdges
        )
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
              onKeyDown={(e) => {
                // Allow Tab key to insert tab character instead of moving focus
                if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  e.preventDefault()
                  const textarea = e.currentTarget
                  const start = textarea.selectionStart
                  const end = textarea.selectionEnd
                  const newValue = jsonText.substring(0, start) + '\t' + jsonText.substring(end)
                  setJsonText(newValue)
                  // Restore cursor position after tab
                  setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 1
                  }, 0)
                }
                // Allow Ctrl+F / Cmd+F for find (browser default)
                // Don't prevent default for Ctrl+F
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
