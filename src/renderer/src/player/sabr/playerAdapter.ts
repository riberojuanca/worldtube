import shaka from 'shaka-player/dist/shaka-player.ui.js'
import { SabrUmpProcessor } from 'googlevideo/sabr-streaming-adapter'
import type {
  PlayerHttpRequest,
  PlayerHttpResponse,
  RequestFilter,
  RequestSegment,
  ResponseFilter,
  SabrPlayerAdapter,
  UmpProcessingResult
} from 'googlevideo/sabr-streaming-adapter'
import type { RequestMetadataManager, CacheManager } from 'googlevideo/utils'
import { formatKey, type GVSabrFormat } from './format'
import { parseSabrUri } from './sabrUri'

const { AbortableOperation } = shaka.util
const ShakaError = shaka.util.Error

/**
 * Bridges shaka-player's `sabr:` network scheme to `googlevideo`'s
 * SabrStreamingAdapter, which builds/tracks the SABR request state (ABR
 * requests, redirects, contexts, backoff) but — per its own docs — leaves
 * actually issuing HTTP requests and parsing the UMP response stream to the
 * "player adapter". That's this class: it does the real `fetch()`, feeds the
 * bytes to `SabrUmpProcessor` (also from `googlevideo`), and translates
 * between shaka's Request/Response and the adapter's own request shape.
 *
 * One instance is attached per SABR video load — see index.ts.
 */
export class ShakaSabrPlayerAdapter implements SabrPlayerAdapter {
  private player: shaka.Player | null = null
  private requestMetadataManager: RequestMetadataManager | null = null
  private cacheManager: CacheManager | null = null
  private requestInterceptor: RequestFilter | null = null
  private responseInterceptor: ResponseFilter | null = null
  private readonly pendingAborts = new Set<AbortController>()
  private disposed = false

  initialize(player: shaka.Player, requestMetadataManager: RequestMetadataManager, cache: CacheManager | null): void {
    this.player = player
    this.requestMetadataManager = requestMetadataManager
    this.cacheManager = cache
  }

  getPlayerTime(): number {
    return this.player?.getMediaElement()?.currentTime ?? 0
  }

  getPlaybackRate(): number {
    return this.player?.getPlaybackRate() ?? 1
  }

  getBandwidthEstimate(): number {
    return this.player?.getStats().estimatedBandwidth ?? 0
  }

  getActiveTrackFormats(
    currentFormat: GVSabrFormat,
    sabrFormats: GVSabrFormat[]
  ): { audioFormat?: GVSabrFormat; videoFormat?: GVSabrFormat } {
    const byKey = (key: string | null | undefined): GVSabrFormat | undefined =>
      key ? sabrFormats.find((f) => formatKey(f.itag, f.xtags) === key) : undefined

    const active = this.player?.getVariantTracks().find((track) => track.active)
    if (active) {
      return { audioFormat: byKey(active.originalAudioId), videoFormat: byKey(active.originalVideoId) }
    }

    // No active variant yet — this is the very first request of the load.
    // Best effort: use the format being requested, and the highest-bitrate
    // candidate for whichever side (audio/video) it isn't.
    const isVideo = Boolean(currentFormat.width)
    const bestOf = (formats: GVSabrFormat[]): GVSabrFormat | undefined =>
      formats.length ? formats.reduce((best, f) => (f.bitrate > best.bitrate ? f : best)) : undefined
    const audioFormats = sabrFormats.filter((format) => !format.width)
    const originalAudio = audioFormats.filter((format) => format.isOriginal)

    return {
      audioFormat: isVideo ? bestOf(originalAudio.length ? originalAudio : audioFormats) : currentFormat,
      videoFormat: isVideo ? currentFormat : bestOf(sabrFormats.filter((f) => f.width))
    }
  }

  registerRequestInterceptor(interceptor: RequestFilter): void {
    this.requestInterceptor = interceptor
  }

  registerResponseInterceptor(interceptor: ResponseFilter): void {
    this.responseInterceptor = interceptor
  }

  dispose(): void {
    this.disposed = true
    for (const controller of this.pendingAborts) controller.abort()
    this.pendingAborts.clear()
    this.player = null
    this.requestMetadataManager = null
    this.cacheManager = null
    this.requestInterceptor = null
    this.responseInterceptor = null
  }

  /** Entry point for the shaka `sabr:` scheme plugin — see registerSabrScheme() below. */
  handleShakaRequest(uri: string, shakaRequest: shaka.extern.Request): shaka.extern.IAbortableOperation<shaka.extern.Response> {
    const parsed = parseSabrUri(uri)
    const segment: RequestSegment = {
      isInit: () => parsed.isInit,
      getStartTime: () => (parsed.startTimeMs !== null ? parsed.startTimeMs / 1000 : null)
    }

    const abortController = new AbortController()
    this.pendingAborts.add(abortController)

    const promise = this.runRequestCycle(uri, {}, segment, abortController)
      .then((response): shaka.extern.Response => {
        const data = response.data
        return {
          uri: response.url,
          originalUri: uri,
          data: data ?? new Uint8Array(0),
          headers: response.headers,
          status: 200,
          fromCache: false,
          originalRequest: shakaRequest
        }
      })
      .finally(() => this.pendingAborts.delete(abortController))

    return new AbortableOperation(promise, () => {
      abortController.abort()
      return Promise.resolve()
    })
  }

  /**
   * One full request/response round trip: run it through the adapter's
   * request interceptor (which turns our `sabr://` uri into a real ABR
   * POST), fetch it, feed the UMP response to SabrUmpProcessor, then run the
   * result through the adapter's response interceptor (which may itself call
   * `makeRequest` again — redirects, retries, backoff — hence the recursion
   * back into this same method via the `makeRequest` closure below).
   */
  private async runRequestCycle(
    url: string,
    extraHeaders: Record<string, string>,
    segment: RequestSegment,
    abortController: AbortController
  ): Promise<PlayerHttpResponse> {
    if (this.disposed || !this.requestInterceptor || !this.responseInterceptor || !this.requestMetadataManager) {
      throw new ShakaError(ShakaError.Severity.CRITICAL, ShakaError.Category.NETWORK, ShakaError.Code.OPERATION_ABORTED, url)
    }

    const baseRequest: PlayerHttpRequest = { url, method: 'GET', headers: { ...extraHeaders }, segment }
    const finalRequest = (await this.requestInterceptor(baseRequest)) ?? baseRequest

    let fetchResponse: Response
    try {
      fetchResponse = await fetch(finalRequest.url, {
        method: finalRequest.method,
        headers: finalRequest.headers,
        body: finalRequest.body as BodyInit | null | undefined,
        signal: abortController.signal
      })
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new ShakaError(ShakaError.Severity.RECOVERABLE, ShakaError.Category.NETWORK, ShakaError.Code.OPERATION_ABORTED, url)
      }
      throw new ShakaError(ShakaError.Severity.RECOVERABLE, ShakaError.Category.NETWORK, ShakaError.Code.HTTP_ERROR, url, error)
    }

    if (!fetchResponse.ok) {
      const severity = fetchResponse.status === 401 || fetchResponse.status === 403 ? ShakaError.Severity.CRITICAL : ShakaError.Severity.RECOVERABLE
      throw new ShakaError(severity, ShakaError.Category.NETWORK, ShakaError.Code.BAD_HTTP_STATUS, url, fetchResponse.status, '', {}, undefined, url)
    }

    const metadata = this.requestMetadataManager.getRequestMetadata(finalRequest.url)
    if (!metadata) {
      throw new ShakaError(ShakaError.Severity.CRITICAL, ShakaError.Category.NETWORK, ShakaError.Code.HTTP_ERROR, url, new Error('SABR request metadata missing (request interceptor did not run?)'))
    }

    const processor = new SabrUmpProcessor(metadata, this.cacheManager ?? undefined)
    const reader = fetchResponse.body?.getReader()

    let result: UmpProcessingResult | undefined
    if (reader) {
      let chunk = await reader.read()
      while (!chunk.done && !result) {
        result = await processor.processChunk(chunk.value)
        if (!result) chunk = await reader.read()
      }
    }

    const response: PlayerHttpResponse = {
      url: finalRequest.url,
      method: finalRequest.method,
      headers: {},
      data: result?.data,
      makeRequest: (followupUrl, followupHeaders) => this.runRequestCycle(followupUrl, followupHeaders, segment, abortController)
    }

    return (await this.responseInterceptor(response)) ?? response
  }
}

let schemeRegistered = false
let activeAdapter: ShakaSabrPlayerAdapter | null = null

export function setActiveSabrPlayerAdapter(adapter: ShakaSabrPlayerAdapter | null): void {
  activeAdapter = adapter
}

/** Idempotent — safe to call on every SABR video load. */
export function ensureSabrSchemeRegistered(): void {
  if (schemeRegistered) return

  shaka.net.NetworkingEngine.registerScheme('sabr', (uri, request) => {
    if (!activeAdapter) {
      return AbortableOperation.failed(
        new ShakaError(ShakaError.Severity.CRITICAL, ShakaError.Category.NETWORK, ShakaError.Code.HTTP_ERROR, uri, new Error('No active SABR player adapter'))
      )
    }
    return activeAdapter.handleShakaRequest(uri, request)
  })

  schemeRegistered = true
}
