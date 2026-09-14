import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChannelAvatar } from '../components/ChannelAvatar'
import { VideoSaveActions } from '../components/VideoSaveButton'
import { VideoThumbnail } from '../components/VideoCard'
import { WATCH_SLOT_ID } from '../player/GlobalPlayerHost'
import { useGlobalPlayer } from '../player/GlobalPlayerContext'
import { PLAYER_SEEK_EVENT } from '../player/events'
import { usePlayerWorkspace } from '../player/PlayerWorkspace'
import { useProfiles } from '../profiles/ProfileContext'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import { useAppTabs, usePageTab } from '../tabs/AppTabs'
import type { SearchResultItem } from '../../../shared/ipc'

type IconName = 'check' | 'clock' | 'copy' | 'eye' | 'tag' | 'thumb'

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, JSX.Element> = {
    check: <path d="m5 12 4 4L19 6" />,
    clock: <path d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    copy: <path d="M8 8h10v10H8zM6 16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />,
    eye: <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
    tag: <path d="M20 10v8a2 2 0 0 1-2 2h-8L4 14V6a2 2 0 0 1 2-2h8l6 6Z M8 8h.01" />,
    thumb: <path d="M7 11v9M7 11H4v9h3M7 11l4-8h1.5a2 2 0 0 1 2 2.3L14 8h4a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 16.8 19H7" />
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  )
}

function parseTimestamp(value: string): number | null {
  const parts = value.split(':').map(Number)
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) return null

  if (parts.length === 2) {
    const [minutes, seconds] = parts
    if (seconds >= 60) return null
    return minutes * 60 + seconds
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    if (minutes >= 60 || seconds >= 60) return null
    return hours * 3600 + minutes * 60 + seconds
  }

  return null
}

function DescriptionWithTimestamps({ text, onSeek }: { text: string; onSeek: (seconds: number) => void }) {
  const nodes = useMemo<ReactNode[]>(() => {
    const parts: ReactNode[] = []
    const timestampRegex = /\b(?:(\d{1,2}):)?\d{1,3}:\d{2}\b/g
    let lastIndex = 0

    for (const match of text.matchAll(timestampRegex)) {
      const value = match[0]
      const index = match.index ?? 0
      const seconds = parseTimestamp(value)
      if (seconds === null) continue

      if (index > lastIndex) parts.push(text.slice(lastIndex, index))
      parts.push(
        <button
          key={`${index}:${value}`}
          type="button"
          onClick={() => onSeek(seconds)}
          className="rounded px-1 font-medium text-sky-300 hover:bg-sky-400/10 hover:text-sky-200"
        >
          {value}
        </button>
      )
      lastIndex = index + value.length
    }

    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts
  }, [onSeek, text])

  return <>{nodes}</>
}

function DetailPill({ icon, text }: { icon: IconName; text: string }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-neutral-900 px-3 text-sm text-neutral-300">
      <Icon name={icon} className="h-3.5 w-3.5 text-neutral-500" />
      <span className="truncate">{text}</span>
    </span>
  )
}

function RelatedVideoRow({ video }: { video: SearchResultItem }) {
  const meta = [video.viewCountText, video.publishedText].filter(Boolean).join(' · ')

  return (
    <article className="group grid grid-cols-[150px_minmax(0,1fr)] gap-2 rounded p-1 transition-colors hover:bg-neutral-900 max-[480px]:grid-cols-[132px_minmax(0,1fr)]">
      <div className="relative aspect-video rounded bg-neutral-900">
        <Link to={`/watch/${video.videoId}`} className="block h-full w-full overflow-hidden rounded" aria-label={video.title}>
          <VideoThumbnail videoId={video.videoId} thumbnailUrl={video.thumbnailUrl} title={video.title} />
          {video.durationText && (
            <span className="absolute bottom-1 right-1 rounded bg-black/85 px-1 py-0.5 text-[11px] font-medium leading-none text-white">
              {video.durationText}
            </span>
          )}
        </Link>
        <VideoSaveActions
          className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-[680px]:opacity-100"
          video={{
            videoId: video.videoId,
            title: video.title,
            channelId: video.channelId,
            channelName: video.channelName,
            thumbnailUrl: video.thumbnailUrl,
            playlistId: null
          }}
        />
      </div>
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
  const { active: isTabActive, id: tabId } = usePageTab()
  const { rename } = useAppTabs()
  const { requestPlayback } = usePlayerWorkspace()
  const globalPlayer = useGlobalPlayer()
  const snapshot = useRef(globalPlayer)
  const openedVideo = useRef<string | null>(null)
  if (globalPlayer.videoId === videoId && globalPlayer.status === 'ready') snapshot.current = globalPlayer
  const {
    playVideo,
    videoId: activeVideoId,
    title,
    channelId,
    channelName,
    channelThumbnailUrl,
    thumbnailUrl,
    subscriberCountText,
    durationText,
    viewCountText,
    likeCountText,
    publishedText,
    category,
    description,
    relatedVideos,
    status,
    error
  } = globalPlayer.videoId === videoId ? globalPlayer : snapshot.current
  const isCurrentVideo = globalPlayer.videoId === videoId
  const { activeProfileId } = useProfiles()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    if (!isTabActive || openedVideo.current === videoId) return
    openedVideo.current = videoId || null
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    setIsDescriptionExpanded(false)
    setCopyState('idle')
    if (videoId && videoId !== activeVideoId) {
      requestPlayback(tabId)
      void globalPlayer.playVideo(videoId)
    }
    // Only re-run when the route param itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, isTabActive])

  useEffect(() => {
    if (isCurrentVideo && title && status === 'ready') rename(tabId, title)
  }, [isCurrentVideo, title, status, tabId, rename])

  useEffect(() => {
    if (!channelId) {
      setIsSubscribed(false)
      return
    }

    let cancelled = false
    window.api.listSubscriptions().then((subs) => {
      if (!cancelled) setIsSubscribed(subs.some((sub) => sub.channelId === channelId))
    })

    return () => {
      cancelled = true
    }
  }, [activeProfileId, channelId])

  async function toggleSubscription() {
    if (!channelId) return
    if (isSubscribed) {
      await window.api.unsubscribe(channelId)
    } else {
      await window.api.subscribe({
        channelId,
        channelName,
        thumbnailUrl: channelThumbnailUrl
      })
    }
    setIsSubscribed((value) => !value)
    window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
  }

  async function copyShareLink() {
    if (!videoId) return
    try {
      await navigator.clipboard.writeText(`https://youtu.be/${videoId}`)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1600)
    } catch {
      setCopyState('error')
    }
  }

  function seekTo(seconds: number) {
    window.dispatchEvent(new CustomEvent(PLAYER_SEEK_EVENT, { detail: { seconds, tabId } }))
  }

  const detailPills: { icon: IconName; text: string }[] = []
  if (viewCountText) detailPills.push({ icon: 'eye', text: viewCountText })
  if (publishedText) detailPills.push({ icon: 'clock', text: publishedText })
  if (durationText) detailPills.push({ icon: 'clock', text: durationText })
  if (category) detailPills.push({ icon: 'tag', text: category })

  return (
    <div className="watch-layout">
      <section className="watch-video-area">
        <div className="watch-video-frame">
          {isCurrentVideo ? <div id={`${WATCH_SLOT_ID}-${tabId}`} className="aspect-video w-full overflow-hidden bg-black" /> : (
            <div className="relative grid aspect-video w-full place-items-center overflow-hidden bg-black">
              {snapshot.current.videoId === videoId && thumbnailUrl && <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-contain opacity-60" />}
              <button type="button" onClick={() => videoId && void globalPlayer.playVideo(videoId)} className="relative rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950">Reproducir video</button>
            </div>
          )}
        </div>
      </section>

      <section className="watch-info-area">
        {status === 'loading' && <p className="mt-4 text-sm text-neutral-400">Cargando…</p>}
        {status === 'error' && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {status === 'ready' && snapshot.current.videoId === videoId && (
          <div className="watch-info-card">
            <h1 className="text-xl font-semibold leading-snug text-neutral-50">{title}</h1>
            {detailPills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {detailPills.map((pill) => (
                  <DetailPill key={`${pill.icon}:${pill.text}`} icon={pill.icon} text={pill.text} />
                ))}
              </div>
            )}

            <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <ChannelAvatar name={channelName} thumbnailUrl={channelThumbnailUrl} className="h-11 w-11" />
                <div className="min-w-0">
                  {channelId ? (
                    <Link to={`/channel/${channelId}`} className="block truncate font-medium text-neutral-200 hover:text-white">
                      {channelName}
                    </Link>
                  ) : (
                    <p className="truncate font-medium text-neutral-200">{channelName}</p>
                  )}
                  {subscriberCountText && <p className="truncate text-sm text-neutral-500">{subscriberCountText}</p>}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {channelId && (
                  <button
                    type="button"
                    onClick={toggleSubscription}
                    className={
                      isSubscribed
                        ? 'inline-flex h-9 items-center gap-2 rounded-full bg-neutral-800 px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-700'
                        : 'inline-flex h-9 items-center gap-2 rounded-full bg-neutral-100 px-4 text-sm font-medium text-neutral-950 hover:bg-white'
                    }
                  >
                    {isSubscribed && <Icon name="check" className="h-4 w-4" />}
                    {isSubscribed ? 'Suscripto' : 'Suscribirse'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-neutral-800 px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
                >
                  <Icon name="copy" className="h-4 w-4" />
                  {copyState === 'copied' ? 'Copiado' : copyState === 'error' ? 'Error' : 'Copiar enlace'}
                </button>
                {videoId && (
                  <VideoSaveActions
                    className="relative"
                    buttonClassName="inline-flex h-9 items-center gap-2 rounded bg-neutral-800 px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
                    label="Guardar"
                    video={{ videoId, title, channelId, channelName, thumbnailUrl, playlistId: null }}
                  />
                )}
                {likeCountText && (
                  <span className="inline-flex h-9 items-center gap-2 rounded-full bg-neutral-800 px-4 text-sm font-medium text-neutral-200">
                    <Icon name="thumb" className="h-4 w-4" />
                    {likeCountText}
                  </span>
                )}
              </div>
            </div>

            {description && (
              <div className="mt-4 rounded-lg bg-neutral-900 p-3">
                <p className={isDescriptionExpanded ? 'whitespace-pre-wrap text-sm leading-6 text-neutral-200' : 'line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-neutral-200'}>
                  <DescriptionWithTimestamps text={description} onSeek={seekTo} />
                </p>
                <button
                  type="button"
                  onClick={() => setIsDescriptionExpanded((value) => !value)}
                  className="mt-2 text-sm font-medium text-neutral-100 hover:text-white"
                >
                  {isDescriptionExpanded ? 'Mostrar menos' : 'Mostrar más'}
                </button>
              </div>
            )}
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
