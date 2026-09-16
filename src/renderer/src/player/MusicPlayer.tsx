import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { RotateCcw, RotateCw, SkipBack, SkipForward, Volume2, X, type LucideIcon } from 'lucide-react'
import { t, useLocale } from '../i18n/LocaleContext'
import { useAppTabs } from '../tabs/AppTabs'
import { PlaybackLoadingIcon, PlaybackStatusIcon } from '../components/PlaybackStatusIcon'
import { useGlobalPlayer, type MusicQueueItem } from './GlobalPlayerContext'
import { PLAYER_COMMAND_EVENT, PLAYER_STATE_EVENT, type PlayerCommandDetail, type PlayerStateDetail } from './events'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function MusicControlIcon({ name }: { name: 'previous' | 'next' | 'replay10' | 'forward10' | 'volume' | 'close' }) {
  const icons: Record<typeof name, LucideIcon> = {
    previous: SkipBack,
    next: SkipForward,
    replay10: RotateCcw,
    forward10: RotateCw,
    volume: Volume2,
    close: X
  }
  const Icon = icons[name]
  return <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
}

function CompactButton({ label, accent = false, disabled = false, children, onClick }: { label: string; accent?: boolean; disabled?: boolean; children: ReactNode; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`${accent ? 'wt-player-active-control' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'} grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded disabled:cursor-default disabled:opacity-35`}>{children}</button>
}

export function MusicPlayerPanel({ compact = false, showQueue = false }: { compact?: boolean; showQueue?: boolean }) {
  useLocale()
  const { videoId, title, channelName, thumbnailUrl, ownerTabId, playbackMode, musicQueue, musicSourcePath, relatedVideos, playMusic, extendMusicQueue, closePlayer, status, error } = useGlobalPlayer()
  const [playerState, setPlayerState] = useState<PlayerStateDetail>({ started: false, paused: true, currentTime: 0, duration: 0, volume: 1 })
  const endedVideoRef = useRef<string | null>(null)
  const currentIndex = musicQueue.findIndex((track) => track.videoId === videoId)
  const current = currentIndex >= 0 ? musicQueue[currentIndex] : null
  const recommendations = useMemo<MusicQueueItem[]>(() => relatedVideos
    .filter((video) => video.videoId !== videoId && video.durationText !== 'LIVE')
    .slice(0, 12)
    .map((video, index) => ({
      id: `radio:${videoId}:${index}:${video.videoId}`,
      videoId: video.videoId,
      title: video.title,
      channelId: video.channelId,
      channelName: video.channelName,
      thumbnailUrl: video.thumbnailUrl
    })), [relatedVideos, videoId])
  const send = (detail: PlayerCommandDetail) => window.dispatchEvent(new CustomEvent<PlayerCommandDetail>(PLAYER_COMMAND_EVENT, { detail: { ...detail, tabId: ownerTabId } }))

  const playAt = (index: number) => {
    const track = musicQueue[index]
    if (track) void playMusic(track.videoId, musicQueue, musicSourcePath ?? undefined)
  }

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<PlayerStateDetail>).detail
      if (detail.tabId !== ownerTabId || detail.videoId !== videoId) return
      setPlayerState(detail)
      const ended = detail.duration > 0 && detail.paused && detail.currentTime >= detail.duration - 0.35
      if (ended && videoId && endedVideoRef.current !== videoId) {
        endedVideoRef.current = videoId
        const next = musicQueue[currentIndex + 1]
        if (next) void playMusic(next.videoId, musicQueue, musicSourcePath ?? undefined)
        else {
          const seen = new Set(musicQueue.map((track) => track.videoId))
          const additions = recommendations.filter((track) => !seen.has(track.videoId))
          if (additions[0]) void playMusic(additions[0].videoId, [...musicQueue, ...additions], musicSourcePath ?? undefined)
        }
      } else if (!ended) endedVideoRef.current = null
    }
    window.addEventListener(PLAYER_STATE_EVENT, onState)
    send({ action: 'sync' })
    return () => window.removeEventListener(PLAYER_STATE_EVENT, onState)
  }, [ownerTabId, videoId, currentIndex, musicQueue, musicSourcePath, recommendations, playMusic])

  useEffect(() => {
    if (playbackMode !== 'music' || currentIndex < 0 || musicQueue.length - currentIndex - 1 > 2 || !recommendations.length) return
    extendMusicQueue(recommendations)
  }, [playbackMode, currentIndex, musicQueue.length, recommendations, extendMusicQueue])

  const duration = Number.isFinite(playerState.duration) ? playerState.duration : 0
  const currentTime = duration > 0 ? Math.min(playerState.currentTime, duration) : 0
  const loading = status === 'loading' || playerState.videoId !== videoId || !playerState.started
  const progressStyle = { '--wt-range-progress': `${duration > 0 ? currentTime / duration * 100 : 0}%` } as CSSProperties

  if (!videoId || playbackMode !== 'music') return <div className="grid min-h-40 place-items-center rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-6 text-center text-sm text-neutral-400">{t('Elige una canción para comenzar')}</div>

  return <section className={`relative overflow-hidden border border-neutral-800 ${compact ? 'wt-player-bar border-x-0 border-b-0 bg-neutral-900 shadow-2xl shadow-black/40' : 'rounded-xl bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 shadow-xl shadow-black/20'}`}>
    <div className={`grid ${compact ? 'min-h-[58px] grid-cols-[80px_minmax(120px,1fr)_minmax(220px,520px)_auto] items-center gap-4 px-4 max-[840px]:grid-cols-[64px_minmax(0,1fr)_auto] max-[840px]:gap-2' : 'grid-cols-[minmax(140px,24%)_minmax(0,1fr)] items-stretch gap-0 sm:grid-cols-[minmax(180px,22%)_minmax(0,1fr)]'}`}>
      <div className={`overflow-hidden bg-black ${compact ? 'h-11 w-20 rounded max-[840px]:w-16' : 'h-full min-h-48 w-full'}`}>
        {(current?.thumbnailUrl ?? thumbnailUrl) && <img src={(current?.thumbnailUrl ?? thumbnailUrl) ?? ''} alt="" decoding="async" className={`h-full w-full ${compact ? 'object-contain' : 'object-cover'}`} />}
      </div>
      <div className={`min-w-0 ${compact ? '' : 'self-center p-5 sm:p-6'}`}>
        <p className={`${compact ? 'text-sm' : 'text-lg'} truncate font-semibold`}>{title || current?.title}</p>
        <p className="truncate text-xs text-neutral-400">{channelName || current?.channelName}</p>
        <div className={`${compact ? 'hidden' : 'mt-1 h-4'} overflow-hidden`}>
          {status === 'error' && <p role="alert" className="h-4 truncate text-xs text-red-400">{error || t('No se pudo reproducir')}</p>}
        </div>
        {!compact && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <CompactButton label={t('Anterior')} disabled={currentIndex <= 0} onClick={() => playAt(currentIndex - 1)}><MusicControlIcon name="previous" /></CompactButton>
          <CompactButton label={t('Retroceder 10 segundos')} onClick={() => send({ action: 'seek-relative', seconds: -10 })}><MusicControlIcon name="replay10" /></CompactButton>
          <CompactButton accent={!loading} disabled={loading} label={loading ? t('Cargando…') : playerState.paused ? t('Reproducir') : t('Pausar')} onClick={() => send({ action: 'toggle-play' })}>{loading ? <PlaybackLoadingIcon compact /> : <PlaybackStatusIcon paused={playerState.paused} className="h-5 w-5" />}</CompactButton>
          <CompactButton label={t('Avanzar 10 segundos')} onClick={() => send({ action: 'seek-relative', seconds: 10 })}><MusicControlIcon name="forward10" /></CompactButton>
          <CompactButton label={t('Siguiente')} disabled={currentIndex < 0 || currentIndex >= musicQueue.length - 1} onClick={() => playAt(currentIndex + 1)}><MusicControlIcon name="next" /></CompactButton>
        </div>}
        {!compact && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs tabular-nums text-neutral-500">
          <span>{formatTime(currentTime)}</span><input type="range" min={0} max={duration} step={0.1} value={currentTime} disabled={!duration} onChange={(event) => send({ action: 'seek-to', seconds: Number(event.currentTarget.value) })} aria-label={t('Buscar en reproducción')} className="wt-media-range min-w-32 flex-1" style={progressStyle} /><span>{formatTime(duration)}</span>
          <div className="ml-2 flex w-32 items-center gap-2 border-l border-neutral-800 pl-3 max-[640px]:ml-0 max-[640px]:w-full max-[640px]:border-l-0 max-[640px]:pl-0">
            <MusicControlIcon name="volume" />
            <input type="range" min={0} max={1} step={0.01} value={playerState.volume} onChange={(event) => send({ action: 'set-volume', volume: Number(event.currentTarget.value) })} aria-label={t('Volumen')} className="wt-media-range min-w-0 flex-1 cursor-pointer" style={{ '--wt-range-progress': `${playerState.volume * 100}%` } as CSSProperties} />
          </div>
        </div>}
      </div>
      {compact && <div className="flex min-w-0 items-center gap-2 max-[840px]:hidden">
        <span className="w-10 text-right text-xs tabular-nums text-neutral-500">{formatTime(currentTime)}</span>
        <input type="range" min={0} max={duration} step={0.1} value={currentTime} disabled={!duration} onChange={(event) => send({ action: 'seek-to', seconds: Number(event.currentTarget.value) })} aria-label={t('Buscar en reproducción')} className="wt-media-range min-w-0 flex-1 cursor-pointer disabled:opacity-50" style={progressStyle} />
        <span className="w-10 text-xs tabular-nums text-neutral-500">{formatTime(duration)}</span>
      </div>}
      {compact && <div className="flex shrink-0 items-center justify-end gap-1">
        <CompactButton label={t('Anterior')} disabled={currentIndex <= 0} onClick={() => playAt(currentIndex - 1)}><MusicControlIcon name="previous" /></CompactButton>
        <CompactButton accent={!loading} disabled={loading} label={loading ? t('Cargando…') : playerState.paused ? t('Reproducir') : t('Pausar')} onClick={() => send({ action: 'toggle-play' })}>{loading ? <PlaybackLoadingIcon compact /> : <PlaybackStatusIcon paused={playerState.paused} className="h-5 w-5" />}</CompactButton>
        <CompactButton label={t('Siguiente')} disabled={currentIndex < 0 || currentIndex >= musicQueue.length - 1} onClick={() => playAt(currentIndex + 1)}><MusicControlIcon name="next" /></CompactButton>
        <div className="ml-2 flex w-28 items-center gap-2 max-[980px]:hidden">
          <MusicControlIcon name="volume" />
          <input type="range" min={0} max={1} step={0.01} value={playerState.volume} onChange={(event) => send({ action: 'set-volume', volume: Number(event.currentTarget.value) })} aria-label={t('Volumen')} className="wt-media-range min-w-0 flex-1 cursor-pointer" style={{ '--wt-range-progress': `${playerState.volume * 100}%` } as CSSProperties} />
        </div>
        <CompactButton label={t('Cerrar reproductor')} onClick={closePlayer}><MusicControlIcon name="close" /></CompactButton>
      </div>}
    </div>
    {compact && <input type="range" min={0} max={duration} step={0.1} value={currentTime} disabled={!duration} onChange={(event) => send({ action: 'seek-to', seconds: Number(event.currentTarget.value) })} aria-label={t('Buscar en reproducción')} className="wt-media-range absolute inset-x-0 bottom-0 h-1 w-full cursor-pointer min-[841px]:hidden" style={progressStyle} />}
    {showQueue && <div className="max-h-[45vh] overflow-y-auto border-t border-neutral-800 p-2">
      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{t('Cola de reproducción')}</p>
      {musicQueue.map((track, index) => <button key={track.id} type="button" onClick={() => playAt(index)} className={`grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded px-3 py-2 text-left hover:bg-white/5 ${track.videoId === videoId ? 'wt-selected' : ''}`}><span className="text-center text-xs text-neutral-500">{track.videoId === videoId ? '▶' : index + 1}</span><span className="min-w-0"><span className="block truncate text-sm">{track.title}</span><span className="block truncate text-xs text-neutral-500">{track.channelName}</span></span></button>)}
    </div>}
  </section>
}

export function MusicMiniPlayer({ isSideNavOpen }: { isSideNavOpen: boolean }) {
  useLocale()
  const { videoId, playbackMode, ownerTabId, musicSourcePath } = useGlobalPlayer()
  const { activeId, select, navigatorFor, tabs } = useAppTabs()
  const location = useLocation()
  const targetPath = musicSourcePath || '/music'
  const isSourcePage = activeId === ownerTabId && `${location.pathname}${location.search}` === targetPath
  const ownerPath = useMemo(() => {
    const owner = tabs.find((tab) => tab.id === ownerTabId)
    return owner?.entries[owner.index]
  }, [tabs, ownerTabId])

  if (!videoId || playbackMode !== 'music' || isSourcePage) return null
  const openSource = () => {
    select(ownerTabId)
    if (ownerPath !== targetPath) navigatorFor(ownerTabId).push(targetPath)
  }
  return <div className={`fixed bottom-0 right-0 z-[55] max-[680px]:bottom-[60px] max-[680px]:left-0 ${isSideNavOpen ? 'min-[681px]:left-[200px]' : 'min-[681px]:left-20'}`}>
    <div role="button" tabIndex={0} onClick={(event) => { if (!(event.target as Element).closest('button, input')) openSource() }} onKeyDown={(event) => { if (event.currentTarget === event.target && (event.key === 'Enter' || event.key === ' ')) openSource() }} className="cursor-pointer" aria-label={t('Abrir origen de la reproducción')}><MusicPlayerPanel compact /></div>
  </div>
}
