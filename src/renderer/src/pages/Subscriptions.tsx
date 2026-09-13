import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { VideoCard } from '../components/VideoCard'
import { useProfiles } from '../profiles/ProfileContext'
import type { SearchResultItem, Subscription } from '../../../shared/ipc'

type FeedStatus = 'loading' | 'ready' | 'error'

export function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[] | null>(null)
  const [feedStatus, setFeedStatus] = useState<FeedStatus>('loading')
  const [feed, setFeed] = useState<SearchResultItem[]>([])
  const [feedError, setFeedError] = useState<string | null>(null)
  const { activeProfileId } = useProfiles()

  useEffect(() => {
    let cancelled = false
    setSubs(null)
    setFeed([])
    setFeedStatus('loading')
    setFeedError(null)

    window.api.listSubscriptions().then((items) => {
      if (!cancelled) setSubs(items)
    })
    window.api.getSubscriptionsFeed().then((response) => {
      if (cancelled) return
      if (response.ok) {
        setFeed(response.data)
        setFeedStatus('ready')
      } else {
        setFeedError(response.error)
        setFeedStatus('error')
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeProfileId])

  if (subs === null) return <p className="text-sm text-neutral-400">Cargando…</p>

  if (subs.length === 0) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-semibold">Suscripciones</h1>
        <p className="text-sm text-neutral-400">
          No estás suscripto a ningún canal. Entrá a un canal desde un video y tocá "Suscribirse".
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        {subs.map((sub) => (
          <Link
            key={sub.channelId}
            to={`/channel/${sub.channelId}`}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-neutral-900"
          >
            {sub.thumbnailUrl && <img src={sub.thumbnailUrl} alt="" className="h-8 w-8 rounded-full object-cover" />}
            <span className="text-sm font-medium">{sub.channelName}</span>
          </Link>
        ))}
      </div>

      {feedStatus === 'loading' && <p className="text-sm text-neutral-400">Cargando videos…</p>}
      {feedStatus === 'error' && <p className="text-sm text-red-400">{feedError}</p>}
      {feedStatus === 'ready' && feed.length === 0 && (
        <p className="text-sm text-neutral-400">Ninguno de tus canales suscriptos tiene videos disponibles.</p>
      )}
      {feedStatus === 'ready' && feed.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {feed.map((video) => (
            <VideoCard
              key={video.videoId}
              videoId={video.videoId}
              title={video.title}
              channelId={video.channelId}
              channelName={video.channelName}
              thumbnailUrl={video.thumbnailUrl}
              badge={video.durationText}
              meta={[video.viewCountText, video.publishedText].filter(Boolean).join(' · ')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
