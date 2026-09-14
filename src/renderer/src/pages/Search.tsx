import { t, useLocale } from '../i18n/LocaleContext'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { VideoCard } from '../components/VideoCard'
import { RecommendedChannels } from '../components/RecommendedChannels'
import type { RecommendedChannel, SearchResultItem } from '../../../shared/ipc'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function Search() {
  useLocale()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [channels, setChannels] = useState<RecommendedChannel[]>([])
  const [mode, setMode] = useState<'all' | 'videos' | 'channels'>('all')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!query) {
      setStatus('idle')
      setResults([])
      setChannels([])
      return
    }

    let cancelled = false
    setStatus('loading')
    setError(null)

    window.api.search(query).then((response) => {
      if (cancelled) return
      if (response.ok) {
        setResults(response.data)
        setChannels(response.channels ?? [])
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
  if (status === 'loading') return <p className="text-sm text-neutral-400">{t("Buscando \"")}{query}{t("\"…")}</p>
  if (status === 'error') return <p className="text-sm text-red-400">{error}</p>

  if (results.length === 0 && channels.length === 0) {
    return <p className="text-sm text-neutral-400">{t("Sin resultados para \"")}{query}".</p>
  }

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-neutral-800" role="tablist" aria-label={t('Search results')}>
        {(['all', 'videos', 'channels'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={mode === item}
          onClick={() => setMode(item)} className={`cursor-pointer border-b-2 px-4 py-2 text-sm ${mode === item ? 'wt-accent-text border-current' : 'border-transparent text-neutral-400 hover:text-white'}`}>
          {t(item === 'all' ? 'All' : item === 'videos' ? 'Videos' : 'Channels')}
        </button>)}
      </div>
      {mode !== 'videos' && channels.length > 0 && <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">{t('Channels')}</h2>
        <RecommendedChannels channels={channels} />
      </section>}
      {mode === 'channels' && !channels.length && <p className="text-sm text-neutral-400">{t('No channels found')}</p>}
      {mode !== 'channels' && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
      </div>}
    </div>
  )
}
