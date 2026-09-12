import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
// The ui build, not the core-only 'shaka-player' entry point — this file
// creates the shaka.ui.Overlay control bar (shaka-player's own official UI,
// the same one FreeTube uses over its shaka.Player — see its
// ft-shaka-video-player.vue, which loads shaka-player/dist/controls.css the
// same way this does below). Every other file touching shaka must import
// from this same path too (see sabr/*.ts) — two separately bundled copies of
// the shaka namespace in one page don't recognize each other's classes.
import shaka from 'shaka-player/dist/shaka-player.ui.js'
import 'shaka-player/dist/controls.css'
import { useGlobalPlayer } from './GlobalPlayerContext'
import { startSabrSession, type SabrSession } from './sabr'

function describeError(error: unknown): unknown {
  if (error instanceof shaka.util.Error) {
    return { code: error.code, category: error.category, severity: error.severity, data: error.data }
  }
  return error
}

// shaka.util.Error.Code.LOAD_INTERRUPTED: fired when a load() gets cancelled
// because another load()/unload() started before it finished — expected
// noise whenever the user re-triggers playback (retry, quick navigation)
// while the previous video was still loading, not a real failure worth
// showing the "No se pudo reproducir" overlay for.
const LOAD_INTERRUPTED_CODE = 7000

function isLoadInterrupted(error: unknown): boolean {
  return error instanceof shaka.util.Error && error.code === LOAD_INTERRUPTED_CODE
}

/**
 * shaka.ui's stock seek bar shows a hover preview automatically once a
 * thumbnails track exists — no custom seek-bar UI needed on our side, just
 * feeding it the WebVTT built from YouTube's storyboard spec (see
 * youtube.ts#buildStoryboardVtt).
 */
async function loadThumbnailsTrack(player: shaka.Player, vtt: string | null): Promise<void> {
  if (!vtt) return
  const uri = `data:text/vtt,${encodeURIComponent(vtt)}`
  try {
    await player.addThumbnailsTrack(uri)
  } catch (error) {
    console.error(`addThumbnailsTrack failed: ${JSON.stringify(describeError(error))}`)
  }
}

export const WATCH_SLOT_ID = 'global-player-watch-slot'
export const MINI_SLOT_ID = 'global-player-mini-slot'

/**
 * Mounted ONCE, in App.tsx. One <video>, one shaka.Player, for the whole
 * app's life — switching videos calls `player.load()` again rather than
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
  const { videoId, dashManifest, sabr, title, captions, storyboardVtt, playVideo } = useGlobalPlayer()
  const location = useLocation()
  const isWatchRoute = location.pathname.startsWith('/watch/')

  const hiddenHomeRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<shaka.Player | null>(null)
  const uiRef = useRef<shaka.ui.Overlay | null>(null)
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
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  // shaka.Player.load() rejecting was previously only logged to the console —
  // from the user's side the video area just stayed black forever with zero
  // feedback. Surfaced here instead.
  const [loadError, setLoadError] = useState<string | null>(null)

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
    const watchSlot = isWatchRoute ? document.getElementById(WATCH_SLOT_ID) : null
    const miniSlot = document.getElementById(MINI_SLOT_ID)
    const slot = watchSlot || miniSlot
    console.log(
      `[player-slot] isWatchRoute=${isWatchRoute} watchSlotFound=${Boolean(watchSlot)} miniSlotFound=${Boolean(miniSlot)} -> using ${slot ? (slot.id || 'hidden-home') : 'hidden-home (no slot found!)'}`
    )
    movePortalMount(slot)
  }, [isWatchRoute, videoId, location.pathname, portalMount])

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

    const handlePlayerError = (event: unknown) => {
      const rawError = (event as { detail?: unknown }).detail ?? event
      const description = describeError(rawError)
      if (isLoadInterrupted(rawError)) {
        console.info(`shaka player load interrupted: ${JSON.stringify(description)}`)
        return
      }
      console.error(`shaka player error: ${JSON.stringify(description)}`)
      setLoadError(`Error de reproducción: ${JSON.stringify(description)}`)
    }
    const handleVideoError = () => console.error(`video element error: ${JSON.stringify(rawVideoEl.error)}`)

    playerRef.current = player
    uiRef.current = ui
    setVideoEl(null)
    player.addEventListener('error', handlePlayerError)
    rawVideoEl.addEventListener('error', handleVideoError)

    localPlayer
      .attach(rawVideoEl)
      .then(() => {
        if (!disposed) setVideoEl(rawVideoEl)
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
      ui.destroy().catch((error: unknown) => console.error(`shaka ui destroy failed: ${JSON.stringify(describeError(error))}`))
    }
  }, [rawVideoEl, containerEl])

  useEffect(() => {
    const player = playerRef.current
    // `videoEl` is only set after `attach(video)` resolves in the FreeTube Lab
    // order above, so reaching this point means Shaka has a media element.
    if (!player || !videoEl) return

    // Always tear down the previous video's SABR session (its `sabr:` scheme
    // handler and request state) before starting the next one — leaving it
    // active would let a stale poToken/formats list answer requests for the
    // new video.
    sabrSessionRef.current?.dispose()
    sabrSessionRef.current = null
    setLoadError(null)

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
          // YouTube's ABR server says this stream is no longer valid (expired
          // token, etc). We don't have a narrower "just refresh the stream"
          // path yet, so re-run the whole getVideoInfo pipeline — see the
          // `.then()` below for how the playback position survives that.
          if (videoId) {
            pendingResumeRef.current = { videoId, seconds: player.getMediaElement()?.currentTime ?? 0 }
            void playVideo(videoId)
          }
        }
      })
      sabrSessionRef.current = session
      player
        .load(session.manifestUri)
        .then(() => {
          console.log(`[timing] shaka load() (sabr) resolved ${(performance.now() - tLoadStart).toFixed(0)}ms after being called`)
          void loadThumbnailsTrack(player, storyboardVtt)
          const pending = pendingResumeRef.current
          if (!pending || pending.videoId !== videoId) return
          pendingResumeRef.current = null
          const element = player.getMediaElement()
          if (element) element.currentTime = pending.seconds
        })
        .catch((error: unknown) => {
          const description = describeError(error)
          if (isLoadInterrupted(error)) {
            console.info(`shaka load (sabr) interrupted: ${JSON.stringify(description)}`)
            return
          }
          console.error(`shaka load (sabr) failed: ${JSON.stringify(description)}`)
          setLoadError(`No se pudo reproducir: ${JSON.stringify(description)}`)
        })
      return () => element?.removeEventListener('playing', onPlaying)
    }

    if (!dashManifest) {
      player.unload().catch(() => {})
      return () => element?.removeEventListener('playing', onPlaying)
    }

    const manifestUri = URL.createObjectURL(new Blob([dashManifest], { type: 'application/dash+xml' }))
    player
      .load(manifestUri)
      .then(() => {
        console.log(`[timing] shaka load() (dash) resolved ${(performance.now() - tLoadStart).toFixed(0)}ms after being called`)
        void loadThumbnailsTrack(player, storyboardVtt)
      })
      .catch((error: unknown) => {
        const description = describeError(error)
        if (isLoadInterrupted(error)) {
          console.info(`shaka load interrupted: ${JSON.stringify(description)}`)
          return
        }
        console.error(`shaka load failed: ${JSON.stringify(description)}`)
        setLoadError(`No se pudo reproducir: ${JSON.stringify(description)}`)
      })

    return () => {
      URL.revokeObjectURL(manifestUri)
      element?.removeEventListener('playing', onPlaying)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashManifest, sabr, videoEl])

  useEffect(() => {
    return () => sabrSessionRef.current?.dispose()
  }, [])

  return (
    <>
      <div ref={hiddenHomeRef} hidden />
      {createPortal(
        // shaka-video-container: NOT added automatically by `new shaka.ui.Overlay(...)`
        // (it only sets a data-attribute marker on this element) — controls.css scopes
        // every layout/positioning rule for the control bar under this class, so without
        // it shaka's injected buttons/seek bar render completely unstyled.
        <div ref={setContainerEl} className="shaka-video-container relative h-full w-full bg-black">
          <video ref={setVideoRef} className="h-full w-full" title={title} autoPlay crossOrigin="anonymous" playsInline preload="auto">
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
          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-white">
              <p className="text-sm">{loadError}</p>
              <button
                type="button"
                onClick={() => videoId && playVideo(videoId)}
                className="rounded bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-white"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>,
        portalMount
      )}
    </>
  )
}
