import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { VideoSaveActions } from './VideoSaveButton'
import { useGlobalPlayer } from '../player/GlobalPlayerContext'
import { usePageTab } from '../tabs/AppTabs'
import { VideoHoverPreview } from './VideoHoverPreview'
import type { SearchResultItem } from '../../../shared/ipc'

interface VideoCardProps {
  videoId: string
  title: string
  channelId?: string | null
  channelName: string
  thumbnailUrl: string | null
  /** Shown as an overlay on the thumbnail, e.g. duration. */
  badge?: string | null
  /** Shown under the channel name, e.g. views/published or watched date. */
  meta?: string | null
  portrait?: boolean
  shorts?: SearchResultItem[]
  featured?: boolean
  alignedFooter?: boolean
  previewUrl?: string | null
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return values.filter((value, index): value is string => Boolean(value) && values.indexOf(value) === index)
}

function thumbnailCandidates(videoId: string, thumbnailUrl: string | null, portrait: boolean): string[] {
  return uniqueValues([
    portrait ? thumbnailUrl : null,
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    thumbnailUrl,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/default.jpg`
  ])
}

export function VideoThumbnail({ videoId, thumbnailUrl, title, portrait = false, previewUrl, allowPreview = false }: { videoId: string; thumbnailUrl: string | null; title: string; portrait?: boolean; previewUrl?: string | null; allowPreview?: boolean }) {
  const urls = useMemo(() => thumbnailCandidates(videoId, thumbnailUrl, portrait), [thumbnailUrl, videoId, portrait])
  const [urlIndex, setUrlIndex] = useState(0)
  const { active } = usePageTab()
  const [previewing, setPreviewing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const stopPreview = () => { clearTimeout(timer.current); setPreviewing(false) }

  useEffect(() => {
    clearTimeout(timer.current)
    setPreviewing(false)
    return () => clearTimeout(timer.current)
  }, [videoId, active, portrait])

  useEffect(() => {
    const stop = () => { clearTimeout(timer.current); setPreviewing(false) }
    document.addEventListener('visibilitychange', stop)
    window.addEventListener('blur', stop)
    window.addEventListener('resize', stop)
    return () => { document.removeEventListener('visibilitychange', stop); window.removeEventListener('blur', stop); window.removeEventListener('resize', stop) }
  }, [])

  useEffect(() => {
    setUrlIndex(0)
  }, [thumbnailUrl, videoId, portrait])

  const currentUrl = urls[urlIndex]

  if (!currentUrl) {
    return (
      <div className="grid h-full w-full place-items-center bg-neutral-900 px-3 text-center text-xs font-medium text-neutral-500">
        <span className="line-clamp-2">{title}</span>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded"
      onPointerEnter={(event) => {
        if (!allowPreview || !active || portrait || event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setPreviewing(true), 500)
      }}
      onPointerLeave={stopPreview} onPointerDown={stopPreview}>
    <img
      key={currentUrl}
      src={currentUrl}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth <= 120 && urlIndex < urls.length - 1) setUrlIndex((index) => index === urlIndex ? index + 1 : index)
      }}
      onError={() => setUrlIndex((index) => index === urlIndex ? index + 1 : index)}
    />
    {active && previewing && <VideoHoverPreview videoId={videoId} previewUrl={previewUrl} />}
    </div>
  )
}

export function VideoCard({ videoId, title, channelId, channelName, thumbnailUrl, badge, meta, portrait = false, shorts, featured = false, alignedFooter = false, previewUrl }: VideoCardProps) {
  const { openShort } = useGlobalPlayer()
  const open = shorts ? (event: MouseEvent) => { event.preventDefault(); openShort(videoId, shorts) } : undefined
  return (
    <div className={`group flex flex-col gap-2 rounded p-1 hover:bg-neutral-900 ${featured ? 'h-full' : ''}`}>
      <div className={`relative w-full rounded bg-neutral-900 ${portrait ? 'aspect-[9/16]' : 'aspect-video'}`}>
        <Link to={`/watch/${videoId}`} onClick={open} className="block h-full w-full overflow-hidden rounded" aria-label={title}>
          <VideoThumbnail videoId={videoId} thumbnailUrl={thumbnailUrl} title={title} portrait={portrait} previewUrl={previewUrl} allowPreview={badge !== 'LIVE'} />
          {badge && (
            <span className={`absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-xs font-medium ${badge === 'LIVE' ? 'wt-live-badge' : ''}`}>
              {badge}
            </span>
          )}
        </Link>
        <VideoSaveActions
          className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-[680px]:opacity-100"
          video={{ videoId, title, channelId: channelId ?? null, channelName, thumbnailUrl, playlistId: null }}
        />
      </div>
      <div className={`shrink-0 ${alignedFooter ? 'lg:h-20' : ''}`}>
        <Link to={`/watch/${videoId}`} onClick={open}>
          <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-white">{title}</p>
        </Link>
        {channelId ? (
          <Link to={`/channel/${channelId}`} className="mt-1 block truncate text-xs text-neutral-400 hover:text-neutral-200">
            {channelName}
          </Link>
        ) : (
          <p className="mt-1 truncate text-xs text-neutral-400">{channelName}</p>
        )}
        {meta && <p className="truncate text-xs text-neutral-500">{meta}</p>}
      </div>
    </div>
  )
}
