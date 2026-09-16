import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LibraryBig, ListMusic, SlidersHorizontal } from 'lucide-react'
import { t, useLocale } from '../i18n/LocaleContext'
import { VideoCard } from '../components/VideoCard'
import { PageLoader } from '../components/PageLoader'
import { RecommendedChannels } from '../components/RecommendedChannels'
import type { RecommendedChannel, SearchCollectionItem, SearchFilters, SearchResultItem } from '../../../shared/ipc'

type Status = 'idle' | 'loading' | 'ready' | 'error'
const defaultFilters: SearchFilters = { type: 'all', uploadDate: 'all', duration: 'all', sort: 'relevance' }

function FilterIcon() {
  return <SlidersHorizontal aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
}

function CollectionCard({ item }: { item: SearchCollectionItem }) {
  const kindLabel = item.kind === 'album' ? t('Álbum') : item.kind === 'podcast' ? t('Podcast') : t('Playlist')
  const href = `/collection/${item.kind}/${encodeURIComponent(item.collectionId)}?title=${encodeURIComponent(item.title)}`
  return <Link to={href} className="group min-w-0 rounded no-underline">
    <div className={`relative overflow-hidden bg-neutral-900 ${item.kind === 'album' ? 'aspect-square rounded-lg' : 'aspect-video rounded'}`}>
      {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" /> : <div className="grid h-full place-items-center text-neutral-600"><LibraryBig aria-hidden="true" className="h-8 w-8" strokeWidth={1.5} /></div>}
      <span className="absolute bottom-2 left-2 rounded bg-black/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">{kindLabel}</span>
      {item.kind === 'playlist' && <div className="absolute inset-y-0 right-0 grid w-14 place-items-center bg-black/65"><ListMusic aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} /></div>}
    </div>
    <h2 className="mt-2 line-clamp-2 break-words text-sm font-medium group-hover:text-white">{item.title}</h2>
    <p className="mt-1 truncate text-xs text-neutral-400">{[item.channelName, item.itemCountText].filter(Boolean).join(' · ')}</p>
  </Link>
}

export function Search() {
  useLocale()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [channels, setChannels] = useState<RecommendedChannel[]>([])
  const [collections, setCollections] = useState<SearchCollectionItem[]>([])
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters)
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(defaultFilters)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!query) {
      setStatus('idle'); setResults([]); setChannels([]); setCollections([])
      return
    }
    let cancelled = false
    setStatus('loading')
    setError(null)
    window.api.search(query, filters).then((response) => {
      if (cancelled) return
      if (response.ok) {
        setResults(response.data)
        setChannels(response.channels ?? [])
        setCollections(response.collections ?? [])
        setStatus('ready')
      } else {
        setError(response.error)
        setStatus('error')
      }
    })
    return () => { cancelled = true }
  }, [query, filters])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters(draftFilters)
    event.currentTarget.closest('details')?.removeAttribute('open')
  }

  const activeFilterCount = Number(filters.type !== 'all') + Number(filters.uploadDate !== 'all') + Number(filters.duration !== 'all') + Number(filters.sort !== 'relevance')
  if (status === 'idle') return null

  return <div>
    <div className="relative mb-5 flex items-center justify-between gap-3 border-b border-neutral-800 pb-3">
      <h1 className="min-w-0 truncate text-lg font-semibold">{t('Resultados para “{query}”', { query })}</h1>
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"><FilterIcon />{t('Filtros')}{activeFilterCount > 0 && <span className="wt-action grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs">{activeFilterCount}</span>}</summary>
        <form onSubmit={applyFilters} className="absolute right-0 z-30 mt-2 grid w-72 gap-3 rounded border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
          <label className="grid gap-1 text-xs text-neutral-400">{t('Tipo')}<select value={draftFilters.type} onChange={(event) => setDraftFilters((value) => ({ ...value, type: event.target.value as SearchFilters['type'] }))} className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white">
            <option value="all">{t('Todo')}</option><option value="videos">{t('Videos')}</option><option value="shorts">Shorts</option><option value="live">{t('En directo')}</option><option value="channels">{t('Canales')}</option><option value="playlists">{t('Playlists')}</option><option value="albums">{t('Álbumes')}</option><option value="podcasts">{t('Podcasts')}</option>
          </select></label>
          <label className="grid gap-1 text-xs text-neutral-400">{t('Fecha de subida')}<select value={draftFilters.uploadDate} onChange={(event) => setDraftFilters((value) => ({ ...value, uploadDate: event.target.value as SearchFilters['uploadDate'] }))} className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white">
            <option value="all">{t('Cualquier fecha')}</option><option value="today">{t('Hoy')}</option><option value="week">{t('Esta semana')}</option><option value="month">{t('Este mes')}</option><option value="year">{t('Este año')}</option>
          </select></label>
          <label className="grid gap-1 text-xs text-neutral-400">{t('Duración')}<select value={draftFilters.duration} onChange={(event) => setDraftFilters((value) => ({ ...value, duration: event.target.value as SearchFilters['duration'] }))} className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white">
            <option value="all">{t('Cualquier duración')}</option><option value="short">{t('Menos de 3 minutos')}</option><option value="medium">{t('De 3 a 20 minutos')}</option><option value="long">{t('Más de 20 minutos')}</option>
          </select></label>
          <label className="grid gap-1 text-xs text-neutral-400">{t('Ordenar por')}<select value={draftFilters.sort} onChange={(event) => setDraftFilters((value) => ({ ...value, sort: event.target.value as SearchFilters['sort'] }))} className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white">
            <option value="relevance">{t('Relevancia')}</option><option value="popularity">{t('Visualizaciones')}</option>
          </select></label>
          <div className="flex justify-end gap-2 border-t border-neutral-800 pt-3"><button type="button" onClick={() => setDraftFilters(defaultFilters)} className="cursor-pointer rounded px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800">{t('Restablecer')}</button><button type="submit" className="wt-action cursor-pointer rounded px-4 py-2 text-sm font-medium">{t('Aplicar')}</button></div>
        </form>
      </details>
    </div>
    {status === 'loading' && <PageLoader />}
    {status === 'error' && <p className="text-sm text-red-400">{error}</p>}
    {status === 'ready' && results.length === 0 && channels.length === 0 && collections.length === 0 && <p className="text-sm text-neutral-400">{t('Sin resultados para “{query}”.', { query })}</p>}
    {status === 'ready' && <>
      {channels.length > 0 && <section className="mb-7"><h2 className="mb-3 text-lg font-semibold">{t('Canales')}</h2><RecommendedChannels channels={channels} /></section>}
      {collections.length > 0 && <section className="mb-7"><h2 className="mb-3 text-lg font-semibold">{filters.type === 'albums' ? t('Álbumes') : filters.type === 'podcasts' ? t('Podcasts') : filters.type === 'playlists' ? t('Playlists') : t('Playlists, álbumes y podcasts')}</h2><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{collections.map((item) => <CollectionCard key={`${item.kind}:${item.collectionId}`} item={item} />)}</div></section>}
      {results.length > 0 && <section><h2 className="mb-3 text-lg font-semibold">{t('Videos')}</h2><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{results.map((video) => <VideoCard key={video.videoId} videoId={video.videoId} title={video.title} channelId={video.channelId} channelName={video.channelName} thumbnailUrl={video.thumbnailUrl} previewUrl={video.previewUrl} badge={video.durationText} meta={[video.viewCountText, video.publishedText].filter(Boolean).join(' · ')} />)}</div></section>}
    </>}
  </div>
}
