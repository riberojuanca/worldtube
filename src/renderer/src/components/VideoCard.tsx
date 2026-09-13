import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { VideoSaveActions } from './VideoSaveButton'
import { useGlobalPlayer } from '../player/GlobalPlayerContext'
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
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return values.filter((value, index): value is string => Boolean(value) && values.indexOf(value) === index)
}

function thumbnailCandidates(videoId: string, thumbnailUrl: string | null): string[] {
  return uniqueValues([
    thumbnailUrl,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/default.jpg`
  ])
}

export function VideoThumbnail({ videoId, thumbnailUrl, title }: { videoId: string; thumbnailUrl: string | null; title: string }) {
  const urls = useMemo(() => thumbnailCandidates(videoId, thumbnailUrl), [thumbnailUrl, videoId])
  const [urlIndex, setUrlIndex] = useState(0)

  useEffect(() => {
    setUrlIndex(0)
  }, [thumbnailUrl, videoId])

  const currentUrl = urls[urlIndex]

  if (!currentUrl) {
    return (
      <div className="grid h-full w-full place-items-center bg-neutral-900 px-3 text-center text-xs font-medium text-neutral-500">
        <span className="line-clamp-2">{title}</span>
      </div>
    )
  }

  return (
    <img
      key={currentUrl}
      src={currentUrl}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setUrlIndex((index) => index + 1)}
    />
  )
}

export function VideoCard({ videoId, title, channelId, channelName, thumbnailUrl, badge, meta, portrait = false, shorts }: VideoCardProps) {
  const { openShort } = useGlobalPlayer()
  const open = shorts ? (event: MouseEvent) => { event.preventDefault(); openShort(videoId, shorts) } : undefined
  return (
    <div className="group flex flex-col gap-2 rounded p-1 hover:bg-neutral-900">
      <div className={`relative w-full rounded bg-neutral-900 ${portrait ? 'aspect-[9/16]' : 'aspect-video'}`}>
        <Link to={`/watch/${videoId}`} onClick={open} className="block h-full w-full overflow-hidden rounded" aria-label={title}>
          <VideoThumbnail videoId={videoId} thumbnailUrl={thumbnailUrl} title={title} />
          {badge && (
            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-xs font-medium">
              {badge}
            </span>
          )}
        </Link>
        <VideoSaveActions
          className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-[680px]:opacity-100"
          video={{ videoId, title, channelId: channelId ?? null, channelName, thumbnailUrl, playlistId: null }}
        />
      </div>
      <div>
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
