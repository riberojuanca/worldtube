import { useEffect, useState } from 'react'

interface ChannelAvatarProps {
  name: string
  thumbnailUrl: string | null
  className?: string
  imageSize?: number
}

function sizedAvatarUrl(source: string | null, size?: number): string | null {
  if (!source) return source
  try {
    const url = new URL(source.startsWith('//') ? `https:${source}` : source)
    if (!['http:', 'https:'].includes(url.protocol) || !['yt3.ggpht.com', 'yt3.googleusercontent.com'].includes(url.hostname)) return source
    url.protocol = 'https:'
    if (size) url.pathname = url.pathname.replace(/=s\d+(?=-|$)/, `=s${size}`)
    return url.href
  } catch { return source }
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('') || 'WT'
}

export function ChannelAvatar({ name, thumbnailUrl, className = 'h-8 w-8', imageSize }: ChannelAvatarProps) {
  const preferredUrl = sizedAvatarUrl(thumbnailUrl, imageSize)
  const fallbackUrl = sizedAvatarUrl(thumbnailUrl)
  const [failedUrls, setFailedUrls] = useState<string[]>([])

  useEffect(() => {
    setFailedUrls([])
  }, [thumbnailUrl, imageSize])

  const currentUrl = [preferredUrl, fallbackUrl].find((url) => url && !failedUrls.includes(url))

  if (currentUrl) {
    return (
      <img
        src={currentUrl}
        alt=""
        className={`${className} shrink-0 rounded-full bg-neutral-800 object-cover`}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrls((urls) => [...urls, currentUrl])}
      />
    )
  }

  return (
    <div className={`${className} grid shrink-0 place-items-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-300`}>
      {initials(name)}
    </div>
  )
}
