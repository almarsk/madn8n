import { useEffect, useState } from 'react'
import './ValidationBanner.css'

interface ValidationBannerProps {
  isValid: boolean | null
  message: string
  onDismiss?: () => void
}

export default function ValidationBanner({ isValid, message, onDismiss }: ValidationBannerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)

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

      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        handleDismiss()
      }, 5000)

      return () => clearTimeout(timer)
    } else {
      handleDismiss()
    }
  }, [isValid, message])

  const handleDismiss = () => {
    setIsVisible(false)
    // Wait for fade out animation to complete before removing from DOM
    setTimeout(() => {
      setShouldRender(false)
      if (onDismiss) {
        onDismiss()
      }
    }, 300) // Match the fade-out animation duration
  }

  if (!shouldRender || isValid === null) {
    return null
  }

  // Split message by '; ' to create bullet points
  const messageItems = message.split('; ').filter(item => item.trim().length > 0)

  return (
    <div
      className={`validation-banner ${isValid ? 'validation-banner--valid' : 'validation-banner--invalid'} ${isVisible ? 'validation-banner--visible' : 'validation-banner--hidden'}`}
      onClick={handleDismiss}
    >
      <div className="validation-banner-content">
        <span className="validation-banner-icon">{isValid ? '✓' : '✗'}</span>
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
