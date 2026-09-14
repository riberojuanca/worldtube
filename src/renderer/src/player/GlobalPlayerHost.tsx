import { t, useLocale } from '../i18n/LocaleContext'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppTabs, usePageTab } from '../tabs/AppTabs'
import { usePlayerWorkspace } from './PlayerWorkspace'
// The ui build, not the core-only 'shaka-player' entry point — this file
// creates the shaka.ui.Overlay control bar (shaka-player's own official UI,
// the same one FreeTube uses over its shaka.Player — see its
// ft-shaka-video-player.vue, which loads shaka-player/dist/controls.css the
// same way this does below). Every other file touching shaka must import
// from this same path too (see sabr/*.ts) — two separately bundled copies of
// the shaka namespace in one page don't recognize each other's classes.
import shaka from 'shaka-player/dist/shaka-player.ui.js'
import './styles/shaka-controls.css'
import './styles/shaka-overrides.css'
import { useGlobalPlayer } from './GlobalPlayerContext'
import { PLAYER_COMMAND_EVENT, PLAYER_SEEK_EVENT, PLAYER_STATE_EVENT, type PlayerCommandDetail, type PlayerStateDetail } from './events'
import { startSabrSession, type SabrSession } from './sabr'

function describeError(error: unknown, depth = 0): unknown {
  if (depth > 5) return '[nested error]'
  if (error instanceof shaka.util.Error) {
    return { code: error.code, category: error.category, severity: error.severity, data: error.data.map((item: unknown) => describeError(item, depth + 1)) }
  }
  if (error instanceof Error) {
    const detail = error as Error & { severity?: unknown; cause?: unknown }
    return { name: detail.name, message: detail.message, severity: detail.severity, cause: detail.cause ? describeError(detail.cause, depth + 1) : undefined }
  }
  return error
}

// shaka.util.Error.Code.LOAD_INTERRUPTED: fired when a load() gets cancelled
// because another load()/unload() started before it finished — expected
// noise whenever the user re-triggers playback (retry, quick navigation)
// while the previous video was still loading, not a real failure worth
// showing the "No se pudo reproducir" overlay for.
const LOAD_INTERRUPTED_CODE = 7000

function isLoadInterrupted(error: unknown, depth = 0): boolean {
  if (!(error instanceof shaka.util.Error) || depth > 5) return false
  const { Code } = shaka.util.Error
  if (error.code === LOAD_INTERRUPTED_CODE || error.code === Code.OPERATION_ABORTED) return true
  return (error.code === Code.REQUEST_FILTER_ERROR || error.code === Code.RESPONSE_FILTER_ERROR) && isLoadInterrupted(error.data[0], depth + 1)
}

/**
 * shaka.ui's stock seek bar shows a hover preview automatically once a
 * thumbnails track exists — no custom seek-bar UI needed on our side, just
 * feeding it the WebVTT built from YouTube's storyboard spec (see
 * youtube.ts#buildStoryboardVtt).
 */
async function loadThumbnailsTrack(player: shaka.Player, vtt: string | null): Promise<void> {
  if (!vtt) return
  const uri = `data:text/vtt;charset=utf-8,${encodeURIComponent(vtt)}`
  try {
    await player.addThumbnailsTrack(uri, 'text/vtt')
  } catch (error) {
    console.error(`addThumbnailsTrack failed: ${JSON.stringify(describeError(error))}`)
  }
}

export const WATCH_SLOT_ID = 'global-player-watch-slot'
export const MINI_SLOT_ID = 'global-player-mini-slot'
export const SHORTS_SLOT_ID = 'global-player-shorts-slot'

/**
 * One persistent <video> and shaka.Player per tab. Switching videos inside
 * that tab calls `player.load()` again rather than
 * recreating anything, so there's no equivalent here of the bug we hit (and
 * fixed) in the freetube-audio-lab prototype, where swapping a Vue `:key`
 * unmounted the old Shaka instance without awaiting its async destroy: this
 * player is never destroyed just because the active video changed, only when
 * the whole app closes.
 *
 * The <video> element itself is portaled between the Watch page's big slot
 * and the shell's mini slot (same idea as that prototype's Teleport) — or,
 * when there's nothing playing, into a permanently-mounted hidden div, so
 * the element (and the shaka.Player attached to it) never unmounts.
 */
export function GlobalPlayerHost() {
  const { language } = useLocale()
  const { videoId, dashManifest, sabr, title, captions, storyboardVtt, playVideo, shorts, openShort, status, relatedVideos } = useGlobalPlayer()
  const location = useLocation()
  const navigate = useNavigate()
  const { activeId: activeTabId } = useAppTabs()
  const { id: tabId, active: isTabActive, revision } = usePageTab()
  const { ownerId, shouldAutoplay } = usePlayerWorkspace()
  const watchSlotId = `${WATCH_SLOT_ID}-${tabId}`
  const miniSlotId = `${MINI_SLOT_ID}-${tabId}`
  const shortsSlotId = `${SHORTS_SLOT_ID}-${tabId}`
  const isWatchRoute = isTabActive && location.pathname === `/watch/${videoId}`
  const autoplayAllowedRef = useRef(true)
  const positionsRef = useRef(new Map<string, number>())
  const loadedVideoRef = useRef<string | null>(null)

  const hiddenHomeRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<shaka.Player | null>(null)
  const uiRef = useRef<shaka.ui.Overlay | null>(null)
  const fullControlPanelRef = useRef<string[]>([])
  const sabrSessionRef = useRef<SabrSession | null>(null)
  const portalMount = useMemo(() => {
    const element = document.createElement('div')
    element.className = 'h-full w-full'
    return element
  }, [])

  // State mirrors of the video/container elements — shaka.ui.Overlay needs
  // both to exist before it can be constructed, and a plain ref mutation
  // wouldn't trigger the effect that creates it (see below).
  const [rawVideoEl, setRawVideoEl] = useState<HTMLVideoElement | null>(null)
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const [attachedPlayer, setAttachedPlayer] = useState<shaka.Player | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  // shaka.Player.load() rejecting was previously only logged to the console —
  // from the user's side the video area just stayed black forever with zero
  // feedback. Surfaced here instead.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [readySource, setReadySource] = useState<{ videoId: typeof videoId; dashManifest: typeof dashManifest; sabr: typeof sabr } | null>(null)
  const sourceReady = readySource?.videoId === videoId && readySource?.dashManifest === dashManifest && readySource?.sabr === sabr
  const isInitialLoading = !loadError && (status === 'loading' || (status === 'ready' && !sourceReady))

  // Set right before a SABR-triggered reload calls playVideo() again, so the
  // load effect below can restore the playback position once the new
  // manifest is ready — see onReloadRequested. Guarded by videoId in case the
  // user navigates to a different video while the reload is still in flight.
  const pendingResumeRef = useRef<{ videoId: string; seconds: number } | null>(null)

  useLayoutEffect(() => {
    const movePortalMount = (nextTarget: HTMLElement | null) => {
      const target = nextTarget || hiddenHomeRef.current
      if (!target) return
      if (portalMount.parentElement !== target) {
        target.appendChild(portalMount)
      }
    }

    if (videoId === null) {
      console.log('[player-slot] no active video, using hidden home slot')
      movePortalMount(hiddenHomeRef.current)
      return
    }
    const watchSlot = isWatchRoute ? document.getElementById(watchSlotId) : null
    const miniSlot = ownerId === tabId ? document.getElementById(miniSlotId) : null
    const shortSlot = ownerId === tabId && shorts.length > 0 ? document.getElementById(shortsSlotId) : null
    const slot = shortSlot || watchSlot || miniSlot
    console.log(
      `[player-slot] isWatchRoute=${isWatchRoute} watchSlotFound=${Boolean(watchSlot)} miniSlotFound=${Boolean(miniSlot)} -> using ${slot ? (slot.id || 'hidden-home') : 'hidden-home (no slot found!)'}`
    )
    movePortalMount(slot)
  }, [isWatchRoute, videoId, location.pathname, portalMount, shorts.length, activeTabId, ownerId, tabId, watchSlotId, miniSlotId, shortsSlotId, revision])

  useEffect(() => {
    return () => portalMount.remove()
  }, [portalMount])

  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    setRawVideoEl(element)
  }, [])

  // FreeTube Lab creates the Shaka UI Overlay first, then attaches the
  // underlying player to the <video>, and finally uses the player returned by
  // `ui.getControls().getPlayer()`. Keep that same order here; creating the UI
  // after attach left the video playable but the controls unreliable.
  useEffect(() => {
    if (!rawVideoEl || !containerEl || uiRef.current) return

    let disposed = false
    const localPlayer = new shaka.Player()
    const ui = new shaka.ui.Overlay(localPlayer, containerEl, rawVideoEl)
    fullControlPanelRef.current = [...ui.getConfiguration().controlPanelElements]
    const controls = ui.getControls()
    if (!controls) {
      ui.destroy().catch((error: unknown) => console.error(`shaka ui destroy failed: ${JSON.stringify(describeError(error))}`))
      return
    }
    const player = controls.getPlayer()
    if (!player) {
      ui.destroy().catch((error: unknown) => console.error(`shaka ui destroy failed: ${JSON.stringify(describeError(error))}`))
      return
    }
    player.configure({ preferredAudio: [{ role: 'main' }] })

    const handlePlayerError = (event: unknown) => {
      if (disposed) return
      const rawError = (event as { detail?: unknown }).detail ?? event
      const description = describeError(rawError)
      if (isLoadInterrupted(rawError)) {
        console.info(`shaka player load interrupted: ${JSON.stringify(description)}`)
        return
      }
      if (rawError instanceof shaka.util.Error && rawError.severity === shaka.util.Error.Severity.RECOVERABLE && rawError.category === shaka.util.Error.Category.NETWORK) {
        console.warn(`shaka recoverable network error [tab=${tabId}]: ${JSON.stringify(description)}`)
        return
      }
      console.error(`shaka player error [tab=${tabId}]: ${JSON.stringify(description)}`)
      setLoadError(`${t('Error de reproducción')}: ${JSON.stringify(description)}`)
    }
    const handleVideoError = () => console.error(`video element error: ${JSON.stringify(rawVideoEl.error)}`)

    playerRef.current = player
    uiRef.current = ui
    setVideoEl(null)
    setAttachedPlayer(null)
    player.addEventListener('error', handlePlayerError)
    rawVideoEl.addEventListener('error', handleVideoError)

    const audioPreferences = typeof window.api.getPlayerAudioPreferences === 'function'
      ? window.api.getPlayerAudioPreferences().catch(() => null) : Promise.resolve(null)
    Promise.all([localPlayer.attach(rawVideoEl), audioPreferences])
      .then(([, audio]) => {
        if (disposed) return
        if (audio) {
          rawVideoEl.volume = audio.volume
          rawVideoEl.muted = audio.muted
        }
        setVideoEl(rawVideoEl)
        setAttachedPlayer(player)
      })
      .catch((error: unknown) => console.error(`shaka attach failed: ${JSON.stringify(describeError(error))}`))

    return () => {
      disposed = true
      sabrSessionRef.current?.dispose()
      sabrSessionRef.current = null
      player.removeEventListener('error', handlePlayerError)
      rawVideoEl.removeEventListener('error', handleVideoError)
      playerRef.current = null
      uiRef.current = null
      setVideoEl(null)
      setAttachedPlayer(null)
      ui.destroy().catch((error: unknown) => console.error(`shaka ui destroy failed: ${JSON.stringify(describeError(error))}`))
    }
  }, [rawVideoEl, containerEl])

  useEffect(() => {
    const ui = uiRef.current
    if (!ui) return
    ui.getControls()?.getLocalization().changeLocale([language])
    ui.configure({
      seekBarColors: { base: 'var(--wt-track)', buffered: 'var(--wt-buffered)', played: 'var(--wt-accent)', adBreaks: 'var(--wt-important)', chapters: 'var(--wt-important)' },
      volumeBarColors: { base: 'var(--wt-track)', level: 'var(--wt-accent)' },
      playbackRateBarColors: { base: 'var(--wt-track)', level: 'var(--wt-accent)' },
      controlPanelElements: isWatchRoute && shorts.length === 0 ? fullControlPanelRef.current
      : ['play_pause', 'mute', 'volume', 'time_and_duration', 'spacer', 'queue', 'overflow_menu', 'fullscreen'] })
  }, [isWatchRoute, shorts.length, rawVideoEl, containerEl, language])

  useEffect(() => {
    if (!videoEl || typeof window.api.setPlayerAudioPreferences !== 'function') return
    const saveAudio = () => {
      void window.api.setPlayerAudioPreferences({ volume: videoEl.volume, muted: videoEl.muted })
        .catch((error) => console.warn(t("No se pudo guardar el volumen"), error))
    }
    videoEl.addEventListener('volumechange', saveAudio)
    return () => videoEl.removeEventListener('volumechange', saveAudio)
  }, [videoEl])

  useEffect(() => {
    if (!videoEl || !videoId || ownerId !== tabId) return
    let lastTextTrack: shaka.extern.TextTrack | null = null
    const onKeyDown = (event: KeyboardEvent) => {
      const isSpace = event.code === 'Space' || event.key === ' '
      const key = isSpace ? ' ' : event.key.toLowerCase()
      const next = key === 'medianexttrack' || (event.shiftKey && key === 'n')
      const previous = key === 'mediaprevioustrack' || (event.shiftKey && key === 'p')
      const shortcuts = [' ', 'k', 'j', 'l', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'm', 'f', 'c', 'home', 'end', ',', '.', '<', '>', 'mediaplaypause', 'mediastop']
      if (!shortcuts.includes(key) && !/^\d$/.test(key) && !next && !previous) return
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.shiftKey && !next && !previous && key !== '<' && key !== '>') return
      const target = event.target instanceof HTMLElement ? event.target : document.activeElement
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"], [role="combobox"]')) return
        if (isSpace && target.closest('button, a[href], [role="button"], [role="checkbox"], [role="switch"], summary')) return
        const dialog = target.closest('dialog, [role="dialog"]')
        if (dialog && !dialog.querySelector(`#${shortsSlotId}`)) return
      }
      const player = playerRef.current
      if (!player?.getAssetUri()) return
      if ((key === ',' || key === '.') && !videoEl.paused) return
      if (previous && shorts.length === 0) return
      event.preventDefault()
      // Shaka also handles playback keys; consume this event before its listener.
      event.stopImmediatePropagation()
      if (event.repeat && !['j', 'l', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', ',', '.', '<', '>'].includes(key)) return
      const send = (detail: PlayerCommandDetail) => window.dispatchEvent(new CustomEvent<PlayerCommandDetail>(PLAYER_COMMAND_EVENT, { detail: { ...detail, tabId } }))
      const seek = (seconds: number) => {
        const range = player.seekRange()
        if (Number.isFinite(seconds)) send({ action: 'seek-to', seconds: Math.max(range.start, Math.min(range.end, seconds)) })
      }
      if (next || previous) {
        if (shorts.length) {
          const index = shorts.findIndex((short) => short.videoId === videoId)
          const targetShort = index >= 0 ? shorts[index + (next ? 1 : -1)] : undefined
          if (targetShort) openShort(targetShort.videoId, shorts)
        } else if (next && relatedVideos[0]) {
          if (isWatchRoute) navigate(`/watch/${relatedVideos[0].videoId}`)
          else void playVideo(relatedVideos[0].videoId)
        }
        return
      }
      switch (key) {
        case ' ': case 'k': case 'mediaplaypause': send({ action: 'toggle-play' }); break
        case 'j': case 'arrowleft': seek(videoEl.currentTime - (key === 'j' ? 10 : 5)); break
        case 'l': case 'arrowright': seek(videoEl.currentTime + (key === 'l' ? 10 : 5)); break
        case 'arrowup': case 'arrowdown':
          send({ action: 'set-volume', volume: Math.min(1, Math.max(0, (videoEl.muted ? 0 : videoEl.volume) + (key === 'arrowup' ? 0.05 : -0.05))) }); break
        case 'm': videoEl.muted = !videoEl.muted; break
        case 'f': void uiRef.current?.getControls()?.toggleFullScreen(); break
        case 'c': {
          const tracks = player.getTextTracks()
          const active = tracks.find((track) => track.active)
          if (tracks.length) {
            if (active) { lastTextTrack = active; player.selectTextTrack(null) }
            else player.selectTextTrack(lastTextTrack ?? tracks[0])
          } else {
            const nativeTracks = Array.from(videoEl.textTracks).filter((track) => track.kind === 'subtitles' || track.kind === 'captions')
            const showing = nativeTracks.find((track) => track.mode === 'showing')
            for (const track of nativeTracks) track.mode = 'disabled'
            if (!showing && nativeTracks[0]) nativeTracks[0].mode = 'showing'
          }
          break
        }
        case 'home': seek(player.seekRange().start); break
        case 'end': seek(Math.max(player.seekRange().start, player.seekRange().end - 0.1)); break
        case ',': case '.': {
          const fps = player.getVariantTracks().find((track) => track.active)?.frameRate || 30
          seek(videoEl.currentTime + (key === '.' ? 1 : -1) / fps)
          break
        }
        case '<': case '>':
          player.trickPlay(Math.min(2, Math.max(0.25, Math.round((videoEl.playbackRate + (key === '>' ? 0.25 : -0.25)) * 4) / 4)), false); break
        case 'mediastop': videoEl.pause(); seek(player.seekRange().start); break
        default: {
          const range = player.seekRange()
          seek(range.start + (range.end - range.start) * Number(key) / 10)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [videoEl, videoId, shorts, openShort, relatedVideos, playVideo, isWatchRoute, navigate, ownerId, tabId, shortsSlotId])

  useEffect(() => {
    const player = attachedPlayer
    // `videoEl` is only set after `attach(video)` resolves in the FreeTube Lab
    // order above, so reaching this point means Shaka has a media element.
    if (!player || player !== playerRef.current || !videoEl) return
    let cancelled = false

    if (loadedVideoRef.current) {
      positionsRef.current.set(loadedVideoRef.current, videoEl.currentTime)
      loadedVideoRef.current = null
    }
    const resumeAt = videoId ? positionsRef.current.get(videoId) || 0 : 0

    // Always tear down the previous video's SABR session (its `sabr:` scheme
    // handler and request state) before starting the next one — leaving it
    // active would let a stale poToken/formats list answer requests for the
    // new video.
    sabrSessionRef.current?.dispose()
    sabrSessionRef.current = null
    setLoadError(null)
    setReadySource(null)

    const finishLoading = async () => {
      if (cancelled) return
      if (autoplayAllowedRef.current && (shouldAutoplay(tabId) || pendingResumeRef.current?.videoId === videoId)) {
        await videoEl.play().catch((error) => console.warn('Video autoplay failed', error))
      }
      if (!cancelled) setReadySource({ videoId, dashManifest, sabr })
    }

    // Timing instrumentation only — measures perceived load time (manifest
    // parsed vs. actual first frame) to find where load time actually goes.
    // Remove once that's sorted out.
    const tLoadStart = performance.now()
    const element = player.getMediaElement()
    const onPlaying = () => {
      console.log(`[timing] video element reached 'playing' ${(performance.now() - tLoadStart).toFixed(0)}ms after load() was called`)
      element?.removeEventListener('playing', onPlaying)
    }
    element?.addEventListener('playing', onPlaying)

    if (sabr) {
      const session = startSabrSession(player, sabr.manifest, sabr.stream, {
        onReloadRequested: () => {
          if (cancelled) return
          // YouTube's ABR server says this stream is no longer valid (expired
          // token, etc). We don't have a narrower "just refresh the stream"
          // path yet, so re-run the whole getVideoInfo pipeline — see the
          // `.then()` below for how the playback position survives that.
          if (videoId) {
            autoplayAllowedRef.current = !player.getMediaElement()?.paused
            pendingResumeRef.current = { videoId, seconds: player.getMediaElement()?.currentTime ?? 0 }
            void playVideo(videoId)
          }
        }
      })
      sabrSessionRef.current = session
      player
        .load(session.manifestUri, resumeAt)
        .then(() => {
          if (cancelled || player.getAssetUri() !== session.manifestUri) return
          loadedVideoRef.current = videoId
          console.log(`[timing] shaka load() (sabr) resolved ${(performance.now() - tLoadStart).toFixed(0)}ms after being called`)
          void loadThumbnailsTrack(player, storyboardVtt)
          void finishLoading()
          const pending = pendingResumeRef.current
          if (!pending || pending.videoId !== videoId) return
          pendingResumeRef.current = null
          const element = player.getMediaElement()
          if (element) element.currentTime = pending.seconds
        })
        .catch((error: unknown) => {
          if (cancelled) return
          const description = describeError(error)
          if (isLoadInterrupted(error)) {
            console.info(`shaka load (sabr) interrupted: ${JSON.stringify(description)}`)
            return
          }
          console.error(`shaka load (sabr) failed [tab=${tabId}, video=${videoId}]: ${JSON.stringify(description)}`)
          setLoadError(`${t('No se pudo reproducir')}: ${JSON.stringify(description)}`)
        })
      return () => {
        cancelled = true
        element?.removeEventListener('playing', onPlaying)
      }
    }

    if (!dashManifest) {
      player.unload().catch(() => {})
      return () => {
        cancelled = true
        element?.removeEventListener('playing', onPlaying)
      }
    }

    const manifestUri = URL.createObjectURL(new Blob([dashManifest], { type: 'application/dash+xml' }))
    player
      .load(manifestUri, resumeAt)
      .then(() => {
        if (cancelled || player.getAssetUri() !== manifestUri) return
        loadedVideoRef.current = videoId
        console.log(`[timing] shaka load() (dash) resolved ${(performance.now() - tLoadStart).toFixed(0)}ms after being called`)
        void loadThumbnailsTrack(player, storyboardVtt)
        void finishLoading()
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const description = describeError(error)
        if (isLoadInterrupted(error)) {
          console.info(`shaka load interrupted: ${JSON.stringify(description)}`)
          return
        }
        console.error(`shaka load failed: ${JSON.stringify(description)}`)
        setLoadError(`${t('No se pudo reproducir')}: ${JSON.stringify(description)}`)
      })

    return () => {
      cancelled = true
      URL.revokeObjectURL(manifestUri)
      element?.removeEventListener('playing', onPlaying)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashManifest, sabr, videoEl, attachedPlayer])

  useEffect(() => {
    return () => sabrSessionRef.current?.dispose()
  }, [])

  useEffect(() => {
    if (!videoEl || shorts.length === 0 || status !== 'ready') return
    const onEnded = () => {
      if (!videoEl.ended) return
      const index = shorts.findIndex((short) => short.videoId === videoId)
      const next = index >= 0 ? shorts[index + 1] : undefined
      if (next) openShort(next.videoId, shorts)
    }
    videoEl.addEventListener('ended', onEnded)
    return () => videoEl.removeEventListener('ended', onEnded)
  }, [videoEl, shorts, videoId, status, openShort])

  useEffect(() => {
    if (!videoEl) return

    const emitState = () => {
      const detail: PlayerStateDetail = {
        tabId,
        paused: videoEl.paused,
        currentTime: videoEl.currentTime || 0,
        duration: Number.isFinite(videoEl.duration) ? videoEl.duration : 0,
        volume: videoEl.muted ? 0 : videoEl.volume
      }
      window.dispatchEvent(new CustomEvent<PlayerStateDetail>(PLAYER_STATE_EVENT, { detail }))
    }

    const handleSeek = (event: Event) => {
      const detail = (event as CustomEvent<{ seconds?: number; tabId?: string }>).detail
      if (detail?.tabId !== tabId) return
      const seconds = detail.seconds
      if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return

      videoEl.currentTime = Math.max(0, seconds)
      void videoEl.play().catch((error: unknown) => console.error(`video play after seek failed: ${JSON.stringify(describeError(error))}`))
    }

    const handleCommand = (event: Event) => {
      const detail = (event as CustomEvent<PlayerCommandDetail>).detail
      if (!detail) return
      if (detail.action === 'pause-others') {
        autoplayAllowedRef.current = detail.tabId === tabId
        if (detail.tabId !== tabId) videoEl.pause()
        return
      }
      if (detail.tabId !== tabId) return

      if (detail.action === 'sync') {
        emitState()
        return
      }

      if (detail.action === 'toggle-play') {
        if (videoEl.paused) {
          void videoEl.play().catch((error: unknown) => console.error(`video play command failed: ${JSON.stringify(describeError(error))}`))
        } else {
          videoEl.pause()
        }
        emitState()
        return
      }

      if (detail.action === 'seek-relative') {
        const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : Number.POSITIVE_INFINITY
        videoEl.currentTime = Math.min(Math.max(videoEl.currentTime + detail.seconds, 0), duration)
        emitState()
        return
      }

      if (detail.action === 'seek-to') {
        if (!Number.isFinite(detail.seconds)) return
        const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : Number.POSITIVE_INFINITY
        videoEl.currentTime = Math.min(Math.max(detail.seconds, 0), duration)
        emitState()
        return
      }

      if (detail.action === 'set-volume') {
        const volume = Math.min(Math.max(detail.volume, 0), 1)
        videoEl.volume = volume
        videoEl.muted = volume === 0
        emitState()
      }
    }

    window.addEventListener(PLAYER_SEEK_EVENT, handleSeek)
    window.addEventListener(PLAYER_COMMAND_EVENT, handleCommand)
    videoEl.addEventListener('durationchange', emitState)
    videoEl.addEventListener('ended', emitState)
    videoEl.addEventListener('loadedmetadata', emitState)
    videoEl.addEventListener('pause', emitState)
    videoEl.addEventListener('play', emitState)
    videoEl.addEventListener('timeupdate', emitState)
    videoEl.addEventListener('volumechange', emitState)
    emitState()
    return () => {
      window.removeEventListener(PLAYER_SEEK_EVENT, handleSeek)
      window.removeEventListener(PLAYER_COMMAND_EVENT, handleCommand)
      videoEl.removeEventListener('durationchange', emitState)
      videoEl.removeEventListener('ended', emitState)
      videoEl.removeEventListener('loadedmetadata', emitState)
      videoEl.removeEventListener('pause', emitState)
      videoEl.removeEventListener('play', emitState)
      videoEl.removeEventListener('timeupdate', emitState)
      videoEl.removeEventListener('volumechange', emitState)
    }
  }, [videoEl, tabId])

  return (
    <>
      <div ref={hiddenHomeRef} hidden />
      {createPortal(
        // shaka-video-container: NOT added automatically by `new shaka.ui.Overlay(...)`
        // (it only sets a data-attribute marker on this element) — controls.css scopes
        // every layout/positioning rule for the control bar under this class, so without
        // it shaka's injected buttons/seek bar render completely unstyled.
        <div ref={setContainerEl} className={`shaka-video-container relative h-full w-full overflow-hidden bg-black ${isInitialLoading ? 'wt-player-loading' : ''}`}>
          <video ref={setVideoRef} className="h-full w-full" title={title} crossOrigin="anonymous" playsInline preload="auto">
            {captions.map((track) => (
              <track
                // Keyed on videoId too: browsers don't reliably reload a
                // <track>'s cues just because its `src` attribute changed on
                // an already-mounted element, and switching videos can land
                // on the same language code — this forces a real remount.
                key={`${videoId}:${track.languageCode}`}
                kind="subtitles"
                src={track.url}
                srcLang={track.languageCode}
                label={track.isAutomatic ? `${track.label} (auto)` : track.label}
              />
            ))}
          </video>
          {isInitialLoading && <div className="wt-initial-loader" role="status" aria-label={t('Cargando…')} />}
          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-white">
              <p className="text-sm">{loadError}</p>
              <button
                type="button"
                onClick={() => videoId && playVideo(videoId)}
                className="wt-action rounded px-3 py-1.5 text-sm font-medium"
              >
                {t("Reintentar")}</button>
            </div>
          )}
        </div>,
        portalMount
      )}
    </>
  )
}
