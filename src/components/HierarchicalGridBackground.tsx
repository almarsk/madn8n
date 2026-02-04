import { useMemo } from 'react'
import { Background, BackgroundVariant } from 'reactflow'

interface HierarchicalGridBackgroundProps {
  zoom: number
}

// Grid levels: each level has progressively larger dots and gaps
// Each level maintains proportion: gap = size * 12
// Multiple levels can be visible simultaneously with varying opacity
// Level 0: finest (size 1, gap 12) - most visible at zoom >= 1
// Level 1: medium (size 2, gap 24) - most visible at zoom ~0.5
// Level 2: coarse (size 4, gap 48) - most visible at zoom ~0.25
// Level 3: very coarse (size 8, gap 96) - most visible at zoom ~0.125
// Level 4: extra coarse (size 16, gap 192) - most visible at zoom < 0.0625

const GRID_LEVELS = [
  { size: 1, gap: 12, optimalZoom: 1.0 },
  { size: 2, gap: 24, optimalZoom: 0.5 },
  { size: 4, gap: 48, optimalZoom: 0.25 },
  { size: 8, gap: 96, optimalZoom: 0.125 },
  { size: 16, gap: 192, optimalZoom: 0.0625 },
]

export default function HierarchicalGridBackground({ zoom }: HierarchicalGridBackgroundProps) {
  // Calculate opacity for each grid level based on how close zoom is to optimal zoom
  const levelsWithOpacity = useMemo(() => {
    return GRID_LEVELS.map(level => {
      // Calculate how far zoom is from optimal zoom (in log scale for smoother transitions)
      const zoomRatio = zoom / level.optimalZoom
      const logRatio = Math.log2(zoomRatio)
      
      // Opacity peaks at optimal zoom and fades as you move away
      // Use a bell curve-like function for smooth transitions
      const distance = Math.abs(logRatio)
      let opacity = 0
      
      if (distance <= 0.5) {
        // At optimal zoom, softer opacity
        opacity = 0.3
      } else if (distance <= 1) {
        // Fade out as you move away
        opacity = 0.3 * (1 - (distance - 0.5) * 2)
      } else if (distance <= 2) {
        // Continue fading
        opacity = 0.15 * (1 - (distance - 1))
      } else {
        // Very low opacity when far from optimal
        opacity = 0.05
      }
      
      // Ensure minimum visibility threshold
      if (opacity < 0.08) {
        opacity = 0
      }
      
      return { ...level, opacity: Math.max(0, Math.min(0.3, opacity)) }
    })
  }, [zoom])

  return (
    <>
      {levelsWithOpacity.map((level, index) => {
        if (level.opacity <= 0) return null
        
        return (
          <Background
            key={`grid-level-${index}`}
            variant={BackgroundVariant.Dots}
            gap={level.gap}
            size={level.size}
            color="#64748b"
            style={{
              opacity: level.opacity,
              pointerEvents: 'none',
            }}
          />
        )
      })}
    </>
  )
}
