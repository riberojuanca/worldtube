// The ui build (not the core-only 'shaka-player' entry point): GlobalPlayerHost
// uses shaka.ui.Overlay for the control bar, and it needs to be the SAME
// bundled copy of shaka as everywhere else that touches the player/manifest —
// two separate copies of the shaka namespace in one page don't recognize each
// other's classes.
import shaka from 'shaka-player/dist/shaka-player.ui.js'
import type { SabrFormatInfo, SabrManifestInfo } from '../../../../shared/ipc'
import { keyOfFormatInfo, isAudioFormat } from './format'
import { buildInitUri } from './sabrUri'
import { parseMp4Sidx } from './mp4Sidx'
import { parseWebmCues, parseWebmTimingInfo } from './webmCues'

export const SABR_JSON_MIME = 'application/sabr+json'

export function buildSabrManifestUri(manifest: SabrManifestInfo): string {
  return `data:${SABR_JSON_MIME},${encodeURIComponent(JSON.stringify(manifest))}`
}

const CODECS_RE = /codecs="?([^",]+)"?/

function codecsOf(mimeType: string): string {
  return mimeType.match(CODECS_RE)?.[1] ?? ''
}

/**
 * Fetches a format's init response (through the `sabr:` scheme — see
 * playerAdapter.ts) and slices out the init/index byte ranges YouTube told us
 * about, so we don't refetch it for every quality/track switch.
 */
async function fetchInitResponse(
  format: SabrFormatInfo,
  networkingEngine: shaka.net.NetworkingEngine
): Promise<ArrayBuffer> {
  const uri = buildInitUri(isAudioFormat(format) ? 'audio' : 'video', keyOfFormatInfo(format))

  const request: shaka.extern.Request = {
    method: 'GET',
    uris: [uri],
    attempt: 0,
    body: null,
    headers: {},
    allowCrossSiteCredentials: false,
    retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
    licenseRequestType: null,
    sessionId: null,
    drmInfo: null,
    initData: null,
    initDataType: null,
    streamDataCallback: null
  }

  const response = await networkingEngine.request(shaka.net.NetworkingEngine.RequestType.SEGMENT, request, {
    type: shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT
  }).promise

  return ArrayBuffer.isView(response.data) ? (response.data.buffer as ArrayBuffer) : response.data
}

function buildMediaQuality(stream: shaka.extern.Stream): shaka.extern.MediaQualityInfo {
  return {
    contentType: stream.type,
    bandwidth: stream.bandwidth ?? 0,
    mimeType: stream.mimeType,
    codecs: stream.codecs,
    language: stream.language,
    label: stream.label,
    audioSamplingRate: stream.audioSamplingRate,
    channelsCount: stream.channelsCount,
    width: stream.width ?? null,
    height: stream.height ?? null,
    frameRate: stream.frameRate ?? null,
    roles: stream.roles,
    pixelAspectRatio: stream.pixelAspectRatio ?? null
  }
}

async function buildSegmentIndex(
  format: SabrFormatInfo,
  stream: shaka.extern.Stream,
  durationSeconds: number,
  networkingEngine: shaka.net.NetworkingEngine
): Promise<shaka.media.SegmentIndex> {
  const initResponse = await fetchInitResponse(format, networkingEngine)
  const initData = initResponse.slice(format.initRange.start, format.initRange.end + 1)
  const indexData = initResponse.slice(format.indexRange.start, format.indexRange.end + 1)

  const kind = isAudioFormat(format) ? 'audio' : 'video'
  const key = keyOfFormatInfo(format)
  const initUri = buildInitUri(kind, key)

  const initSegmentReference = new shaka.media.InitSegmentReference(
    () => [initUri],
    format.initRange.start,
    format.initRange.end,
    buildMediaQuality(stream),
    null,
    initData,
    null
  )

  const references: shaka.media.SegmentReference[] = []

  if (format.mimeType.includes('/webm')) {
    const timing = parseWebmTimingInfo(initData)
    let sq = 1
    for (const ref of parseWebmCues(indexData, timing)) {
      const uri = `${initUri.split('&init')[0]}&sq=${sq++}&startTimeMs=${Math.round(ref.startSeconds * 1000)}`
      references.push(
        new shaka.media.SegmentReference(
          ref.startSeconds,
          ref.endSeconds,
          () => [uri],
          ref.startByte,
          ref.endByte,
          initSegmentReference,
          0,
          0,
          Infinity
        )
      )
    }
  } else {
    let sq = 1
    for (const ref of parseMp4Sidx(indexData, format.indexRange.start)) {
      const uri = `${initUri.split('&init')[0]}&sq=${sq++}&startTimeMs=${Math.round(ref.startSeconds * 1000)}`
      references.push(
        new shaka.media.SegmentReference(
          ref.startSeconds,
          ref.endSeconds,
          () => [uri],
          ref.startByte,
          ref.endByte,
          initSegmentReference,
          0,
          0,
          Infinity
        )
      )
    }
  }

  // Slightly longer than the shortest format's duration would make the
  // player stall trying to reach a time no stream actually has data for.
  void durationSeconds

  return new shaka.media.SegmentIndex(references)
}

function baseStreamFields(): Pick<
  shaka.extern.Stream,
  | 'accessibilityPurpose'
  | 'closedCaptions'
  | 'drmInfos'
  | 'emsgSchemeIdUris'
  | 'encrypted'
  | 'external'
  | 'fastSwitching'
  | 'forced'
  | 'groupId'
  | 'isAudioMuxedInVideo'
  | 'isIframe'
  | 'keyIds'
  | 'baseOriginalId'
  | 'dependencyStream'
  | 'supplementalCodecs'
  | 'trickModeVideo'
  | 'matchedStreams'
> {
  return {
    accessibilityPurpose: null,
    closedCaptions: null,
    drmInfos: [],
    emsgSchemeIdUris: null,
    encrypted: false,
    external: false,
    fastSwitching: false,
    forced: false,
    groupId: null,
    isAudioMuxedInVideo: false,
    isIframe: false,
    keyIds: new Set(),
    baseOriginalId: null,
    dependencyStream: null,
    supplementalCodecs: '',
    trickModeVideo: null,
    matchedStreams: undefined
  }
}

function createAudioStream(
  format: SabrFormatInfo,
  id: number,
  durationSeconds: number,
  networkingEngine: shaka.net.NetworkingEngine
): shaka.extern.Stream {
  const stream: shaka.extern.Stream = {
    ...baseStreamFields(),
    type: 'audio',
    id,
    originalId: keyOfFormatInfo(format),
    mimeType: format.mimeType.split(';', 1)[0],
    codecs: codecsOf(format.mimeType),
    fullMimeTypes: new Set([format.mimeType]),
    bandwidth: format.bitrate,
    audioSamplingRate: format.audioSampleRate ?? null,
    channelsCount: format.audioChannels ?? null,
    label: null,
    language: format.language ?? 'und',
    originalLanguage: format.language ?? null,
    spatialAudio: format.spatialAudio,
    roles: [],
    primary: true,
    segmentIndex: null,
    createSegmentIndex: async () => {
      if (stream.segmentIndex) return
      stream.segmentIndex = await buildSegmentIndex(format, stream, durationSeconds, networkingEngine)
    },
    closeSegmentIndex: () => {
      stream.segmentIndex?.release()
      stream.segmentIndex = null
    }
  }
  return stream
}

function createVideoStream(
  format: SabrFormatInfo,
  id: number,
  durationSeconds: number,
  networkingEngine: shaka.net.NetworkingEngine
): shaka.extern.Stream {
  const hdr =
    format.colorTransferCharacteristics === 'SMPTEST2084'
      ? 'PQ'
      : format.colorTransferCharacteristics === 'ARIB_STD_B67'
        ? 'HLG'
        : 'SDR'

  const stream: shaka.extern.Stream = {
    ...baseStreamFields(),
    type: 'video',
    id,
    originalId: keyOfFormatInfo(format),
    mimeType: format.mimeType.split(';', 1)[0],
    codecs: codecsOf(format.mimeType),
    fullMimeTypes: new Set([format.mimeType]),
    bandwidth: format.bitrate,
    width: format.width,
    height: format.height,
    frameRate: format.frameRate,
    colorGamut: format.colorPrimaries === 'BT2020' ? 'rec2020' : 'srgb',
    hdr,
    roles: [],
    label: null,
    language: 'und',
    originalLanguage: null,
    primary: false,
    spatialAudio: false,
    audioSamplingRate: null,
    channelsCount: null,
    segmentIndex: null,
    createSegmentIndex: async () => {
      if (stream.segmentIndex) return
      stream.segmentIndex = await buildSegmentIndex(format, stream, durationSeconds, networkingEngine)
    },
    closeSegmentIndex: () => {
      stream.segmentIndex?.release()
      stream.segmentIndex = null
    }
  }
  return stream
}

/**
 * shaka.extern.ManifestParser for our own `application/sabr+json` mime type —
 * turns the JSON payload built by src/main/sabrManifest.ts into a shaka
 * Manifest. Segment data itself is fetched through the `sabr:` network
 * scheme (playerAdapter.ts), which is where the actual SABR/UMP protocol
 * (via the `googlevideo` package) lives.
 */
export class SabrManifestParser implements shaka.extern.ManifestParser {
  private networkingEngine: shaka.net.NetworkingEngine | null = null

  banLocation(): void {}
  configure(): void {}
  onExpirationUpdated(): void {}
  onInitialVariantChosen(): void {}
  setMediaElement(): void {}
  // No-op: our manifest is a one-shot static JSON blob, there's nothing to refresh.
  update(): void {}

  async start(uri: string, playerInterface: shaka.extern.ManifestParser.PlayerInterface): Promise<shaka.extern.Manifest> {
    this.networkingEngine = playerInterface.networkingEngine

    const prefixLength = `data:${SABR_JSON_MIME},`.length
    const data: SabrManifestInfo = JSON.parse(decodeURIComponent(uri.slice(prefixLength)))

    const timeline = new shaka.media.PresentationTimeline(0, 0, true)
    timeline.setStatic(true)
    timeline.setSegmentAvailabilityDuration(Infinity)
    timeline.lockStartTime()
    timeline.setDuration(data.durationSeconds)

    let nextId = 0
    const audioStreams: shaka.extern.Stream[] = []
    const videoStreams: shaka.extern.Stream[] = []

    for (const format of data.formats) {
      if (isAudioFormat(format)) {
        audioStreams.push(createAudioStream(format, nextId++, data.durationSeconds, this.networkingEngine))
      } else {
        videoStreams.push(createVideoStream(format, nextId++, data.durationSeconds, this.networkingEngine))
      }
    }

    audioStreams.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0))
    videoStreams.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0))

    const variants: shaka.extern.Variant[] = []
    let variantId = 0
    for (const audio of audioStreams) {
      for (const video of videoStreams) {
        variants.push({
          id: variantId++,
          audio,
          video,
          bandwidth: (audio.bandwidth ?? 0) + (video.bandwidth ?? 0),
          language: audio.language,
          allowedByApplication: true,
          allowedByKeySystem: true,
          decodingInfos: [],
          disabledUntilTime: 0,
          primary: audio.primary
        })
      }
    }
    // Audio-only fallback, in case a video-less format list ever shows up.
    if (videoStreams.length === 0) {
      for (const audio of audioStreams) {
        variants.push({
          id: variantId++,
          audio,
          video: null,
          bandwidth: audio.bandwidth ?? 0,
          language: audio.language,
          allowedByApplication: true,
          allowedByKeySystem: true,
          decodingInfos: [],
          disabledUntilTime: 0,
          primary: audio.primary
        })
      }
    }

    const manifest: shaka.extern.Manifest = {
      type: 'SABR',
      startTime: 0,
      variants,
      textStreams: [],
      imageStreams: [],
      chapterStreams: [],
      presentationTimeline: timeline,
      gapCount: 0,
      ignoreManifestTimestampsInSegmentsMode: false,
      isLowLatency: false,
      nextUrl: null,
      offlineSessionIds: [],
      periodCount: 1,
      sequenceMode: false,
      serviceDescription: null
    }

    await playerInterface.filter(manifest)
    return manifest
  }

  stop(): Promise<void> {
    this.networkingEngine = null
    return Promise.resolve()
  }
}

let registered = false

/** Idempotent — safe to call on every SABR video load. */
export function ensureSabrManifestParserRegistered(): void {
  if (registered) return
  shaka.media.ManifestParser.registerParserByMime(SABR_JSON_MIME, () => new SabrManifestParser())
  registered = true
}
