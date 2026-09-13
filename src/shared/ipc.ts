// Shared between main and renderer so both sides agree on channel names and payload shapes.

export const IPC_CHANNELS = {
  GET_VIDEO_INFO: 'youtube:get-video-info',
  SEARCH: 'youtube:search',
  SEARCH_SUGGESTIONS: 'youtube:search-suggestions',
  GET_CHANNEL: 'youtube:get-channel',
  CHANNEL_PAGE: 'youtube:channel-page',
  GET_HOME_FEED: 'youtube:get-home-feed',
  PLAYER_AUDIO_GET: 'player:audio-get',
  PLAYER_AUDIO_SET: 'player:audio-set',
  SESSION_GET_STATE: 'session:get-state',
  SESSION_CREATE_USER: 'session:create-user',
  SESSION_LOGIN: 'session:login',
  SESSION_LOGOUT: 'session:logout',
  SESSION_DELETE_USER: 'session:delete-user',
  DATA_EXPORT: 'data:export',
  DATA_IMPORT: 'data:import',
  PROFILES_GET_STATE: 'profiles:get-state',
  PROFILES_CREATE: 'profiles:create',
  PROFILES_UPDATE: 'profiles:update',
  PROFILES_SET_ACTIVE: 'profiles:set-active',
  PROFILES_REMOVE: 'profiles:remove',
  HISTORY_LIST: 'history:list',
  HISTORY_CLEAR: 'history:clear',
  SAVED_PLAYLISTS_LIST: 'saved:playlists:list',
  SAVED_PLAYLISTS_CREATE: 'saved:playlists:create',
  SAVED_VIDEOS_LIST: 'saved:videos:list',
  SAVED_VIDEOS_SAVE: 'saved:videos:save',
  SAVED_VIDEOS_REMOVE: 'saved:videos:remove',
  SEARCH_HISTORY_LIST: 'search-history:list',
  SEARCH_HISTORY_RECORD: 'search-history:record',
  SUBSCRIPTIONS_LIST: 'subscriptions:list',
  SUBSCRIPTIONS_FEED: 'subscriptions:feed',
  SUBSCRIPTIONS_ADD: 'subscriptions:add',
  SUBSCRIPTIONS_REMOVE: 'subscriptions:remove'
} as const

export interface LocalUser {
  id: string
  name: string
  hasPassword: boolean
  createdAt: number
  updatedAt: number
}

export interface UserProfile {
  id: string
  userId: string
  name: string
  color: string
  textColor: string
  avatarDataUrl: string | null
  createdAt: number
  updatedAt: number
}

export interface SavedPlaylist {
  id: string
  profileId: string
  name: string
  description: string | null
  createdAt: number
  updatedAt: number
}

export interface SavedVideo {
  id: string
  profileId: string
  videoId: string
  title: string
  channelId: string | null
  channelName: string
  thumbnailUrl: string | null
  playlistId: string | null
  savedAt: number
}

export interface SaveVideoRequest {
  videoId: string
  title: string
  channelId: string | null
  channelName: string
  thumbnailUrl: string | null
  playlistId: string | null
}

export interface CreateSavedPlaylistRequest {
  name: string
  description?: string | null
}

export interface SearchHistoryEntry {
  query: string
  searchedAt: number
}

export interface LocalSessionState {
  users: LocalUser[]
  activeUserId: string | null
  activeUser: LocalUser | null
  profiles: UserProfile[]
  activeProfileId: string | null
  activeProfile: UserProfile | null
  setupRequired: boolean
  dataPath: string
  storageVersion: number
  stats: {
    users: number
    profiles: number
    activeHistoryEntries: number
    activeSubscriptions: number
    activeSavedPlaylists: number
    activeSavedVideos: number
    historyEntries: number
    subscriptions: number
    savedPlaylists: number
    savedVideos: number
    settingsKeys: number
  }
}

export interface ProfilesState {
  profiles: UserProfile[]
  activeProfileId: string
  activeProfile: UserProfile
}

export interface CreateLocalUserRequest {
  name: string
  password?: string
}

export interface LoginLocalUserRequest {
  userId: string
  password?: string
}

export interface DeleteLocalUserRequest {
  userId: string
}

export interface CreateProfileRequest {
  name: string
  color?: string
}

export interface UpdateProfileRequest {
  id: string
  name?: string
  color?: string
  textColor?: string
  avatarDataUrl?: string | null
}

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

export interface PlayerAudioPreferences {
  volume: number
  muted: boolean
}

export type SearchResponse = { ok: true; data: SearchResultItem[] } | { ok: false; error: string }

export type SearchSuggestionsResponse = { ok: true; data: string[] } | { ok: false; error: string }

export interface ChannelInfoResult {
  channelId: string
  name: string
  thumbnailUrl: string | null
  subscriberCountText: string | null
  videos: SearchResultItem[]
  tabs?: ChannelTab[]
  description?: string | null
  bannerUrl?: string | null
}

export type ChannelTab = 'home' | 'videos' | 'shorts' | 'live' | 'playlists' | 'podcasts' | 'releases' | 'courses' | 'community' | 'about' | 'search'

export interface ChannelPageRequest {
  channelId: string
  tab: ChannelTab
  filter?: string
  sort?: string
  secondaryFilter?: string
  contentType?: string
  query?: string
  continuation?: string
  playlistId?: string
}

export interface ChannelPlaylistItem {
  playlistId: string
  title: string
  thumbnailUrl: string | null
  videoCountText: string | null
}

export interface ChannelPostItem {
  id: string
  text: string
  publishedText: string | null
  images: string[]
  videos: SearchResultItem[]
  playlists: ChannelPlaylistItem[]
  pollChoices: string[]
}

export interface ChannelSection {
  title: string
  videos: SearchResultItem[]
  playlists: ChannelPlaylistItem[]
}

export interface ChannelPageResult {
  videos: SearchResultItem[]
  playlists: ChannelPlaylistItem[]
  posts: ChannelPostItem[]
  sections: ChannelSection[]
  filters: string[]
  sorts: string[]
  secondaryFilters: string[]
  contentTypes: string[]
  continuation: string | null
  about: { description: string; details: string[]; links: { title: string; url: string }[] } | null
}

export type ChannelPageResponse = { ok: true; data: ChannelPageResult } | { ok: false; error: string }

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
  isOriginal?: boolean
  isDefault?: boolean
  audioLabel?: string
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
  channelThumbnailUrl: string | null
  subscriberCountText: string | null
  thumbnailUrl: string | null
  lengthSeconds: number | null
  durationText: string | null
  viewCountText: string | null
  likeCountText: string | null
  publishedText: string | null
  category: string | null
  description: string | null
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
