import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { VideoCard } from '../components/VideoCard'
import type { SearchResultItem } from '../../../shared/ipc'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function Search() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!query) {
      setStatus('idle')
      setResults([])
      return
    }

    let cancelled = false
    setStatus('loading')
    setError(null)

    window.api.search(query).then((response) => {
      if (cancelled) return
      if (response.ok) {
        setResults(response.data)
        setStatus('ready')
      } else {
        setError(response.error)
        setStatus('error')
      }
    })

    return () => {
      cancelled = true
    }
  }, [query])

  if (status === 'idle') return null
  if (status === 'loading') return <p className="text-sm text-neutral-400">Buscando "{query}"…</p>
  if (status === 'error') return <p className="text-sm text-red-400">{error}</p>

  if (results.length === 0) {
    return <p className="text-sm text-neutral-400">Sin resultados para "{query}".</p>
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {results.map((video) => (
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
  )
}
