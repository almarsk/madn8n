import { useEffect, useState, useRef, useCallback } from 'react'
import './ValidationBanner.css'

interface ValidationBannerProps {
  isValid: boolean | null
  message: string
  onDismiss?: () => void
}

export default function ValidationBanner({ isValid, message, onDismiss }: ValidationBannerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDismiss = useCallback(() => {
    setIsVisible(false)
    // Wait for fade out animation to complete before removing from DOM
    setTimeout(() => {
      setShouldRender(false)
      if (onDismiss) {
        onDismiss()
      }
    }, 300) // Match the fade-out animation duration
  }, [onDismiss])

  const startTimeout = useCallback(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    // Set new timeout for 5 seconds
    timeoutRef.current = setTimeout(() => {
      handleDismiss()
    }, 1500)
  }, [handleDismiss])

  const pauseTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isValid !== null) {
      // Trigger fade in
      setShouldRender(true)
      // Small delay to ensure DOM is ready for animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true)
        })
      })

      // Start the timeout
      startTimeout()

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
      }
    } else {
      handleDismiss()
    }
  }, [isValid, message, startTimeout, handleDismiss])

  if (!shouldRender || isValid === null) {
    return null
  }

  // Split message by '; ' to create bullet points
  const messageItems = message.split('; ').filter(item => item.trim().length > 0)

  // Determine banner type: valid (success), invalid (error), or info (neutral/info messages)
  // For info messages, we use 'valid' styling but with info icon
  const bannerType = isValid === false ? 'invalid' : 'valid'

  return (
    <div
      className={`validation-banner validation-banner--${bannerType} ${isVisible ? 'validation-banner--visible' : 'validation-banner--hidden'}`}
      onClick={handleDismiss}
      onMouseEnter={pauseTimeout}
      onMouseLeave={startTimeout}
    >
      <div className="validation-banner-content">
        <span className="validation-banner-icon">
          {isValid === false ? '✗' : '✓'}
        </span>
        <div className="validation-banner-message">
          {messageItems.length > 1 ? (
            <ul className="validation-banner-list">
              {messageItems.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            <span>{message}</span>
          )}
        </div>
      </div>
    </div>
  )
}
