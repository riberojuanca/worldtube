import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { SquarePlay } from 'lucide-react'
import { t, useLocale } from '../i18n/LocaleContext'
import { PageLoader } from '../components/PageLoader'
import { VideoSaveActions } from '../components/VideoSaveButton'
import { VideoThumbnail } from '../components/VideoCard'
import { PlaybackLoadingIcon, PlaybackStatusIcon } from '../components/PlaybackStatusIcon'
import { useGlobalPlayer, type MusicQueueItem } from '../player/GlobalPlayerContext'
import { MusicPlayerPanel } from '../player/MusicPlayer'
import { usePlayerWorkspace } from '../player/PlayerWorkspace'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import { PLAYER_COMMAND_EVENT, PLAYER_STATE_EVENT, type PlayerStateDetail } from '../player/events'
import { usePageTab } from '../tabs/AppTabs'
import type { LibraryKind, SearchCollectionItem, SearchResultItem } from '../../../shared/ipc'

export function Collection() {
  useLocale()
  const location = useLocation()
  const { kind: rawKind, collectionId = '' } = useParams()
  const [params] = useSearchParams()
  const { playMusic, playbackMode, musicSourcePath, videoId: activeVideoId, ownerTabId, status } = useGlobalPlayer()
  const { requestPlayback } = usePlayerWorkspace()
  const { id: tabId } = usePageTab()
  const [videos, setVideos] = useState<SearchResultItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [playerPaused, setPlayerPaused] = useState(true)
  const [playerStarted, setPlayerStarted] = useState(false)
  const kind: SearchCollectionItem['kind'] = rawKind === 'album' || rawKind === 'podcast' ? rawKind : 'playlist'
  const title = params.get('title') || (kind === 'album' ? t('Álbum') : kind === 'podcast' ? t('Podcast') : t('Playlist'))
  const library: LibraryKind = kind === 'playlist' ? 'video' : 'music'

  useEffect(() => {
    setPlayerStarted(false)
    const onPlayerState = (event: Event) => {
      const detail = (event as CustomEvent<PlayerStateDetail>).detail
      if (detail.tabId === ownerTabId && detail.videoId === activeVideoId) {
        setPlayerPaused(detail.paused)
        setPlayerStarted(detail.started)
      }
    }
    window.addEventListener(PLAYER_STATE_EVENT, onPlayerState)
    window.dispatchEvent(new CustomEvent(PLAYER_COMMAND_EVENT, { detail: { action: 'sync', tabId: ownerTabId } }))
    return () => window.removeEventListener(PLAYER_STATE_EVENT, onPlayerState)
  }, [ownerTabId, activeVideoId])

  useEffect(() => {
    let cancelled = false
    setVideos(null)
    setError(null)
    setSaved(false)
    window.api.getCollection({ collectionId, kind }).then((response) => {
      if (cancelled) return
      if (response.ok) setVideos(response.data)
      else { setVideos([]); setError(response.error) }
    })
    return () => { cancelled = true }
  }, [collectionId, kind])

  const musicQueue = useMemo<MusicQueueItem[]>(() => (videos ?? []).map((video, index) => ({
    id: `${collectionId}:${index}:${video.videoId}`,
    videoId: video.videoId,
    title: video.title,
    channelId: video.channelId,
    channelName: video.channelName,
    thumbnailUrl: video.thumbnailUrl
  })), [videos, collectionId])
  const sourcePath = `${location.pathname}${location.search}`

  useEffect(() => {
    const first = musicQueue[0]
    if (!first || (playbackMode === 'music' && musicSourcePath === sourcePath)) return
    requestPlayback(tabId)
    void playMusic(first.videoId, musicQueue, sourcePath)
  }, [musicQueue, sourcePath, playbackMode, musicSourcePath, requestPlayback, tabId, playMusic])

  function playAt(index: number) {
    const video = videos?.[index]
    if (!video || !videos) return
    if ((status === 'loading' || !playerStarted) && video.videoId === activeVideoId) return
    if (playbackMode === 'music' && video.videoId === activeVideoId) {
      window.dispatchEvent(new CustomEvent(PLAYER_COMMAND_EVENT, { detail: { action: 'toggle-play', tabId: ownerTabId } }))
      return
    }
    requestPlayback(tabId)
    void playMusic(video.videoId, musicQueue, sourcePath)
  }

  async function saveCollection() {
    if (!videos?.length || saving) return
    setSaving(true)
    setError(null)
    try {
      const playlist = await window.api.createSavedPlaylist({ name: title, library })
      await Promise.all(videos.map((video) => window.api.saveVideo({
        videoId: video.videoId,
        title: video.title,
        channelId: video.channelId,
        channelName: video.channelName,
        thumbnailUrl: video.thumbnailUrl,
        playlistId: playlist.id,
        library
      })))
      setSaved(true)
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  if (videos === null) return <PageLoader />
  const playerStarting = playbackMode === 'music' && !!activeVideoId && (status === 'loading' || !playerStarted)
  const kindLabel = kind === 'album' ? t('Álbum') : kind === 'podcast' ? t('Podcast') : t('Playlist')
  return <section className="w-full">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-neutral-800 pb-5">
      <div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">{kindLabel}</p><h1 className="break-words text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-neutral-400">{t('{count} elementos', { count: videos.length })}</p></div>
      {videos.length > 0 && <div className="flex flex-wrap gap-2"><button type="button" disabled={playerStarting} onClick={() => playAt(0)} className={`${playerStarting ? 'bg-transparent' : 'wt-action'} grid min-h-9 min-w-24 cursor-pointer place-items-center rounded-full px-5 py-2 text-sm font-semibold disabled:cursor-wait`}>{playerStarting ? <PlaybackLoadingIcon compact /> : `▶ ${t('Reproducir todo')}`}</button><button type="button" disabled={saving || saved} onClick={() => void saveCollection()} className="cursor-pointer rounded-full bg-neutral-800 px-5 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-60">{saved ? t('Colección guardada') : saving ? t('Guardando…') : library === 'music' ? t('Guardar en Music') : t('Guardar playlist')}</button></div>}
    </header>
    {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
    {videos.length > 0 && <div className="mb-6"><MusicPlayerPanel /></div>}
    {videos.length > 0 ? <div className="divide-y divide-neutral-800 border-y border-neutral-800">{videos.map((video, index) => {
      const active = playbackMode === 'music' && video.videoId === activeVideoId
      const loading = active && playerStarting
      return <div key={`${video.videoId}:${index}`} className={`grid grid-cols-[28px_72px_minmax(0,1fr)_auto] items-center gap-3 py-2 ${active ? 'bg-white/[0.04]' : ''}`}>
      <span className="text-center text-xs text-neutral-500">{index + 1}</span>
      <button type="button" disabled={loading} onClick={() => playAt(index)} aria-label={loading ? t('Cargando…') : active && !playerPaused ? t('Pausar') : t('Reproducir')} className="group relative aspect-video cursor-pointer overflow-hidden rounded bg-neutral-900 disabled:cursor-wait"><VideoThumbnail videoId={video.videoId} thumbnailUrl={video.thumbnailUrl} title={video.title} quality="compact" /><span className={`absolute inset-0 grid place-items-center bg-black/55 text-white transition-opacity ${loading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>{loading ? <PlaybackLoadingIcon /> : <PlaybackStatusIcon paused={!active || playerPaused} />}</span></button>
      <button type="button" disabled={loading} onClick={() => playAt(index)} className="min-w-0 cursor-pointer text-left disabled:cursor-wait"><span className={`block line-clamp-2 text-sm font-medium ${active ? 'text-[var(--wt-accent)]' : ''}`}>{video.title}</span><span className="mt-1 block truncate text-xs text-neutral-400">{[video.channelName, video.durationText].filter(Boolean).join(' · ')}</span></button>
      <div className="flex items-center gap-1"><Link to={`/watch/${video.videoId}`} title={t('Ver video')} aria-label={t('Ver video')} className="grid h-8 w-8 place-items-center rounded bg-black/70 hover:bg-black/85"><SquarePlay aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} /></Link><VideoSaveActions video={{ videoId: video.videoId, title: video.title, channelId: video.channelId, channelName: video.channelName, thumbnailUrl: video.thumbnailUrl, playlistId: null }} menuPosition="above" /></div>
    </div>})}</div> : !error && <p className="text-sm text-neutral-400">{t('Esta colección está vacía.')}</p>}
  </section>
}
