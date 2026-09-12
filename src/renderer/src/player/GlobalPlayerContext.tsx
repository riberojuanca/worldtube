import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CaptionTrack, SabrManifestInfo, SabrStreamInfo, SearchResultItem } from '../../../shared/ipc'

export interface GlobalPlayerState {
  videoId: string | null
  title: string
  channelId: string | null
  channelName: string
  captions: CaptionTrack[]
  storyboardVtt: string | null
  relatedVideos: SearchResultItem[]
  dashManifest: string | null
  sabr: { manifest: SabrManifestInfo; stream: SabrStreamInfo } | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

interface GlobalPlayerContextValue extends GlobalPlayerState {
  playVideo: (videoId: string) => Promise<void>
  closePlayer: () => void
}

const initialState: GlobalPlayerState = {
  videoId: null,
  title: '',
  channelId: null,
  channelName: '',
  captions: [],
  storyboardVtt: null,
  relatedVideos: [],
  dashManifest: null,
  sabr: null,
  status: 'idle',
  error: null
}

const GlobalPlayerContext = createContext<GlobalPlayerContextValue | null>(null)

export function GlobalPlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlobalPlayerState>(initialState)

  // Guards against a stale response winning a race if the user jumps to a
  // second video before the first `getVideoInfo` call has resolved.
  const requestIdRef = useRef(0)

  // Separate from requestIdRef: this dedupes an identical concurrent call
  // outright — needed because React 18 StrictMode double-invokes effects in
  // dev, so Watch's effect calls playVideo(sameId) twice back to back. Without
  // this we opened two hidden BotGuard windows on the same session partition
  // at once and they started stepping on each other's requests.
  const inFlightVideoIdRef = useRef<string | null>(null)

  const playVideo = useCallback(async (videoId: string) => {
    if (inFlightVideoIdRef.current === videoId) return
    inFlightVideoIdRef.current = videoId

    try {
      await playVideoImpl(videoId)
    } finally {
      if (inFlightVideoIdRef.current === videoId) {
        inFlightVideoIdRef.current = null
      }
    }
  }, [])

  const playVideoImpl = useCallback(async (videoId: string) => {
    const requestId = ++requestIdRef.current

    setState((prev) => ({ ...prev, videoId, status: 'loading', error: null, dashManifest: null, sabr: null }))

    const response = await window.api.getVideoInfo(videoId)
    if (requestIdRef.current !== requestId) return

    if (!response.ok) {
      setState((prev) => ({ ...prev, status: 'error', error: response.error }))
      return
    }

    if (!response.data.dashManifest && !response.data.sabr) {
      setState((prev) => ({
        ...prev,
        title: response.data.title,
        channelId: response.data.channelId,
        channelName: response.data.channelName,
        captions: response.data.captions,
        storyboardVtt: response.data.storyboardVtt,
        relatedVideos: response.data.relatedVideos,
        dashManifest: null,
        sabr: null,
        status: 'error',
        error: 'No se pudo generar un manifest reproducible para este video (ver logs del proceso principal).'
      }))
      return
    }

    setState((prev) => ({
      ...prev,
      title: response.data.title,
      channelId: response.data.channelId,
      channelName: response.data.channelName,
      captions: response.data.captions,
      storyboardVtt: response.data.storyboardVtt,
      relatedVideos: response.data.relatedVideos,
      dashManifest: response.data.dashManifest,
      sabr: response.data.sabr,
      status: 'ready',
      error: null
    }))
  }, [])

  const closePlayer = useCallback(() => {
    setState(initialState)
  }, [])

  const value = useMemo<GlobalPlayerContextValue>(
    () => ({ ...state, playVideo, closePlayer }),
    [state, playVideo, closePlayer]
  )

  return <GlobalPlayerContext.Provider value={value}>{children}</GlobalPlayerContext.Provider>
}

export function useGlobalPlayer(): GlobalPlayerContextValue {
  const ctx = useContext(GlobalPlayerContext)
  if (!ctx) {
    throw new Error('useGlobalPlayer must be used inside <GlobalPlayerProvider>')
  }
  return ctx
}
