import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { WATCH_SLOT_ID } from '../player/GlobalPlayerHost'
import { useGlobalPlayer } from '../player/GlobalPlayerContext'
import type { SearchResultItem } from '../../../shared/ipc'

function RelatedVideoRow({ video }: { video: SearchResultItem }) {
  const meta = [video.viewCountText, video.publishedText].filter(Boolean).join(' · ')

  return (
    <article className="group grid grid-cols-[150px_minmax(0,1fr)] gap-2 rounded p-1 transition-colors hover:bg-neutral-900 max-[480px]:grid-cols-[132px_minmax(0,1fr)]">
      <Link
        to={`/watch/${video.videoId}`}
        className="relative aspect-video overflow-hidden rounded bg-neutral-900"
        aria-label={video.title}
      >
        {video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
        {video.durationText && (
          <span className="absolute bottom-1 right-1 rounded bg-black/85 px-1 py-0.5 text-[11px] font-medium leading-none text-white">
            {video.durationText}
          </span>
        )}
      </Link>
      <div className="min-w-0 pt-0.5">
        <Link to={`/watch/${video.videoId}`} className="block">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-neutral-100 group-hover:text-white">
            {video.title}
          </h3>
        </Link>
        {video.channelId ? (
          <Link to={`/channel/${video.channelId}`} className="mt-1 block truncate text-xs text-neutral-400 hover:text-neutral-200">
            {video.channelName}
          </Link>
        ) : (
          <p className="mt-1 truncate text-xs text-neutral-400">{video.channelName}</p>
        )}
        {meta && <p className="truncate text-xs text-neutral-500">{meta}</p>}
      </div>
    </article>
  )
}

export function Watch() {
  const { videoId } = useParams<{ videoId: string }>()
  const {
    playVideo,
    videoId: activeVideoId,
    title,
    channelId,
    channelName,
    relatedVideos,
    status,
    error
  } = useGlobalPlayer()

  useEffect(() => {
    if (videoId && videoId !== activeVideoId) {
      playVideo(videoId)
    }
    // Only re-run when the route param itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  return (
    <div className="watch-layout">
      <section className="watch-video-area">
        <div className="watch-video-frame">
          <div id={WATCH_SLOT_ID} className="aspect-video w-full overflow-hidden bg-black" />
        </div>
      </section>

      <section className="watch-info-area">
        {status === 'loading' && <p className="mt-4 text-sm text-neutral-400">Cargando…</p>}
        {status === 'error' && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {status === 'ready' && (
          <div className="watch-info-card">
            <h1 className="text-xl font-semibold leading-snug text-neutral-50">{title}</h1>
            <div className="mt-4 flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-200">
                {channelName ? channelName.slice(0, 2).toUpperCase() : 'WT'}
              </div>
              <div className="min-w-0">
                {channelId ? (
                  <Link to={`/channel/${channelId}`} className="block truncate font-medium text-neutral-200 hover:text-white">
                    {channelName}
                  </Link>
                ) : (
                  <p className="truncate font-medium text-neutral-200">{channelName}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <aside className="watch-sidebar-area">
        {relatedVideos.length > 0 && (
          <div className="watch-sidebar-card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-100">A continuación</h2>
            </div>
            <div className="grid gap-2">
              {relatedVideos.map((video) => (
                <RelatedVideoRow key={video.videoId} video={video} />
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
