// Shared between main and renderer so both sides agree on channel names and payload shapes.

export const IPC_CHANNELS = {
  GET_VIDEO_INFO: 'youtube:get-video-info',
  SEARCH: 'youtube:search',
  GET_CHANNEL: 'youtube:get-channel',
  GET_HOME_FEED: 'youtube:get-home-feed',
  HISTORY_LIST: 'history:list',
  HISTORY_CLEAR: 'history:clear',
  SUBSCRIPTIONS_LIST: 'subscriptions:list',
  SUBSCRIPTIONS_FEED: 'subscriptions:feed',
  SUBSCRIPTIONS_ADD: 'subscriptions:add',
  SUBSCRIPTIONS_REMOVE: 'subscriptions:remove'
} as const

export interface HistoryEntry {
  videoId: string
  title: string
  channelId: string | null
  channelName: string
  thumbnailUrl: string | null
  /** Unix ms timestamp of the most recent time this video was opened. */
  watchedAt: number
}

export interface VideoInfoRequest {
  videoId: string
}

export interface SearchRequest {
  query: string
}

export interface SearchResultItem {
  videoId: string
  title: string
  channelId: string | null
  channelName: string
  thumbnailUrl: string | null
  durationText: string | null
  viewCountText: string | null
  publishedText: string | null
}

export type SearchResponse = { ok: true; data: SearchResultItem[] } | { ok: false; error: string }

export interface ChannelInfoResult {
  channelId: string
  name: string
  thumbnailUrl: string | null
  subscriberCountText: string | null
  videos: SearchResultItem[]
}

export type ChannelResponse = { ok: true; data: ChannelInfoResult } | { ok: false; error: string }

export interface Subscription {
  channelId: string
  channelName: string
  thumbnailUrl: string | null
  subscribedAt: number
}

/** One adaptive (audio-only or video-only) format, as needed to build a segment index for it. */
export interface SabrFormatInfo {
  itag: number
  lastModified: string
  mimeType: string
  xtags?: string
  bitrate: number
  initRange: { start: number; end: number }
  indexRange: { start: number; end: number }
  width?: number
  height?: number
  frameRate?: number
  language?: string | null
  audioSampleRate?: number
  audioChannels?: number
  spatialAudio: boolean
  colorPrimaries?: string
  colorTransferCharacteristics?: string
}

/**
 * Everything the renderer needs to reconstruct a playable shaka.Manifest for
 * a video that YouTube only serves through SABR (no direct/DASH URLs). This
 * is our own JSON shape, not a YouTube format — see
 * src/renderer/src/player/sabr/manifestParser.ts.
 */
export interface SabrManifestInfo {
  durationSeconds: number
  formats: SabrFormatInfo[]
}

/** Everything the `sabr:` network scheme needs to keep talking to the ABR endpoint. */
export interface SabrStreamInfo {
  /** The (already deciphered) server_abr_streaming_url, with alr/cpn query params set. */
  abrUrl: string
  poToken: string
  /** Base64, opaque — forwarded as-is inside the VideoPlaybackAbrRequest. */
  ustreamerConfigB64: string
  clientInfo: {
    clientNameId: number
    clientVersion: string
    osName: string
    osVersion: string
  }
}

export interface CaptionTrack {
  url: string
  languageCode: string
  label: string
  /** True for YouTube's auto-generated ("ASR") captions, as opposed to uploaded ones. */
  isAutomatic: boolean
}

export interface VideoInfoResult {
  videoId: string
  title: string
  channelId: string | null
  channelName: string
  thumbnailUrl: string | null
  lengthSeconds: number | null
  captions: CaptionTrack[]
  /** WebVTT thumbnails track (built from YouTube's storyboard spec) for the seek-bar hover preview, or null when the video has no storyboard. */
  storyboardVtt: string | null
  relatedVideos: SearchResultItem[]
  /**
   * A DASH manifest (XML), built by youtubei.js's `toDash()` from the video's
   * adaptive formats, already deciphered using the session's poToken. `null`
   * when generation failed, or when the video needs SABR (see `sabr` below).
   */
  dashManifest: string | null
  /**
   * Set instead of `dashManifest` when YouTube requires the SABR/UMP
   * streaming protocol for this video (most current videos). `null` when the
   * video doesn't need SABR, or when building the SABR payload itself failed.
   */
  sabr: { manifest: SabrManifestInfo; stream: SabrStreamInfo } | null
}

export type VideoInfoResponse =
  | { ok: true; data: VideoInfoResult }
  | { ok: false; error: string }
