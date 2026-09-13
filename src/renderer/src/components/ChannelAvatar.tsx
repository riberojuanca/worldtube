import { useEffect, useState } from 'react'

interface ChannelAvatarProps {
  name: string
  thumbnailUrl: string | null
  className?: string
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('') || 'WT'
}

export function ChannelAvatar({ name, thumbnailUrl, className = 'h-8 w-8' }: ChannelAvatarProps) {
  const [hasFailed, setHasFailed] = useState(false)

  useEffect(() => {
    setHasFailed(false)
  }, [thumbnailUrl])

  if (thumbnailUrl && !hasFailed) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        className={`${className} shrink-0 rounded-full bg-neutral-800 object-cover`}
        loading="lazy"
        onError={() => setHasFailed(true)}
      />
    )
  }

  return (
    <div className={`${className} grid shrink-0 place-items-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-300`}>
      {initials(name)}
    </div>
  )
}
