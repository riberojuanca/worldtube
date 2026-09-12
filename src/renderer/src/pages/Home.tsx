import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { VideoCard } from '../components/VideoCard'
import type { SearchResultItem } from '../../../shared/ipc'

function extractVideoId(input: string): string | null {
  const trimmed = input.trim()
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed

  try {
    const url = new URL(trimmed)
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1) || null
    if (url.hostname.includes('youtube.com')) return url.searchParams.get('v')
  } catch {
    // not a URL either — give up below
  }
  return null
}

type FeedStatus = 'loading' | 'ready' | 'error'

export function Home() {
  const [input, setInput] = useState('')
  const [invalid, setInvalid] = useState(false)
  const navigate = useNavigate()

  const [feedStatus, setFeedStatus] = useState<FeedStatus>('loading')
  const [feed, setFeed] = useState<SearchResultItem[]>([])
  const [feedError, setFeedError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getHomeFeed().then((response) => {
      if (response.ok) {
        setFeed(response.data)
        setFeedStatus('ready')
      } else {
        setFeedError(response.error)
        setFeedStatus('error')
      }
    })
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const videoId = extractVideoId(input)
    if (!videoId) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    navigate(`/watch/${videoId}`)
  }

  return (
    <div>
      <div className="mx-auto mb-8 max-w-xl">
        <h1 className="mb-2 text-2xl font-semibold">WorldTube</h1>
        <p className="mb-4 text-sm text-neutral-400">
          Pegá una URL o un ID de video de YouTube para reproducirlo directamente.
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=... o el ID"
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-white"
          >
            Reproducir
          </button>
        </form>
        {invalid && <p className="mt-2 text-sm text-red-400">No pude reconocer ese ID/URL.</p>}
      </div>

      {feedStatus === 'loading' && <p className="text-sm text-neutral-400">Cargando inicio…</p>}
      {feedStatus === 'error' && <p className="text-sm text-red-400">{feedError}</p>}
      {feedStatus === 'ready' && (
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
