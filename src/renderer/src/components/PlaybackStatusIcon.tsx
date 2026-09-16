import { Pause, Play } from 'lucide-react'
import { ClipLoader } from 'react-spinners'
import type { CSSProperties } from 'react'

const gradientLoaderStyle = {
  borderWidth: 3,
  borderTopColor: 'var(--wt-palette-4)',
  borderRightColor: 'color-mix(in srgb, var(--wt-palette-4) 55%, var(--wt-palette-3))',
  borderBottomColor: 'var(--wt-palette-3)',
  borderLeftColor: 'transparent',
  filter: 'drop-shadow(0 0 5px color-mix(in srgb, var(--wt-palette-3) 42%, transparent))'
} satisfies CSSProperties

export function PlaybackStatusIcon({ paused, className = 'h-8 w-8' }: { paused: boolean; className?: string }) {
  const StatusIcon = paused ? Play : Pause
  return <StatusIcon aria-hidden="true" className={className} fill="currentColor" strokeWidth={1.75} />
}

export function GradientLoader({ size, label = 'Cargando' }: { size: number; label?: string }) {
  return <ClipLoader aria-label={label} color="var(--wt-palette-3)" cssOverride={gradientLoaderStyle} size={size} speedMultiplier={0.85} />
}

export function PlaybackLoadingIcon({ compact = false }: { compact?: boolean }) {
  return <GradientLoader size={compact ? 22 : 30} />
}
