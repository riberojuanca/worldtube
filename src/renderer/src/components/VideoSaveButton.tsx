import { t, useLocale } from '../i18n/LocaleContext'
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import { useProfiles } from '../profiles/ProfileContext'
import type { SavedPlaylist, SavedVideo, SaveVideoRequest } from '../../../shared/ipc'

interface VideoSaveButtonProps {
  video: SaveVideoRequest
  className?: string
  buttonClassName?: string
  label?: string
  menuPosition?: 'above' | 'below'
  mode?: 'combined' | 'saved' | 'playlists'
}

function SaveIcon({ className = 'h-4 w-4', filled = false }: { className?: string; filled?: boolean }) {
  useLocale()
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  useLocale()
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function optionClass(isActive: boolean): string {
  return [
    'flex h-8 w-full items-center justify-between gap-3 rounded px-2 text-left text-sm hover:bg-neutral-800',
    isActive ? 'text-white' : 'text-neutral-300'
  ].join(' ')
}

export function VideoSaveButton({ video, className = '', buttonClassName, label, menuPosition = 'below', mode = 'combined' }: VideoSaveButtonProps) {
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

    const load = () => window.api.listSavedVideos()
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
  }, [canManageSavedVideos, activeProfileId, video.videoId])

  useEffect(() => {
    if (!isOpen || mode === 'saved' || !canManageSavedVideos) return
    let cancelled = false
    const load = () => window.api.listSavedPlaylists().then((items) => {
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
  }, [isOpen, canManageSavedVideos, mode, activeProfileId, video.videoId])

  const savedPlaylistIds = useMemo(() => {
    return new Set(savedVideos.filter((entry) => entry.videoId === video.videoId).map((entry) => entry.playlistId ?? null))
  }, [savedVideos, video.videoId])
  const isInPlaylist = isLoaded && [...savedPlaylistIds].some((id) => id !== null)
  const isActionActive = mode === 'saved' ? isLoaded && savedPlaylistIds.has(null)
    : mode === 'playlists' && isInPlaylist

  async function refreshSavedState() {
    const [playlistItems, savedItems] = await Promise.all([window.api.listSavedPlaylists(), window.api.listSavedVideos()])
    setPlaylists(playlistItems)
    setSavedVideos(savedItems)
  }

  async function saveTo(playlistId: string | null) {
    try {
      await window.api.saveVideo({ ...video, playlistId })
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
      await window.api.removeSavedVideo(video.videoId, playlistId)
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
      const playlist = await window.api.createSavedPlaylist({ name })
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
    : mode === 'saved' ? savedPlaylistIds.has(null) ? t("Quitar de Guardados") : t("Guardar en Guardados") : t("Guardar")

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
        {mode === 'playlists' ? isInPlaylist ? <CheckIcon /> : <span aria-hidden="true" className="text-xl leading-none">+</span> : <SaveIcon filled={mode === 'saved' && savedPlaylistIds.has(null)} />}
        {label && <span>{label}</span>}
      </button>

      {mode === 'saved' && status && <span role="status" className="sr-only">{status}</span>}
      {isOpen && mode !== 'saved' && (
        <div role="dialog" aria-label={t("Guardar en playlists")} className={`absolute right-0 z-30 w-64 rounded border border-neutral-800 bg-neutral-950 p-2 shadow-2xl shadow-black/40 ${menuPosition === 'above' ? 'bottom-10' : 'top-9'}`}>
          {mode === 'combined' && <><button
            type="button"
            className={optionClass(savedPlaylistIds.has(null))}
            onClick={() => (savedPlaylistIds.has(null) ? removeFrom(null) : saveTo(null))}
          >
            <span className="truncate">{t("Guardados")}</span>
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

export function VideoSaveActions({ video, className = '', buttonClassName, label, menuPosition }: Omit<VideoSaveButtonProps, 'mode'>) {
  useLocale()
  return <div className={`flex items-center gap-1 ${className}`}>
    <VideoSaveButton mode="saved" className="relative" video={video} buttonClassName={buttonClassName} label={label} />
    <VideoSaveButton mode="playlists" className="relative" video={video} buttonClassName={buttonClassName}
      label={label ? t("Playlists") : undefined} menuPosition={menuPosition} />
  </div>
}
