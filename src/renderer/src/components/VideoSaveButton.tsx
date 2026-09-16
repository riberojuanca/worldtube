import { t, useLocale } from '../i18n/LocaleContext'
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Bookmark, Check, Music2 } from 'lucide-react'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import { useProfiles } from '../profiles/ProfileContext'
import type { LibraryKind, SavedPlaylist, SavedVideo, SaveVideoRequest } from '../../../shared/ipc'

interface VideoSaveButtonProps {
  video: SaveVideoRequest
  className?: string
  buttonClassName?: string
  label?: string
  menuPosition?: 'above' | 'below'
  mode?: 'combined' | 'saved' | 'playlists'
  library?: LibraryKind
}

function SaveIcon({ className = 'h-4 w-4', filled = false }: { className?: string; filled?: boolean }) {
  return <Bookmark aria-hidden="true" className={className} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.8} />
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Check aria-hidden="true" className={className} strokeWidth={1.8} />
}

function MusicIcon() {
  return <Music2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
}

function optionClass(isActive: boolean): string {
  return [
    'flex h-8 w-full items-center justify-between gap-3 rounded px-2 text-left text-sm hover:bg-neutral-800',
    isActive ? 'text-white' : 'text-neutral-300'
  ].join(' ')
}

export function VideoSaveButton({ video, className = '', buttonClassName, label, menuPosition = 'below', mode = 'combined', library = 'video' }: VideoSaveButtonProps) {
  useLocale()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([])
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([])
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const { activeProfileId } = useProfiles()
  const canManageSavedVideos =
    typeof window.api.saveVideo === 'function' &&
    typeof window.api.removeSavedVideo === 'function' &&
    typeof window.api.createSavedPlaylist === 'function'

  useEffect(() => {
    if (!canManageSavedVideos) return
    let cancelled = false
    setIsLoaded(false)
    setSavedVideos([])

    const load = () => window.api.listSavedVideos(undefined, library)
      .then((savedItems) => {
        if (cancelled) return
        setSavedVideos(savedItems)
        setIsLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setStatus(t("No se pudo cargar"))
      })
    void load()
    window.addEventListener(PROFILE_DATA_CHANGED_EVENT, load)

    return () => {
      cancelled = true
      window.removeEventListener(PROFILE_DATA_CHANGED_EVENT, load)
    }
  }, [canManageSavedVideos, activeProfileId, video.videoId, library])

  useEffect(() => {
    if (!isOpen || mode === 'saved' || !canManageSavedVideos) return
    let cancelled = false
    const load = () => window.api.listSavedPlaylists(library).then((items) => {
      if (!cancelled) setPlaylists(items)
    }).catch(() => {
      if (!cancelled) setStatus(t("No se pudo cargar"))
    })
    void load()
    window.addEventListener(PROFILE_DATA_CHANGED_EVENT, load)

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer)

    return () => {
      cancelled = true
      window.removeEventListener(PROFILE_DATA_CHANGED_EVENT, load)
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [isOpen, canManageSavedVideos, mode, activeProfileId, video.videoId, library])

  const savedPlaylistIds = useMemo(() => {
    return new Set(savedVideos.filter((entry) => entry.videoId === video.videoId).map((entry) => entry.playlistId ?? null))
  }, [savedVideos, video.videoId])
  const isInPlaylist = isLoaded && [...savedPlaylistIds].some((id) => id !== null)
  const isActionActive = mode === 'saved' ? isLoaded && savedPlaylistIds.has(null)
    : mode === 'playlists' && isInPlaylist

  async function refreshSavedState() {
    const [playlistItems, savedItems] = await Promise.all([window.api.listSavedPlaylists(library), window.api.listSavedVideos(undefined, library)])
    setPlaylists(playlistItems)
    setSavedVideos(savedItems)
  }

  async function saveTo(playlistId: string | null) {
    try {
      await window.api.saveVideo({ ...video, playlistId, library })
      await refreshSavedState()
      setStatus(t("Guardado"))
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
      window.setTimeout(() => setStatus(null), 1400)
    } catch {
      setStatus(t("No se pudo guardar"))
    }
  }

  async function removeFrom(playlistId: string | null) {
    try {
      await window.api.removeSavedVideo(video.videoId, playlistId, library)
      await refreshSavedState()
      setStatus(t("Quitado"))
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
      window.setTimeout(() => setStatus(null), 1400)
    } catch {
      setStatus(t("No se pudo quitar"))
    }
  }

  async function handleCreatePlaylist(event: FormEvent) {
    event.preventDefault()
    const name = newPlaylistName.trim()
    if (!name) return
    try {
      const playlist = await window.api.createSavedPlaylist({ name, library })
      setNewPlaylistName('')
      await saveTo(playlist.id)
    } catch {
      setStatus(t("No se pudo crear"))
    }
  }

  function stopClick(event: MouseEvent) {
    event.stopPropagation()
  }

  async function toggleSaved() {
    if (isBusy || !isLoaded) return
    setIsBusy(true)
    try {
      if (savedPlaylistIds.has(null)) await removeFrom(null)
      else await saveTo(null)
    } finally { setIsBusy(false) }
  }

  const actionLabel = mode === 'playlists' ? isInPlaylist ? t("En playlists: gestionar playlists") : t("Agregar a playlist")
    : mode === 'saved' ? savedPlaylistIds.has(null) ? t("Quitar de Guardados") : t("Guardar en Guardados")
    : library === 'music' ? t("Guardar en Music") : t("Guardar")

  return (
    <div ref={rootRef} className={className} onClick={stopClick}>
      <button
        type="button"
        data-saved={isActionActive ? 'true' : undefined}
        disabled={!canManageSavedVideos || isBusy || (mode === 'saved' && !isLoaded)}
        onClick={() => { if (mode === 'saved') void toggleSaved(); else setIsOpen((value) => !value) }}
        className={
          buttonClassName ??
          'grid h-8 w-8 place-items-center rounded bg-black/70 text-neutral-100 shadow-lg shadow-black/25 hover:bg-black/85'
        }
        aria-label={actionLabel}
        aria-pressed={mode === 'saved' ? savedPlaylistIds.has(null) : undefined}
        aria-haspopup={mode !== 'saved' ? 'dialog' : undefined}
        aria-expanded={mode !== 'saved' ? isOpen : undefined}
        title={canManageSavedVideos ? actionLabel : t("Reinicia la app para activar Guardar")}
      >
        {library === 'music' ? <MusicIcon /> : mode === 'playlists' ? isInPlaylist ? <CheckIcon /> : <span aria-hidden="true" className="text-xl leading-none">+</span> : <SaveIcon filled={mode === 'saved' && savedPlaylistIds.has(null)} />}
        {label && <span>{label}</span>}
      </button>

      {mode === 'saved' && status && <span role="status" className="sr-only">{status}</span>}
      {isOpen && mode !== 'saved' && (
        <div role="dialog" aria-label={library === 'music' ? t("Guardar en Music") : t("Guardar en playlists")} className={`absolute right-0 z-30 w-64 rounded border border-neutral-800 bg-neutral-950 p-2 shadow-2xl shadow-black/40 ${menuPosition === 'above' ? 'bottom-10' : 'top-9'}`}>
          {mode === 'combined' && <><button
            type="button"
            className={optionClass(savedPlaylistIds.has(null))}
            onClick={() => (savedPlaylistIds.has(null) ? removeFrom(null) : saveTo(null))}
          >
            <span className="truncate">{library === 'music' ? t("Canciones guardadas") : t("Guardados")}</span>
            {savedPlaylistIds.has(null) && <CheckIcon className="wt-accent-text h-4 w-4 shrink-0" />}
          </button>

          <div className="my-2 border-t border-neutral-800" /></>}

          <div className="grid max-h-44 gap-1 overflow-auto pr-1">
            {playlists.length === 0 ? (
              <p className="px-2 py-1 text-xs text-neutral-500">{t("Sin playlists")}</p>
            ) : (
              playlists.map((playlist) => {
                const isSaved = savedPlaylistIds.has(playlist.id)
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    className={optionClass(isSaved)}
                    onClick={() => (isSaved ? removeFrom(playlist.id) : saveTo(playlist.id))}
                  >
                    <span className="truncate">{playlist.name}</span>
                    {isSaved && <CheckIcon className="wt-accent-text h-4 w-4 shrink-0" />}
                  </button>
                )
              })
            )}
          </div>

          <form onSubmit={handleCreatePlaylist} className="mt-2 flex gap-2 border-t border-neutral-800 pt-2">
            <input
              value={newPlaylistName}
              onChange={(event) => setNewPlaylistName(event.target.value)}
              placeholder={t("Nueva playlist")}
              className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 text-sm outline-none focus:border-neutral-600"
            />
            <button type="submit" className="wt-action rounded px-2 text-sm font-medium">
              {t("Crear")}</button>
          </form>

          {status && <p className="mt-2 px-2 text-xs text-neutral-400">{status}</p>}
        </div>
      )}
    </div>
  )
}

function UnifiedSaveButton({ video, className = '', buttonClassName }: Omit<VideoSaveButtonProps, 'mode' | 'library' | 'label' | 'menuPosition'>) {
  useLocale()
  const { activeProfileId } = useProfiles()
  const [open, setOpen] = useState(false)
  const [videoPlaylists, setVideoPlaylists] = useState<SavedPlaylist[]>([])
  const [musicPlaylists, setMusicPlaylists] = useState<SavedPlaylist[]>([])
  const [videoEntries, setVideoEntries] = useState<SavedVideo[]>([])
  const [musicEntries, setMusicEntries] = useState<SavedVideo[]>([])
  const [videoPlaylistName, setVideoPlaylistName] = useState('')
  const [musicPlaylistName, setMusicPlaylistName] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function load() {
    const [nextVideoPlaylists, nextMusicPlaylists, nextVideoEntries, nextMusicEntries] = await Promise.all([
      window.api.listSavedPlaylists('video'), window.api.listSavedPlaylists('music'),
      window.api.listSavedVideos(undefined, 'video'), window.api.listSavedVideos(undefined, 'music')
    ])
    setVideoPlaylists(nextVideoPlaylists)
    setMusicPlaylists(nextMusicPlaylists)
    setVideoEntries(nextVideoEntries)
    setMusicEntries(nextMusicEntries)
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void load().catch(() => { if (!cancelled) setStatus(t('No se pudo cargar')) })
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => { cancelled = true; window.removeEventListener('keydown', closeOnEscape) }
  }, [open, activeProfileId, video.videoId])

  const idsFor = (entries: SavedVideo[]) => new Set(entries.filter((entry) => entry.videoId === video.videoId).map((entry) => entry.playlistId ?? null))
  const videoIds = idsFor(videoEntries)
  const musicIds = idsFor(musicEntries)

  async function toggle(library: LibraryKind, playlistId: string | null) {
    if (busy) return
    setBusy(true)
    setStatus(null)
    const entries = library === 'music' ? musicEntries : videoEntries
    const saved = idsFor(entries).has(playlistId)
    try {
      if (saved) await window.api.removeSavedVideo(video.videoId, playlistId, library)
      else await window.api.saveVideo({ ...video, playlistId, library })
      await load()
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
    } catch {
      setStatus(saved ? t('No se pudo quitar') : t('No se pudo guardar'))
    } finally { setBusy(false) }
  }

  async function createAndSave(event: FormEvent, library: LibraryKind) {
    event.preventDefault()
    const name = (library === 'music' ? musicPlaylistName : videoPlaylistName).trim()
    if (!name || busy) return
    setBusy(true)
    setStatus(null)
    try {
      const playlist = await window.api.createSavedPlaylist({ name, library })
      await window.api.saveVideo({ ...video, playlistId: playlist.id, library })
      if (library === 'music') setMusicPlaylistName('')
      else setVideoPlaylistName('')
      await load()
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
    } catch { setStatus(t('No se pudo crear')) }
    finally { setBusy(false) }
  }

  const section = (library: LibraryKind, title: string, playlists: SavedPlaylist[], ids: Set<string | null>, name: string, setName: (value: string) => void) => <section className="min-w-0">
    <h3 className="mb-2 text-sm font-semibold">{title}</h3>
    <div className="grid max-h-52 gap-1 overflow-y-auto pr-1">
      <button type="button" disabled={busy} onClick={() => void toggle(library, null)} className={optionClass(ids.has(null))}><span>{library === 'music' ? t('Canciones guardadas') : t('Guardados')}</span>{ids.has(null) && <CheckIcon className="wt-accent-text h-4 w-4" />}</button>
      {playlists.map((playlist) => <button key={playlist.id} type="button" disabled={busy} onClick={() => void toggle(library, playlist.id)} className={optionClass(ids.has(playlist.id))}><span className="truncate">{playlist.name}</span>{ids.has(playlist.id) && <CheckIcon className="wt-accent-text h-4 w-4" />}</button>)}
      {!playlists.length && <p className="px-2 py-1 text-xs text-neutral-500">{t('Sin playlists')}</p>}
    </div>
    <form onSubmit={(event) => void createAndSave(event, library)} className="mt-3 flex gap-2 border-t border-neutral-800 pt-3">
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Nueva playlist')} className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm" />
      <button disabled={busy || !name.trim()} className="wt-action cursor-pointer rounded px-3 text-sm disabled:opacity-50">{t('Crear')}</button>
    </form>
  </section>

  return <div className={className} onClick={(event) => event.stopPropagation()}>
    <button type="button" onClick={() => setOpen(true)} className={buttonClassName ?? 'grid h-8 w-8 place-items-center rounded bg-black/70 text-neutral-100 shadow-lg shadow-black/25 hover:bg-black/85'} aria-label={t('Guardar o agregar')} title={t('Guardar o agregar')}><span aria-hidden="true" className="text-xl leading-none">+</span></button>
    {open && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={t('Guardar o agregar')} onClick={(event) => event.stopPropagation()} className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-4"><div className="min-w-0"><h2 className="text-lg font-semibold">{t('Guardar o agregar')}</h2><p className="mt-1 truncate text-xs text-neutral-400">{video.title}</p></div><button type="button" onClick={() => setOpen(false)} aria-label={t('Cerrar')} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-xl hover:bg-neutral-800">×</button></header>
        <div className="grid gap-6 p-5 sm:grid-cols-2">{section('video', t('Videos'), videoPlaylists, videoIds, videoPlaylistName, setVideoPlaylistName)}{section('music', t('Music'), musicPlaylists, musicIds, musicPlaylistName, setMusicPlaylistName)}</div>
        {status && <p role="status" className="border-t border-neutral-800 px-5 py-3 text-xs text-red-400">{status}</p>}
      </div>
    </div>, document.body)}
  </div>
}

export function VideoSaveActions({ video, className = '', buttonClassName }: Omit<VideoSaveButtonProps, 'mode' | 'library'>) {
  return <UnifiedSaveButton video={video} className={className} buttonClassName={buttonClassName} />
}
