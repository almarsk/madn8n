import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SaveIcon from '@mui/icons-material/Save'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import './JsonEditor.css'
import { translateCustomToReactFlow, validateCustomJson, type CustomFlowJson } from '../utils/translationHelpers'

interface JsonEditorProps {
  initialJson: CustomFlowJson
  onClose: () => void
  onSave: (reactFlowData: { nodes: any[]; edges: any[] }, metadata: any) => void
}

export default function JsonEditor({ initialJson, onClose, onSave }: JsonEditorProps) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initialJson, null, 2))
  const [validationResult, setValidationResult] = useState<{ isValid: boolean | null; message: string }>({
    isValid: null,
    message: '',
  })
  const [isCopied, setIsCopied] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  // Focus textarea on mount
  useEffect(() => {
    const textarea = editorRef.current?.querySelector('textarea')
    if (textarea) {
      textarea.focus()
      // Place cursor at end
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
  }, [])

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(jsonText)
      const validation = validateCustomJson(parsed as CustomFlowJson)
      
      if (validation.isValid) {
        setValidationResult({
          isValid: true,
          message: 'JSON is valid and can be translated to ReactFlow format',
        })
      } else {
        setValidationResult({
          isValid: false,
          message: `Validation errors:\n${validation.errors.join('\n')}`,
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
      const validation = validateCustomJson(parsed as CustomFlowJson)
      
      if (!validation.isValid) {
        setValidationResult({
          isValid: false,
          message: `Cannot save: Validation errors:\n${validation.errors.join('\n')}`,
        })
        return
      }

      const { reactFlowData, metadata } = translateCustomToReactFlow(parsed as CustomFlowJson)
      onSave(reactFlowData, metadata)
      onClose()
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
          <button
            type="button"
            className="json-editor-close-button"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <div className="json-editor-content">
          <div className="json-editor-textarea-wrapper">
            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setValidationResult({ isValid: null, message: '' })
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
