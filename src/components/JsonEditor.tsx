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
  const [showSearch, setShowSearch] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [totalMatches, setTotalMatches] = useState(0)
  const editorRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
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
  
  // No auto-sync - translation only happens on format switch or save

  // Focus textarea on mount
  useEffect(() => {
    const textarea = editorRef.current?.querySelector('textarea')
    if (textarea) {
      textarea.focus()
      // Place cursor at end
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
  }, [])

  // Focus search input when shown
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showSearch])

  // Sync highlight layer scroll with textarea whenever search term changes
  useEffect(() => {
    if (searchTerm && textareaRef.current && highlightRef.current) {
      // Use requestAnimationFrame to ensure sync happens after render
      requestAnimationFrame(() => {
        if (textareaRef.current && highlightRef.current) {
          highlightRef.current.scrollTop = textareaRef.current.scrollTop
          highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
        }
      })
    }
  }, [searchTerm, jsonText])

  // Calculate total matches and current match index
  useEffect(() => {
    if (searchTerm && textareaRef.current) {
      const text = textareaRef.current.value
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const matches = Array.from(text.matchAll(searchRegex))
      setTotalMatches(matches.length)
      
      // Find current match index based on cursor position
      const cursorPos = textareaRef.current.selectionStart
      const currentIndex = matches.findIndex(match => match.index !== undefined && match.index <= cursorPos && cursorPos <= match.index + match[0].length)
      if (currentIndex >= 0) {
        setCurrentMatchIndex(currentIndex + 1) // 1-based for display
      } else {
        // Find closest match before cursor
        const beforeCursor = matches.filter(m => m.index !== undefined && m.index < cursorPos)
        setCurrentMatchIndex(beforeCursor.length > 0 ? beforeCursor.length : 0)
      }
    } else {
      setTotalMatches(0)
      setCurrentMatchIndex(0)
    }
  }, [searchTerm, jsonText])

  // Update match index when selection changes (for Enter key navigation)
  useEffect(() => {
    if (searchTerm && textareaRef.current) {
      const handleSelectionChange = () => {
        const text = textareaRef.current?.value || ''
        const cursorPos = textareaRef.current?.selectionStart || 0
        const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        const matches = Array.from(text.matchAll(searchRegex))
        const currentIndex = matches.findIndex(match => match.index !== undefined && match.index <= cursorPos && cursorPos <= match.index + match[0].length)
        if (currentIndex >= 0) {
          setCurrentMatchIndex(currentIndex + 1)
        } else {
          const beforeCursor = matches.filter(m => m.index !== undefined && m.index < cursorPos)
          setCurrentMatchIndex(beforeCursor.length > 0 ? beforeCursor.length : 0)
        }
      }
      
      const textarea = textareaRef.current
      textarea.addEventListener('selectionchange', handleSelectionChange)
      // Also listen to mouseup and keyup for selection changes
      textarea.addEventListener('mouseup', handleSelectionChange)
      textarea.addEventListener('keyup', handleSelectionChange)
      
      return () => {
        textarea.removeEventListener('selectionchange', handleSelectionChange)
        textarea.removeEventListener('mouseup', handleSelectionChange)
        textarea.removeEventListener('keyup', handleSelectionChange)
      }
    }
  }, [searchTerm])

  // Handle format switching
  const handleFormatSwitch = () => {
    try {
      if (jsonFormat === 'custom') {
        // Switch to ReactFlow format
        // Parse JSON to check syntax, but don't validate structure
        // The editor is just a buffer until saved
        const parsed = JSON.parse(jsonText)
        
        // Try to translate, but don't block on validation errors
        try {
          const { reactFlowData, metadata } = translateCustomToReactFlow(
            parsed as CustomFlowJson,
            currentNodes,
            currentEdges
          )
          reactFlowDataRef.current = reactFlowData
          metadataRef.current = metadata
          setJsonText(JSON.stringify(reactFlowData, null, 4))
          setValidationResult({ isValid: null, message: '' })
        } catch (translateError) {
          // If translation fails, still switch format but show a warning
          // User can edit and fix it
          setValidationResult({
            isValid: false,
            message: `Warning: Could not translate to ReactFlow format. You can still edit:\n${translateError instanceof Error ? translateError.message : 'Unknown error'}`,
          })
          // Still switch the format toggle and show empty/default ReactFlow structure
          setJsonText(JSON.stringify({ nodes: [], edges: [] }, null, 4))
        }
        setJsonFormat('reactflow')
        localStorage.setItem('jsonEditorFormat', 'reactflow')
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
        try {
          const customData = translateReactFlowToCustom(reactFlowData, metadata)
          setJsonText(JSON.stringify(customData, null, 4))
          setValidationResult({ isValid: null, message: '' })
        } catch (translateError) {
          // If translation fails, still switch format but show a warning
          setValidationResult({
            isValid: false,
            message: `Warning: Could not translate to Custom format. You can still edit:\n${translateError instanceof Error ? translateError.message : 'Unknown error'}`,
          })
          // Still switch the format toggle and show empty/default Custom structure
          setJsonText(JSON.stringify({
            current_bot_version: {
              description: '',
              language: '',
              mchannels_bot_id: '',
              name: '',
              dialog: {
                modules: {},
                root_module: '',
              },
            },
          }, null, 4))
        }
        setJsonFormat('custom')
        localStorage.setItem('jsonEditorFormat', 'custom')
        userHasEditedRef.current = false // Reset edit flag when switching
        // Update refs for future use
        reactFlowDataRef.current = reactFlowData
        metadataRef.current = metadata
      }
    } catch (error) {
      // Only block on JSON parse errors (syntax errors)
      setValidationResult({
        isValid: false,
        message: `Cannot switch format: Invalid JSON syntax:\n${error instanceof Error ? error.message : 'Unknown error'}`,
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
        setValidationResult({
          isValid: true,
          message: 'Saved to canvas',
        })
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setValidationResult({ isValid: null, message: '' })
        }, 5000)
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
        setValidationResult({
          isValid: true,
          message: 'Saved to canvas',
        })
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setValidationResult({ isValid: null, message: '' })
        }, 5000)
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
      setValidationResult({
        isValid: true,
        message: 'JSON copied to clipboard',
      })
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setValidationResult({ isValid: null, message: '' })
      }, 5000)
    } catch (err) {
      console.error('Failed to copy:', err)
      setValidationResult({
        isValid: false,
        message: 'Failed to copy JSON',
      })
      setTimeout(() => {
        setValidationResult({ isValid: null, message: '' })
      }, 5000)
    }
  }

  const handleOverwriteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setJsonText(text)
      setValidationResult({
        isValid: true,
        message: 'JSON overwritten from clipboard',
      })
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setValidationResult({ isValid: null, message: '' })
      }, 5000)
    } catch (err) {
      console.error('Failed to paste:', err)
      setValidationResult({
        isValid: false,
        message: 'Failed to read from clipboard',
      })
      setTimeout(() => {
        setValidationResult({ isValid: null, message: '' })
      }, 5000)
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
          <div className="json-editor-textarea-wrapper" style={{ position: 'relative' }}>
            {showSearch && (
              <div className="json-editor-search" style={{ 
                position: 'absolute', 
                top: '1rem', 
                left: '1rem', 
                zIndex: 1000,
                width: '300px',
              }}>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search (Esc to close)"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                // Scroll to first match
                const textarea = editorRef.current?.querySelector('textarea')
                if (textarea && e.target.value) {
                  const text = textarea.value
                  const searchRegex = new RegExp(e.target.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
                  const match = text.match(searchRegex)
                  if (match) {
                    const index = text.indexOf(match[0])
                    textarea.setSelectionRange(index, index + match[0].length)
                    textarea.scrollTop = (textarea.value.substring(0, index).match(/\n/g) || []).length * 20
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSearch(false)
                  setSearchTerm('')
                  const textarea = editorRef.current?.querySelector('textarea')
                  if (textarea) {
                    textarea.focus()
                  }
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  // Find next occurrence
                  const textarea = editorRef.current?.querySelector('textarea')
                  if (textarea && searchTerm) {
                    const text = textarea.value
                    const start = textarea.selectionStart + 1
                    const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
                    const matches = Array.from(text.matchAll(searchRegex))
                    const nextMatch = text.substring(start).search(searchRegex)
                    if (nextMatch >= 0) {
                      const index = start + nextMatch
                      textarea.setSelectionRange(index, index + searchTerm.length)
                      textarea.scrollTop = (textarea.value.substring(0, index).match(/\n/g) || []).length * 20
                      // Update match index
                      const matchIndex = matches.findIndex(m => m.index === index)
                      if (matchIndex >= 0) {
                        setCurrentMatchIndex(matchIndex + 1)
                      }
                    } else {
                      // Wrap around to beginning
                      const firstMatch = text.search(searchRegex)
                      if (firstMatch >= 0) {
                        textarea.setSelectionRange(firstMatch, firstMatch + searchTerm.length)
                        textarea.scrollTop = (textarea.value.substring(0, firstMatch).match(/\n/g) || []).length * 20
                        // Update match index
                        const matchIndex = matches.findIndex(m => m.index === firstMatch)
                        if (matchIndex >= 0) {
                          setCurrentMatchIndex(matchIndex + 1)
                        }
                      }
                    }
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '0.375rem 0.5rem',
                paddingRight: searchTerm && totalMatches > 0 ? '3rem' : '0.5rem',
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                borderRadius: '4px',
                color: '#e5e7eb',
                fontSize: '0.875rem',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              }}
              autoFocus
            />
            {searchTerm && totalMatches > 0 && (
              <span style={{ 
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '0.75rem', 
                color: 'rgba(148, 163, 184, 0.8)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                {currentMatchIndex}/{totalMatches}
              </span>
            )}
              </div>
            )}
            {/* Highlight layer behind textarea */}
            {searchTerm && (
              <div
                ref={highlightRef}
                className="json-editor-highlight"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: '1rem',
                  margin: 0,
                  border: '1px solid transparent',
                  fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                  color: 'transparent',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  overflow: 'auto',
                  pointerEvents: 'none',
                  zIndex: 1,
                  boxSizing: 'border-box',
                  tabSize: 4,
                  MozTabSize: 4,
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                } as React.CSSProperties}
                dangerouslySetInnerHTML={{
                  __html: (() => {
                    if (!searchTerm) return jsonText
                    const escapedText = jsonText
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                    const searchRegex = new RegExp(
                      `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
                      'gi'
                    )
                    
                    // Find all matches and log details for debugging
                    const matches: Array<{index: number, match: string, before: string, after: string, lineNumber: number, columnNumber: number, beforeChars: string[], hasNewlineBefore: boolean, hasNewlineAfter: boolean}> = []
                    let match
                    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
                    while ((match = regex.exec(escapedText)) !== null) {
                      const start = match.index
                      const end = start + match[0].length
                      const before = escapedText.substring(Math.max(0, start - 20), start)
                      const after = escapedText.substring(end, Math.min(escapedText.length, end + 20))
                      const beforeChars = Array.from(before).slice(-10)
                      const lineNumber = (escapedText.substring(0, start).match(/\n/g) || []).length + 1
                      const columnNumber = start - (escapedText.lastIndexOf('\n', start) + 1)
                      
                      matches.push({
                        index: start,
                        match: match[0],
                        before: before,
                        after: after,
                        lineNumber,
                        columnNumber,
                        beforeChars: beforeChars,
                        hasNewlineBefore: before.includes('\n'),
                        hasNewlineAfter: after.includes('\n'),
                      })
                    }
                    
                    // Replace matches with span, ensuring no line breaks
                    // Use a callback to avoid capturing newlines or whitespace
                    const highlighted = escapedText.replace(
                      searchRegex,
                      (match, offset) => {
                        // Check if match starts right after a newline - if so, ensure span doesn't create visual break
                        const charBefore = offset > 0 ? escapedText[offset - 1] : ''
                        const isAfterNewline = charBefore === '\n'
                        
                        
                        // Use inline with nowrap to prevent line break recalculation within the span
                        // This ensures the background only covers the actual text without affecting line flow
                        return `<span style="background-color: rgba(251, 191, 36, 0.4); color: transparent; display: inline; line-height: 1.5; margin: 0; padding: 0; vertical-align: baseline; border: none; box-sizing: border-box; white-space: nowrap;">${match}</span>`
                      }
                    )
                    
                    return highlighted
                  })(),
                }}
              />
            )}
            <textarea
              ref={textareaRef}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setValidationResult({ isValid: null, message: '' })
                userHasEditedRef.current = true // Mark that user has edited
              }}
              onKeyDown={(e) => {
                // Allow Tab key to insert 4 spaces instead of moving focus
                if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  e.preventDefault()
                  const textarea = e.currentTarget
                  const start = textarea.selectionStart
                  const end = textarea.selectionEnd
                  const newValue = jsonText.substring(0, start) + '    ' + jsonText.substring(end)
                  setJsonText(newValue)
                  // Restore cursor position after tab (4 spaces)
                  setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 4
                  }, 0)
                }
                // Handle Ctrl+F / Cmd+F to show search
                if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                  e.preventDefault()
                  setShowSearch(true)
                }
              }}
              onScroll={(e) => {
                // Sync scroll between textarea and highlight layer
                const textarea = e.currentTarget
                const highlight = highlightRef.current
                if (highlight) {
                  const targetScrollTop = textarea.scrollTop
                  const targetScrollLeft = textarea.scrollLeft
                  
                  // Check if scroll heights match - if not, there's a rendering issue
                  const textareaScrollHeight = textarea.scrollHeight
                  const highlightScrollHeight = highlight.scrollHeight
                  const scrollHeightMismatch = Math.abs(textareaScrollHeight - highlightScrollHeight)
                  
                  // Sync immediately - use scrollTo for more reliable syncing
                  highlight.scrollTo({
                    top: targetScrollTop,
                    left: targetScrollLeft,
                    behavior: 'auto' // Instant, no smooth scrolling
                  })
                  
                  
                  // Double-check after requestAnimationFrame
                  requestAnimationFrame(() => {
                    if (highlight && textarea) {
                      highlight.scrollTo({
                        top: textarea.scrollTop,
                        left: textarea.scrollLeft,
                        behavior: 'auto'
                      })
                    }
                  })
                }
              }}
              className="json-editor-textarea"
              spellCheck={false}
              style={{
                position: 'relative',
                zIndex: 2,
                background: searchTerm ? 'transparent' : undefined,
              }}
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
              Copy JSON
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
