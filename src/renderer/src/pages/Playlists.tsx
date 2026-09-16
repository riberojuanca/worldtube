import { t, useLocale, locale } from '../i18n/LocaleContext'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useProfiles } from '../profiles/ProfileContext'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import type { SavedPlaylist, SavedVideo } from '../../../shared/ipc'
import { VideoThumbnail } from '../components/VideoCard'
import { NavigationIcon } from '../components/NavigationIcon'
import { PageLoader } from '../components/PageLoader'

function formatUpdatedAt(timestampMs: number): string {
  if (!timestampMs) return t("Sin fecha")
  return new Date(timestampMs).toLocaleDateString(locale())
}

export function Playlists() {
  useLocale()
  const [playlists, setPlaylists] = useState<SavedPlaylist[] | null>(null)
  const [videos, setVideos] = useState<SavedVideo[]>([])
  const { activeProfileId } = useProfiles()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let generation = 0
    const loadPlaylists = () => {
      const current = ++generation
      setError(null)
      Promise.all([window.api.listSavedPlaylists(), window.api.listSavedVideos()]).then(([playlistItems, videoItems]) => {
        if (cancelled || current !== generation) return
        setPlaylists(playlistItems)
        setVideos(videoItems)
      }).catch((cause) => {
        if (!cancelled && current === generation) {
          setError(cause instanceof Error ? cause.message : String(cause))
          setPlaylists([])
        }
      })
    }

    setPlaylists(null)
    setVideos([])
    setCreating(false)
    loadPlaylists()
    window.addEventListener(PROFILE_DATA_CHANGED_EVENT, loadPlaylists)

    return () => {
      cancelled = true
      window.removeEventListener(PROFILE_DATA_CHANGED_EVENT, loadPlaylists)
    }
  }, [activeProfileId])

  const grouped = useMemo(() => {
    const result = new Map<string, SavedVideo[]>()
    for (const video of videos) {
      if (!video.playlistId) continue
      const items = result.get(video.playlistId) ?? []
      items.push(video)
      result.set(video.playlistId, items)
    }
    return result
  }, [videos])
  const selected = playlists?.find((playlist) => playlist.id === params.get('playlist'))
  const selectedVideos = selected ? grouped.get(selected.id) ?? [] : []
  const filtered = useMemo(() => [...(playlists ?? [])]
    .filter((playlist) => `${playlist.name} ${playlist.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, locale()) : sort === 'count'
      ? (grouped.get(b.id)?.length ?? 0) - (grouped.get(a.id)?.length ?? 0) : b.updatedAt - a.updatedAt), [playlists, query, sort, grouped])

  async function createPlaylist(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const playlist = await window.api.createSavedPlaylist({ name: name.trim(), description: description.trim() || undefined })
      setName('')
      setDescription('')
      setCreating(false)
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
      setParams({ playlist: playlist.id })
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }

  async function removeVideo(video: SavedVideo) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await window.api.removeSavedVideo(video.videoId, video.playlistId)
      setVideos((items) => items.filter((item) => item.id !== video.id))
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }

  if (playlists === null) return <PageLoader />

  return (
    <section>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-4">
        <h1 className="text-xl font-semibold">{t('Playlists')}</h1>
        <button type="button" onClick={() => setCreating((value) => !value)} className="wt-action flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm font-medium">
          <NavigationIcon name="playlists" />{t('New playlist')}
        </button>
      </header>
      {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
      {creating && <form onSubmit={createPlaylist} className="mb-6 grid gap-3 border-b border-neutral-800 pb-5">
        <label className="grid gap-1 text-sm">{t('Name')}<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">{t('Description')}<textarea maxLength={1000} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className="resize-y rounded border border-neutral-700 bg-neutral-900 px-3 py-2" /></label>
        <div className="flex gap-2"><button disabled={busy || !name.trim()} className="wt-action cursor-pointer rounded px-4 py-2 text-sm disabled:opacity-50">{t('Create')}</button>
          <button type="button" onClick={() => setCreating(false)} className="cursor-pointer rounded px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-900">{t('Cancel')}</button></div>
      </form>}
      {selected ? <>
        <button type="button" onClick={() => setParams({})} className="wt-link mb-4 cursor-pointer text-sm">{t('All playlists')}</button>
        <div className="mb-6 grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="aspect-video overflow-hidden rounded bg-neutral-900">
            {selectedVideos[0] ? <VideoThumbnail videoId={selectedVideos[0].videoId} thumbnailUrl={selectedVideos[0].thumbnailUrl} title={selected.name} quality="compact" />
              : <div className="grid h-full place-items-center text-neutral-600"><NavigationIcon name="playlists" /></div>}
          </div>
          <div className="min-w-0"><h2 className="break-words text-xl font-semibold">{selected.name}</h2>
            {selected.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-400">{selected.description}</p>}
            <p className="mt-3 text-xs text-neutral-500">{selectedVideos.length} {t('Videos')} · {formatUpdatedAt(selected.updatedAt)}</p>
          </div>
        </div>
        <div className="divide-y divide-neutral-800 border-y border-neutral-800">
          {selectedVideos.map((video, index) => <div key={video.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 py-3">
            <span className="text-center text-xs text-neutral-500">{index + 1}</span>
            <Link to={`/watch/${video.videoId}?playlist=${encodeURIComponent(selected.id)}`} className="flex min-w-0 items-center gap-3 rounded hover:bg-neutral-900">
              <div className="aspect-video w-28 shrink-0 overflow-hidden rounded bg-neutral-900 sm:w-40"><VideoThumbnail videoId={video.videoId} thumbnailUrl={video.thumbnailUrl} title={video.title} allowPreview quality="compact" /></div>
              <div className="min-w-0"><p className="line-clamp-2 break-words text-sm font-medium">{video.title}</p><p className="mt-1 truncate text-xs text-neutral-400">{video.channelName}</p></div>
            </Link>
            <button type="button" disabled={busy} onClick={() => void removeVideo(video)} title={t('Remove from playlist')} className="cursor-pointer rounded px-2 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-50">{t('Remove')}</button>
          </div>)}
          {!selectedVideos.length && <p className="py-6 text-sm text-neutral-400">{t('This playlist is empty')}</p>}
        </div>
      </> : <>
        <div className="mb-5 flex flex-wrap gap-3">
          <input type="search" aria-label={t('Search playlists')} placeholder={t('Search playlists')} value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" />
          <select aria-label={t('Sort playlists')} value={sort} onChange={(event) => setSort(event.target.value)} className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
            <option value="updated">{t('Recently updated')}</option><option value="name">{t('Name')}</option><option value="count">{t('Video count')}</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((playlist) => {
            const items = grouped.get(playlist.id) ?? []
            return <button key={playlist.id} type="button" onClick={() => setParams({ playlist: playlist.id })} className="group min-w-0 cursor-pointer rounded text-left">
              <div className="relative aspect-video overflow-hidden rounded bg-neutral-900">
                {items[0] ? <VideoThumbnail videoId={items[0].videoId} thumbnailUrl={items[0].thumbnailUrl} title={playlist.name} />
                  : <div className="grid h-full place-items-center text-neutral-600"><NavigationIcon name="playlists" /></div>}
                <div className="absolute inset-y-0 right-0 flex w-20 flex-col items-center justify-center gap-2 bg-black/75 text-white"><NavigationIcon name="playlists" /><span className="text-sm tabular-nums">{items.length}</span></div>
              </div>
              <h2 className="mt-3 line-clamp-2 break-words text-sm font-medium group-hover:text-white">{playlist.name}</h2>
              {playlist.description && <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{playlist.description}</p>}
              <p className="mt-1 text-xs text-neutral-500">{t('Updated')} {formatUpdatedAt(playlist.updatedAt)}</p>
            </button>
          })}
        </div>
        {!filtered.length && <p className="py-6 text-sm text-neutral-400">{query ? t('No matching playlists') : t('No hay playlists guardadas.')}</p>}
      </>}
    </section>
  )
}
