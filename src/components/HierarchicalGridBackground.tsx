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
    // First compute distance from optimal zoom for each level
    const levelsWithDistance = GRID_LEVELS.map(level => {
      // Calculate how far zoom is from optimal zoom (in log scale for smoother transitions)
      const zoomRatio = zoom / level.optimalZoom
      const logRatio = Math.log2(zoomRatio)
      const distance = Math.abs(logRatio)
      return { ...level, distance }
    })

    // Find the "primary" grid level (closest to current zoom)
    const primaryLevel = levelsWithDistance.reduce((best, curr) => {
      if (!best) return curr
      return curr.distance < best.distance ? curr : best
    }, levelsWithDistance[0])

    const result = levelsWithDistance.map(levelWithDistance => {
      const { distance } = levelWithDistance
      let opacity = 0

      // Primary level: always visible, with soft falloff as zoom moves away
      if (levelWithDistance === primaryLevel) {
        if (distance <= 0.3) {
          opacity = 0.5
        } else if (distance <= 0.8) {
          opacity = 0.4
        } else if (distance <= 1.5) {
          opacity = 0.3
        } else {
          opacity = 0.2
        }
      } else {
        // Secondary level: only show if it's reasonably close to primary
        const delta = Math.abs(distance - primaryLevel.distance)
        if (delta < 0.4) {
          opacity = 0.18
        } else if (delta < 0.8) {
          opacity = 0.12
        } else {
          opacity = 0
        }
      }

      // Clamp to safe range
      if (opacity < 0) opacity = 0
      if (opacity > 0.5) opacity = 0.5

      return { size: levelWithDistance.size, gap: levelWithDistance.gap, optimalZoom: levelWithDistance.optimalZoom, opacity }
    })

    return result
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
