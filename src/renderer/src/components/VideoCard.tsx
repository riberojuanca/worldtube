import { Link } from 'react-router-dom'

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
}

export function VideoCard({ videoId, title, channelId, channelName, thumbnailUrl, badge, meta }: VideoCardProps) {
  return (
    <div className="group flex flex-col gap-2 rounded-lg p-1 hover:bg-neutral-900">
      <Link to={`/watch/${videoId}`} className="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-900">
        {thumbnailUrl && <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
        {badge && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-xs font-medium">
            {badge}
          </span>
        )}
      </Link>
      <div>
        <Link to={`/watch/${videoId}`}>
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
