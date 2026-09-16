import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { t, useLocale } from '../i18n/LocaleContext'
import { NavigationIcon } from '../components/NavigationIcon'
import { PageLoader } from '../components/PageLoader'
import { VideoThumbnail } from '../components/VideoCard'
import { PlaybackLoadingIcon, PlaybackStatusIcon } from '../components/PlaybackStatusIcon'
import { MusicPlayerPanel } from '../player/MusicPlayer'
import { useGlobalPlayer } from '../player/GlobalPlayerContext'
import { usePlayerWorkspace } from '../player/PlayerWorkspace'
import { usePageTab } from '../tabs/AppTabs'
import { useProfiles } from '../profiles/ProfileContext'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import { PLAYER_COMMAND_EVENT, PLAYER_STATE_EVENT, type PlayerStateDetail } from '../player/events'
import type { SavedPlaylist, SavedVideo } from '../../../shared/ipc'

export function Music() {
  useLocale()
  const location = useLocation()
  const { activeProfileId } = useProfiles()
  const { playMusic, videoId, playbackMode, ownerTabId, status } = useGlobalPlayer()
  const { requestPlayback } = usePlayerWorkspace()
  const { id: tabId } = usePageTab()
  const [params, setParams] = useSearchParams()
  const [playlists, setPlaylists] = useState<SavedPlaylist[] | null>(null)
  const [songs, setSongs] = useState<SavedVideo[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playerPaused, setPlayerPaused] = useState(true)
  const [playerStarted, setPlayerStarted] = useState(false)

  useEffect(() => {
    setPlayerStarted(false)
    const onPlayerState = (event: Event) => {
      const detail = (event as CustomEvent<PlayerStateDetail>).detail
      if (detail.tabId === ownerTabId && detail.videoId === videoId) {
        setPlayerPaused(detail.paused)
        setPlayerStarted(detail.started)
      }
    }
    window.addEventListener(PLAYER_STATE_EVENT, onPlayerState)
    window.dispatchEvent(new CustomEvent(PLAYER_COMMAND_EVENT, { detail: { action: 'sync', tabId: ownerTabId } }))
    return () => window.removeEventListener(PLAYER_STATE_EVENT, onPlayerState)
  }, [ownerTabId, videoId])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      setError(null)
      Promise.all([window.api.listSavedPlaylists('music'), window.api.listSavedVideos(undefined, 'music')])
        .then(([nextPlaylists, nextSongs]) => {
          if (cancelled) return
          setPlaylists(nextPlaylists)
          setSongs(nextSongs)
        })
        .catch((cause) => {
          if (!cancelled) {
            setPlaylists([])
            setError(cause instanceof Error ? cause.message : String(cause))
          }
        })
    }
    setPlaylists(null)
    load()
    window.addEventListener(PROFILE_DATA_CHANGED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(PROFILE_DATA_CHANGED_EVENT, load)
    }
  }, [activeProfileId])

  const selected = playlists?.find((playlist) => playlist.id === params.get('playlist')) ?? null
  const visibleSongs = useMemo(() => {
    const source = selected ? songs.filter((song) => song.playlistId === selected.id) : songs
    const unique = new Map<string, SavedVideo>()
    for (const song of source) if (!unique.has(song.videoId)) unique.set(song.videoId, song)
    return [...unique.values()]
  }, [selected, songs])

  const startMusic = (song: SavedVideo, queue: SavedVideo[]) => {
    if ((status === 'loading' || !playerStarted) && song.videoId === videoId) return
    if (playbackMode === 'music' && song.videoId === videoId) {
      window.dispatchEvent(new CustomEvent(PLAYER_COMMAND_EVENT, { detail: { action: 'toggle-play', tabId: ownerTabId } }))
      return
    }
    requestPlayback(tabId)
    void playMusic(song.videoId, queue, `${location.pathname}${location.search}`)
  }

  async function createPlaylist(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const playlist = await window.api.createSavedPlaylist({ name: name.trim(), library: 'music' })
      setName('')
      setCreating(false)
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
      setParams({ playlist: playlist.id })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function removeSong(song: SavedVideo) {
    if (busy) return
    setBusy(true)
    try {
      await window.api.removeSavedVideo(song.videoId, song.playlistId, 'music')
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (playlists === null) return <PageLoader />
  const playerStarting = playbackMode === 'music' && !!videoId && (status === 'loading' || !playerStarted)

  return <section className="w-full">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{t('WorldTube Music')}</h1><p className="mt-1 text-sm text-neutral-400">{t('Tu música y tus playlists, sin salir de la app.')}</p></div>
      <button type="button" onClick={() => setCreating((value) => !value)} className="wt-action flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm font-medium"><NavigationIcon name="music" />{t('Nueva playlist')}</button>
    </header>
    {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
    {creating && <form onSubmit={createPlaylist} className="mb-5 flex gap-2"><input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Nombre de la playlist')} className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" /><button disabled={busy || !name.trim()} className="wt-action cursor-pointer rounded px-4 py-2 text-sm disabled:opacity-50">{t('Crear')}</button></form>}

    <MusicPlayerPanel />

    <div className="mt-7 grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{t('Biblioteca')}</h2>
        <button type="button" onClick={() => setParams({})} className={`mb-1 flex w-full cursor-pointer items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-neutral-900 ${!selected ? 'wt-selected' : ''}`}><NavigationIcon name="music" />{t('Todas las canciones')}</button>
        {playlists.map((playlist) => <button key={playlist.id} type="button" onClick={() => setParams({ playlist: playlist.id })} className={`mb-1 flex w-full cursor-pointer items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-neutral-900 ${selected?.id === playlist.id ? 'wt-selected' : ''}`}><NavigationIcon name="playlists" /><span className="truncate">{playlist.name}</span></button>)}
        {!playlists.length && <p className="px-3 py-2 text-xs text-neutral-500">{t('Aún no tienes playlists de música.')}</p>}
      </aside>
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{selected?.name ?? t('Todas las canciones')}</h2>{visibleSongs.length > 0 && <button type="button" disabled={playerStarting} onClick={() => startMusic(visibleSongs[0], visibleSongs)} className={`${playerStarting ? 'bg-transparent' : 'wt-action'} grid min-h-9 min-w-20 cursor-pointer place-items-center rounded-full px-4 py-2 text-sm font-medium disabled:cursor-wait`}>{playerStarting ? <PlaybackLoadingIcon compact /> : `▶ ${t('Reproducir')}`}</button>}</div>
        <div className="divide-y divide-neutral-800 border-y border-neutral-800">
          {visibleSongs.map((song, index) => {
            const active = playbackMode === 'music' && song.videoId === videoId
            const loading = active && playerStarting
            return <div key={song.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 ${active ? 'bg-white/[0.04]' : ''}`}>
            <div className="grid min-w-0 grid-cols-[28px_64px_minmax(0,1fr)] items-center gap-3">
              <span className="text-center text-xs text-neutral-500">{index + 1}</span>
              <button type="button" disabled={loading} onClick={() => startMusic(song, visibleSongs)} aria-label={loading ? t('Cargando…') : active && !playerPaused ? t('Pausar') : t('Reproducir')} className="group relative aspect-square cursor-pointer overflow-hidden rounded bg-neutral-900 disabled:cursor-wait">
                <VideoThumbnail videoId={song.videoId} thumbnailUrl={song.thumbnailUrl} title={song.title} quality="compact" />
                <span className={`absolute inset-0 grid place-items-center bg-black/55 text-white transition-opacity ${loading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>{loading ? <PlaybackLoadingIcon /> : <PlaybackStatusIcon paused={!active || playerPaused} />}</span>
              </button>
              <button type="button" disabled={loading} onClick={() => startMusic(song, visibleSongs)} className="min-w-0 cursor-pointer text-left disabled:cursor-wait"><span className={`block truncate text-sm font-medium ${active ? 'text-[var(--wt-accent)]' : ''}`}>{song.title}</span><span className="block truncate text-xs text-neutral-400">{song.channelName}</span></button>
            </div>
            <button type="button" disabled={busy} onClick={() => void removeSong(song)} className="cursor-pointer rounded px-2 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-50">{t('Quitar')}</button>
          </div>})}
          {!visibleSongs.length && <p className="py-8 text-center text-sm text-neutral-400">{selected ? t('Esta playlist está vacía.') : t('Guarda canciones desde el botón Music de cualquier video.')}</p>}
        </div>
      </div>
    </div>
  </section>
}
