import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ChannelAvatar } from '../components/ChannelAvatar'
import { VideoCard } from '../components/VideoCard'
import { useProfiles } from '../profiles/ProfileContext'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import type { ChannelInfoResult, ChannelPageResult, ChannelPlaylistItem, ChannelTab, SearchResultItem } from '../../../shared/ipc'

const TAB_LABELS: Record<ChannelTab, string> = {
  home: 'Inicio', videos: 'Videos', shorts: 'Shorts', live: 'Directos', playlists: 'Playlists',
  podcasts: 'Podcasts', releases: 'Lanzamientos', courses: 'Cursos', community: 'Comunidad', about: 'Informacion', search: 'Buscar'
}

const OPTION_LABELS: Record<string, string> = { Latest: 'Mas recientes', Newest: 'Mas recientes', Popular: 'Populares', Oldest: 'Mas antiguos' }

function ChannelOption({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (value: string) => void }) {
  if (values.length < 2) return null
  return <label className="flex min-w-0 items-center gap-2 text-sm text-neutral-400">{label}
    <select value={value || values[0]} onChange={(event) => onChange(event.target.value)} className="min-w-0 max-w-full rounded bg-neutral-800 px-3 py-2 text-neutral-100">
      {values.map((item) => <option key={item} value={item}>{OPTION_LABELS[item] ?? item}</option>)}
    </select>
  </label>
}

function mergeUnique<T>(previous: T[], incoming: T[], key: (item: T) => string): T[] {
  return Array.from(new Map([...previous, ...incoming].map((item) => [key(item), item])).values())
}

function VideoGrid({ videos, portrait = false }: { videos: SearchResultItem[]; portrait?: boolean }) {
  return <div className={`grid gap-4 ${portrait ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
    {videos.map((video) => <VideoCard key={video.videoId} {...video} portrait={portrait} shorts={portrait ? videos : undefined} badge={video.durationText}
      meta={[video.viewCountText, video.publishedText].filter(Boolean).join(' · ')} />)}
  </div>
}

function PlaylistTile({ playlist, onOpen }: { playlist: ChannelPlaylistItem; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)
  return <button type="button" onClick={onOpen} className="group min-w-0 rounded p-1 text-left hover:bg-neutral-900">
    <div className="relative aspect-video overflow-hidden rounded bg-neutral-900">
      {playlist.thumbnailUrl && !failed ? <img src={playlist.thumbnailUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        : <span className="grid h-full place-items-center px-4 text-center text-sm text-neutral-500">{playlist.title}</span>}
      <span className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-1 text-right text-xs">{playlist.videoCountText || 'Playlist'}</span>
    </div>
    <p className="mt-2 line-clamp-2 text-sm font-medium">{playlist.title}</p>
  </button>
}

export function Channel() {
  const { channelId } = useParams<{ channelId: string }>()
  const [params, setParams] = useSearchParams()
  const [channel, setChannel] = useState<ChannelInfoResult | null>(null)
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [page, setPage] = useState<ChannelPageResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subscriptionBusy, setSubscriptionBusy] = useState(false)
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '')
  const [retry, setRetry] = useState(0)
  const [bannerFailed, setBannerFailed] = useState(false)
  const [automaticLoads, setAutomaticLoads] = useState(0)
  const automaticLoadCounts = useRef(new Map<string, number>())
  const { activeProfileId } = useProfiles()
  const cache = useRef(new Map<string, ChannelPageResult>())
  const generation = useRef(0)
  const busy = useRef(false)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const tabs: ChannelTab[] = channel?.tabs ?? ['videos', 'about']
  const requestedTab = params.get('tab') as ChannelTab | null
  const tab = requestedTab && tabs.includes(requestedTab) ? requestedTab : tabs[0]
  const filter = params.get('filter') ?? ''
  const sort = params.get('sort') ?? ''
  const secondaryFilter = params.get('secondary') ?? ''
  const contentType = params.get('type') ?? ''
  const query = params.get('q') ?? ''
  const playlistId = params.get('playlist') ?? ''
  const pageKey = JSON.stringify([channelId, tab, filter, sort, secondaryFilter, contentType, query, playlistId])

  useEffect(() => {
    if (!channelId) return
    let cancelled = false
    setChannel(null)
    setHeaderError(null)
    setBannerFailed(false)
    Promise.all([window.api.getChannel(channelId), window.api.listSubscriptions()])
      .then(([response, subscriptions]) => {
        if (cancelled) return
        if (!response.ok) { setHeaderError(response.error); return }
        setChannel(response.data)
        setIsSubscribed(subscriptions.some((subscription) => subscription.channelId === response.data.channelId))
      }).catch((reason) => { if (!cancelled) setHeaderError(String(reason)) })
    return () => { cancelled = true }
  }, [activeProfileId, channelId])

  useEffect(() => { setSearchInput(query) }, [query])

  useEffect(() => {
    const current = ++generation.current
    busy.current = false
    setError(null)
    setPage(null)
    setLoading(false)
    setAutomaticLoads(automaticLoadCounts.current.get(pageKey) ?? 0)
    if (!channel || !channelId) return
    const cached = cache.current.get(pageKey)
    if (cached) { setPage(cached); return }
    if (typeof window.api.getChannelPage !== 'function') {
      setError('Reinicia WorldTube para cargar las secciones del canal.')
      return
    }
    busy.current = true
    setLoading(true)
    window.api.getChannelPage({ channelId: channel.channelId, tab, filter: filter || undefined, sort: sort || undefined,
      secondaryFilter: secondaryFilter || undefined, contentType: contentType || undefined, query, playlistId: playlistId || undefined })
      .then((response) => {
        if (generation.current !== current) return
        if (!response.ok) { setError(response.error); return }
        cache.current.set(pageKey, response.data)
        if (cache.current.size > 30) cache.current.delete(cache.current.keys().next().value!)
        setPage(response.data)
      }).catch((reason) => { if (generation.current === current) setError(String(reason)) })
      .finally(() => { if (generation.current === current) { busy.current = false; setLoading(false) } })
    return () => { generation.current++ }
  }, [channel, channelId, pageKey, tab, filter, sort, secondaryFilter, contentType, query, playlistId, retry])

  const loadMore = useCallback(async (automatic = false) => {
    if (!page?.continuation || !channel || busy.current) return
    if (automatic && (automaticLoadCounts.current.get(pageKey) ?? 0) >= 3) return
    const current = generation.current
    busy.current = true
    setLoading(true)
    setError(null)
    try {
      const response = await window.api.getChannelPage({ channelId: channel.channelId, tab, continuation: page.continuation,
        playlistId: playlistId || undefined })
      if (generation.current !== current) return
      if (!response.ok) { setError(response.error); return }
      const merged: ChannelPageResult = { ...response.data,
        videos: mergeUnique(page.videos, response.data.videos, (video) => video.videoId),
        playlists: mergeUnique(page.playlists, response.data.playlists, (playlist) => playlist.playlistId),
        posts: mergeUnique(page.posts, response.data.posts, (post) => post.id),
        sections: [...page.sections, ...response.data.sections] }
      cache.current.set(pageKey, merged)
      if (automatic) {
        const count = (automaticLoadCounts.current.get(pageKey) ?? 0) + 1
        automaticLoadCounts.current.set(pageKey, count)
        setAutomaticLoads(count)
      }
      setPage(merged)
    } catch (reason) { if (generation.current === current) setError(String(reason)) }
    finally { if (generation.current === current) { busy.current = false; setLoading(false) } }
  }, [channel, page, pageKey, tab, playlistId])

  useEffect(() => {
    if (!page?.continuation || automaticLoads >= 3 || loading || error || !sentinel.current) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void loadMore(true) }, { rootMargin: '400px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [page?.continuation, automaticLoads, loading, error, loadMore])

  function changeTab(nextTab: ChannelTab) { setParams({ tab: nextTab }) }
  function changeOption(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.set('tab', tab)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next)
  }
  function searchChannel(event: FormEvent) {
    event.preventDefault()
    setParams({ tab: 'search', q: searchInput.trim() })
  }
  function openPlaylist(playlist: ChannelPlaylistItem) { setParams({ tab, playlist: playlist.playlistId, title: playlist.title }) }
  function renderPlaylists(playlists: ChannelPlaylistItem[]) {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {playlists.map((playlist) => <PlaylistTile key={playlist.playlistId} playlist={playlist} onOpen={() => openPlaylist(playlist)} />)}
    </div>
  }
  async function toggleSubscription() {
    if (!channel || subscriptionBusy) return
    setSubscriptionBusy(true)
    try {
      if (isSubscribed) await window.api.unsubscribe(channel.channelId)
      else await window.api.subscribe({ channelId: channel.channelId, channelName: channel.name, thumbnailUrl: channel.thumbnailUrl })
      setIsSubscribed((value) => !value)
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
    } catch (reason) { setError(String(reason)) }
    finally { setSubscriptionBusy(false) }
  }

  if (headerError) return <p role="alert" className="text-sm text-red-400">{headerError}</p>
  if (!channel) return <p className="text-sm text-neutral-400">Cargando canal...</p>
  const empty = page && !page.about && page.videos.length === 0 && page.playlists.length === 0 && page.posts.length === 0 && page.sections.length === 0

  return <div className="min-w-0">
    {channel.bannerUrl && !bannerFailed && <div className="mb-6 aspect-[6/1] min-h-20 overflow-hidden rounded bg-neutral-900">
      <img src={channel.bannerUrl} alt="" onError={() => setBannerFailed(true)} className="h-full w-full object-cover" />
    </div>}
    <header className="mb-5 flex flex-wrap items-center gap-4">
      <ChannelAvatar name={channel.name} thumbnailUrl={channel.thumbnailUrl} className="h-20 w-20 shrink-0" />
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-2xl font-semibold">{channel.name}</h1>
        {channel.subscriberCountText && <p className="mt-1 text-sm text-neutral-400">{channel.subscriberCountText}</p>}
        {channel.description && <button type="button" onClick={() => changeTab('about')} className="mt-2 line-clamp-2 text-left text-sm text-neutral-400 hover:text-neutral-200">{channel.description}</button>}
      </div>
      <button type="button" disabled={subscriptionBusy} onClick={toggleSubscription}
        className={`shrink-0 rounded px-4 py-2 text-sm font-medium ${isSubscribed ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-950 hover:bg-white'}`}>
        {isSubscribed ? 'Suscripto' : 'Suscribirse'}
      </button>
    </header>
    <div role="tablist" aria-label="Secciones del canal" className="mb-5 flex gap-5 overflow-x-auto border-b border-neutral-800">
      {tabs.map((item) => <button key={item} type="button" role="tab" id={`channel-tab-${item}`} aria-controls="channel-content" aria-selected={tab === item}
        tabIndex={tab === item ? 0 : -1}
        onKeyDown={(event) => {
          const index = tabs.indexOf(item)
          const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
          if (nextIndex < 0) return
          event.preventDefault()
          changeTab(tabs[nextIndex])
          document.getElementById(`channel-tab-${tabs[nextIndex]}`)?.focus()
        }}
        onClick={() => changeTab(item)} className={`shrink-0 border-b-2 py-3 text-sm font-medium ${tab === item ? 'border-white text-white' : 'border-transparent text-neutral-400 hover:text-white'}`}>
        {TAB_LABELS[item]}
      </button>)}
    </div>
    <div id="channel-content" role="tabpanel" aria-labelledby={`channel-tab-${tab}`} aria-busy={loading}>
      {playlistId && <div className="mb-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => changeTab(tab)} className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700">Volver</button>
        <h2 className="min-w-0 break-words text-lg font-semibold">{params.get('title') || 'Playlist'}</h2>
      </div>}
      {tab === 'search' && !playlistId && <form onSubmit={searchChannel} className="mb-5 flex max-w-xl gap-2">
        <input type="search" aria-label="Buscar en este canal" placeholder="Buscar en este canal" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
        <button type="submit" className="rounded bg-neutral-800 px-4 text-sm hover:bg-neutral-700">Buscar</button>
      </form>}
      {!playlistId && page && [page.filters, page.sorts, page.secondaryFilters, page.contentTypes].some((options) => options.length > 1) && <div className="mb-5 flex flex-wrap items-center gap-3">
        <ChannelOption label="Ordenar" values={page.filters} value={filter} onChange={(value) => changeOption('filter', value)} />
        <ChannelOption label="Ordenar listas" values={page.sorts} value={sort} onChange={(value) => changeOption('sort', value)} />
        <ChannelOption label="Mostrar" values={page.secondaryFilters} value={secondaryFilter} onChange={(value) => changeOption('secondary', value)} />
        <ChannelOption label="Categoria" values={page.contentTypes} value={contentType} onChange={(value) => changeOption('type', value)} />
      </div>}
      {page?.about && <div className="max-w-3xl space-y-6">
        <section><h2 className="mb-3 text-lg font-semibold">Descripcion</h2><p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{page.about.description || 'Sin descripcion'}</p></section>
        {page.about.details.length > 0 && <section className="border-t border-neutral-800 pt-5"><h2 className="mb-3 text-lg font-semibold">Datos del canal</h2>
          {page.about.details.map((detail, index) => <p key={index} className="mb-2 text-sm text-neutral-400">{detail}</p>)}
        </section>}
        {page.about.links.length > 0 && <section className="border-t border-neutral-800 pt-5"><h2 className="mb-3 text-lg font-semibold">Enlaces</h2>
          {page.about.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="mb-2 block break-words text-sm text-emerald-400 hover:underline">{link.title}</a>)}
        </section>}
      </div>}
      {tab === 'home' && !playlistId && (page?.sections.length ?? 0) > 0 ? <div className="space-y-8">
        {page!.sections.map((section, index) => <section key={`${section.title}-${index}`} className="border-b border-neutral-800 pb-6">
          <h2 className="mb-4 text-lg font-semibold">{section.title}</h2>
          {section.videos.length > 0 && <VideoGrid videos={section.videos} portrait={/shorts/i.test(section.title)} />}
          {section.playlists.length > 0 && renderPlaylists(section.playlists)}
        </section>)}
      </div> : <>
        {(page?.videos.length ?? 0) > 0 && <VideoGrid videos={page!.videos} portrait={tab === 'shorts' && !playlistId} />}
        {(page?.playlists.length ?? 0) > 0 && <div className={page!.videos.length ? 'mt-6' : ''}>{renderPlaylists(page!.playlists)}</div>}
      </>}
      {(page?.posts.length ?? 0) > 0 && <div className="mt-5 max-w-3xl divide-y divide-neutral-800">
        {page!.posts.map((post) => <article key={post.id} className="py-6">
          <p className="mb-3 text-xs text-neutral-500">{post.publishedText}</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200">{post.text}</p>
          {post.images.length > 0 && <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">{post.images.map((url) => <img key={url} src={url} alt="" loading="lazy" className="max-h-[480px] w-full rounded object-contain" />)}</div>}
          {post.pollChoices.length > 0 && <ul className="mt-4 space-y-2">{post.pollChoices.map((choice, index) => <li key={index} className="rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300">{choice}</li>)}</ul>}
          {post.videos.length > 0 && <div className="mt-4"><VideoGrid videos={post.videos} /></div>}
          {post.playlists.length > 0 && <div className="mt-4">{renderPlaylists(post.playlists)}</div>}
        </article>)}
      </div>}
      {empty && !loading && !error && <p className="py-8 text-sm text-neutral-400">{tab === 'search' ? query ? 'Sin resultados en este canal.' : 'Buscar en este canal' : 'No hay contenido publico en esta seccion.'}</p>}
      {error && <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 text-sm text-red-400">
        <p>{error}</p><button type="button" onClick={() => { if (page?.continuation) void loadMore(); else { cache.current.delete(pageKey); setRetry((value) => value + 1) } }} className="rounded bg-neutral-800 px-3 py-2 text-neutral-200">Reintentar</button>
        {page?.continuation && <button type="button" onClick={() => { cache.current.delete(pageKey); setRetry((value) => value + 1) }} className="rounded bg-neutral-800 px-3 py-2 text-neutral-200">Recargar seccion</button>}
      </div>}
      <div ref={sentinel} className="mt-6 flex min-h-12 justify-center">
        {loading ? <p role="status" className="text-sm text-neutral-400">Cargando...</p> : page?.continuation && automaticLoads >= 3 && <button type="button" onClick={() => void loadMore()} className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700">Cargar mas</button>}
      </div>
    </div>
  </div>
}
