import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { t, useLocale } from '../i18n/LocaleContext'
import { PageLoader } from '../components/PageLoader'
import { VideoSaveActions } from '../components/VideoSaveButton'
import { VideoThumbnail } from '../components/VideoCard'
import { useGlobalPlayer, type MusicQueueItem } from '../player/GlobalPlayerContext'
import { MusicPlayerPanel } from '../player/MusicPlayer'
import { usePlayerWorkspace } from '../player/PlayerWorkspace'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import { usePageTab } from '../tabs/AppTabs'
import type { LibraryKind, SearchCollectionItem, SearchResultItem } from '../../../shared/ipc'

export function Collection() {
  useLocale()
  const location = useLocation()
  const { kind: rawKind, collectionId = '' } = useParams()
  const [params] = useSearchParams()
  const { playMusic, playbackMode, musicSourcePath } = useGlobalPlayer()
  const { requestPlayback } = usePlayerWorkspace()
  const { id: tabId } = usePageTab()
  const [videos, setVideos] = useState<SearchResultItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const kind: SearchCollectionItem['kind'] = rawKind === 'album' || rawKind === 'podcast' ? rawKind : 'playlist'
  const title = params.get('title') || (kind === 'album' ? t('Álbum') : kind === 'podcast' ? t('Podcast') : t('Playlist'))
  const library: LibraryKind = kind === 'playlist' ? 'video' : 'music'

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
  const kindLabel = kind === 'album' ? t('Álbum') : kind === 'podcast' ? t('Podcast') : t('Playlist')
  return <section className="w-full">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-neutral-800 pb-5">
      <div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">{kindLabel}</p><h1 className="break-words text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-neutral-400">{t('{count} elementos', { count: videos.length })}</p></div>
      {videos.length > 0 && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => playAt(0)} className="wt-action cursor-pointer rounded-full px-5 py-2 text-sm font-semibold">▶ {t('Reproducir todo')}</button><button type="button" disabled={saving || saved} onClick={() => void saveCollection()} className="cursor-pointer rounded-full bg-neutral-800 px-5 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-60">{saved ? t('Colección guardada') : saving ? t('Guardando…') : library === 'music' ? t('Guardar en Music') : t('Guardar playlist')}</button></div>}
    </header>
    {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
    {videos.length > 0 && <div className="mb-6"><MusicPlayerPanel /></div>}
    {videos.length > 0 ? <div className="divide-y divide-neutral-800 border-y border-neutral-800">{videos.map((video, index) => <div key={`${video.videoId}:${index}`} className="grid grid-cols-[28px_72px_minmax(0,1fr)_auto] items-center gap-3 py-2">
      <span className="text-center text-xs text-neutral-500">{index + 1}</span>
      <button type="button" onClick={() => playAt(index)} className="relative aspect-video cursor-pointer overflow-hidden rounded bg-neutral-900"><VideoThumbnail videoId={video.videoId} thumbnailUrl={video.thumbnailUrl} title={video.title} /><span className="absolute inset-0 grid place-items-center bg-black/20 text-xl opacity-0 transition-opacity hover:opacity-100">▶</span></button>
      <button type="button" onClick={() => playAt(index)} className="min-w-0 cursor-pointer text-left"><span className="block line-clamp-2 text-sm font-medium">{video.title}</span><span className="mt-1 block truncate text-xs text-neutral-400">{[video.channelName, video.durationText].filter(Boolean).join(' · ')}</span></button>
      <div className="flex items-center gap-1"><Link to={`/watch/${video.videoId}`} title={t('Ver video')} aria-label={t('Ver video')} className="grid h-8 w-8 place-items-center rounded bg-black/70 hover:bg-black/85"><svg aria-hidden="true" className="h-4 w-5" viewBox="0 0 28 20"><rect width="28" height="20" rx="6" fill="var(--wt-accent)" /><path d="m11 5 9 5-9 5Z" fill="white" /></svg></Link><VideoSaveActions video={{ videoId: video.videoId, title: video.title, channelId: video.channelId, channelName: video.channelName, thumbnailUrl: video.thumbnailUrl, playlistId: null }} menuPosition="above" /></div>
    </div>)}</div> : !error && <p className="text-sm text-neutral-400">{t('Esta colección está vacía.')}</p>}
  </section>
}
