import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { VideoCard } from '../components/VideoCard'
import type { ChannelInfoResult } from '../../../shared/ipc'

type Status = 'loading' | 'ready' | 'error'

export function Channel() {
  const { channelId } = useParams<{ channelId: string }>()
  const [status, setStatus] = useState<Status>('loading')
  const [channel, setChannel] = useState<ChannelInfoResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    if (!channelId) return
    let cancelled = false
    setStatus('loading')

    Promise.all([window.api.getChannel(channelId), window.api.listSubscriptions()]).then(([channelResponse, subs]) => {
      if (cancelled) return
      if (channelResponse.ok) {
        setChannel(channelResponse.data)
        setIsSubscribed(subs.some((sub) => sub.channelId === channelResponse.data.channelId))
        setStatus('ready')
      } else {
        setError(channelResponse.error)
        setStatus('error')
      }
    })

    return () => {
      cancelled = true
    }
  }, [channelId])

  async function toggleSubscription() {
    if (!channel) return
    if (isSubscribed) {
      await window.api.unsubscribe(channel.channelId)
    } else {
      await window.api.subscribe({
        channelId: channel.channelId,
        channelName: channel.name,
        thumbnailUrl: channel.thumbnailUrl
      })
    }
    setIsSubscribed(!isSubscribed)
  }

  if (status === 'loading') return <p className="text-sm text-neutral-400">Cargando canal…</p>
  if (status === 'error' || !channel) return <p className="text-sm text-red-400">{error}</p>

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {channel.thumbnailUrl && (
          <img src={channel.thumbnailUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{channel.name}</h1>
          {channel.subscriberCountText && <p className="text-sm text-neutral-400">{channel.subscriberCountText}</p>}
        </div>
        <button
          type="button"
          onClick={toggleSubscription}
          className={
            isSubscribed
              ? 'shrink-0 rounded px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900'
              : 'shrink-0 rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-white'
          }
        >
          {isSubscribed ? 'Suscripto' : 'Suscribirse'}
        </button>
      </div>

      {channel.videos.length === 0 ? (
        <p className="text-sm text-neutral-400">Este canal no tiene videos en el formato que soportamos todavía.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {channel.videos.map((video) => (
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
