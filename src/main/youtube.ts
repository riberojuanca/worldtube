import { Innertube, Platform, YTNodes } from 'youtubei.js'
import { generatePoToken } from './poToken'
import { buildSabrPayload } from './sabrManifest'
import { evaluatePlayerScript } from './jsEvaluator'
import { recordHistoryEntry } from './historyStore'
import type { CaptionTrack, ChannelInfoResult, SearchResultItem, VideoInfoResult } from '../shared/ipc'

type VideoOrGridVideo =
  | InstanceType<typeof YTNodes.Video>
  | InstanceType<typeof YTNodes.GridVideo>
  | InstanceType<typeof YTNodes.CompactVideo>
  | InstanceType<typeof YTNodes.CompactMovie>

type LockupView = InstanceType<typeof YTNodes.LockupView>

type TextLike = { text?: string; toString(): string }
type MetadataPartLike = {
  text?: TextLike | null
  avatar_stack?: { text?: TextLike | null } | null
}
type MetadataRowLike = {
  metadata_parts?: MetadataPartLike[]
  badges?: { style?: string }[]
}
type ThumbnailViewLike = {
  image?: { url: string }[]
  overlays?: unknown[]
}
type CollectionThumbnailViewLike = {
  primary_thumbnail?: ThumbnailViewLike | null
}
type OverlayWithBadges = {
  badges?: { text?: string; badge_style?: string }[]
}

const VIEWS_OR_WATCHING_REGEX = /views?|watching|waiting/i
const VIEWS_IN_NUMBER_ONLY = /^\d+(\.\d)?[bkm]?$/i
const PREMIERES_TIME_REGEX = /^(premieres|scheduled for) /i
const PUBLISH_TIME_REGEX = /^(streamed )?\d+ ?\w+? ago/i

function isViewCountText(text: string | undefined): boolean {
  if (typeof text !== 'string') return false
  return VIEWS_OR_WATCHING_REGEX.test(text) || VIEWS_IN_NUMBER_ONLY.test(text)
}

function isPremieresTimeText(text: string | undefined): boolean {
  if (typeof text !== 'string') return false
  return PREMIERES_TIME_REGEX.test(text)
}

function isPublishTimeText(text: string | undefined): boolean {
  if (typeof text !== 'string') return false
  return PUBLISH_TIME_REGEX.test(text)
}

function textValue(text: TextLike | string | null | undefined): string | null {
  if (!text) return null
  if (typeof text === 'string') return text
  return text.text ?? text.toString()
}

function isCollectionThumbnailView(image: unknown): image is CollectionThumbnailViewLike {
  return typeof image === 'object' && image !== null && 'primary_thumbnail' in image
}

function isThumbnailView(image: unknown): image is ThumbnailViewLike {
  return typeof image === 'object' && image !== null && 'image' in image
}

function getLockupPrimaryThumbnail(lockup: LockupView): ThumbnailViewLike | null {
  const image = lockup.content_image
  if (isCollectionThumbnailView(image)) return image.primary_thumbnail ?? null
  if (isThumbnailView(image)) return image
  return null
}

export function getLockupThumbnailUrl(lockup: LockupView): string | null {
  return getLockupPrimaryThumbnail(lockup)?.image?.at(-1)?.url ?? null
}

function getLockupDurationText(lockup: LockupView): string | null {
  const overlays = getLockupPrimaryThumbnail(lockup)?.overlays ?? []
  for (const overlay of overlays) {
    const badges = (overlay as OverlayWithBadges).badges ?? []
    for (const badge of badges) {
      if (badge.badge_style === 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE') return null
      if (badge.text && /^[\d:]+$/.test(badge.text)) return badge.text
    }
  }
  return null
}

function getLockupMetadataRows(lockup: LockupView): MetadataRowLike[] {
  return (lockup.metadata?.metadata?.metadata_rows ?? []) as MetadataRowLike[]
}

function getLockupPublishedText(lockup: LockupView): string | null {
  for (const row of getLockupMetadataRows(lockup)) {
    const found = row.metadata_parts?.find((part) => isPublishTimeText(textValue(part.text) ?? undefined))
    const text = textValue(found?.text)
    if (text) return text
  }
  return null
}

function isMembersOnlyLockup(lockup: LockupView): boolean {
  return getLockupMetadataRows(lockup).some((row) => row.badges?.some((badge) => badge.style === 'BADGE_MEMBERS_ONLY'))
}

function getLockupChannelName(lockup: LockupView, fallbackChannelName = '(desconocido)'): string {
  const firstPart = getLockupMetadataRows(lockup)[0]?.metadata_parts?.[0]
  const maybeAuthor = textValue(firstPart?.text)
  if (maybeAuthor && !isViewCountText(maybeAuthor) && !isPremieresTimeText(maybeAuthor)) {
    return maybeAuthor
  }

  return textValue(firstPart?.avatar_stack?.text) ?? fallbackChannelName
}

function getLockupChannelId(lockup: LockupView, fallbackChannelId: string | null = null): string | null {
  return lockup.metadata?.image?.renderer_context?.command_context?.on_tap?.payload?.browseId ?? fallbackChannelId
}

function mapLockupView(lockup: LockupView, fallbackChannelId: string | null = null, fallbackChannelName = '(desconocido)'): SearchResultItem | null {
  if (lockup.content_type !== 'VIDEO' && lockup.content_type !== 'STATION') return null
  if (isMembersOnlyLockup(lockup)) return null

  return {
    videoId: lockup.content_id,
    title: textValue(lockup.metadata?.title) ?? '(sin título)',
    channelId: getLockupChannelId(lockup, fallbackChannelId),
    channelName: getLockupChannelName(lockup, fallbackChannelName),
    thumbnailUrl: getLockupThumbnailUrl(lockup),
    durationText: getLockupDurationText(lockup),
    viewCountText: null,
    publishedText: getLockupPublishedText(lockup)
  }
}

/**
 * Maps the common video nodes youtubei.js hands back from search, the home
 * feed, channel video tabs and part of the watch-next feed into our own flat
 * shape. Watch-next has a wider mapper below because YouTube increasingly
 * returns recommendations as LockupView nodes.
 */
function mapVideoNodes(
  nodes: readonly VideoOrGridVideo[],
  fallbackChannelId: string | null = null,
  fallbackChannelName = '(desconocido)'
): SearchResultItem[] {
  // Video and CompactVideo share the same shape here (a `.duration` getter
  // returning `{ text }`, a non-nullable `.best_thumbnail`, and `.view_count`)
  // — only GridVideo differs (plain `.duration` Text, `.views` instead of
  // `.view_count`, no `.best_thumbnail`).
  return nodes.map((video) => {
    const isGridVideo = video instanceof YTNodes.GridVideo
    const isCompactMovie = video instanceof YTNodes.CompactMovie
    return {
      videoId: isCompactMovie ? video.id : video.video_id,
      title: video.title.toString(),
      channelId: video.author?.id ?? fallbackChannelId,
      channelName: video.author?.name ?? fallbackChannelName,
      thumbnailUrl: (isGridVideo || isCompactMovie ? video.thumbnails?.at(-1)?.url : video.best_thumbnail?.url) ?? null,
      durationText: (isGridVideo ? video.duration?.toString() : video.duration.text) ?? null,
      viewCountText:
        (isCompactMovie ? null : video.short_view_count?.toString()) ??
        (isGridVideo ? video.views?.toString() : isCompactMovie ? null : video.view_count?.toString()) ??
        null,
      publishedText: (isCompactMovie ? null : video.published?.toString()) ?? null
    }
  })
}

export function mapSearchResultNodes(
  nodes: readonly unknown[],
  fallbackChannelId: string | null = null,
  fallbackChannelName = '(desconocido)'
): SearchResultItem[] {
  const videos: SearchResultItem[] = []

  for (const item of nodes) {
    if (
      item instanceof YTNodes.Video ||
      item instanceof YTNodes.GridVideo ||
      item instanceof YTNodes.CompactVideo ||
      item instanceof YTNodes.CompactMovie
    ) {
      videos.push(...mapVideoNodes([item], fallbackChannelId, fallbackChannelName))
      continue
    }

    if (item instanceof YTNodes.LockupView) {
      const mapped = mapLockupView(item, fallbackChannelId, fallbackChannelName)
      if (mapped) videos.push(mapped)
    }
  }

  return videos
}

function mapWatchNextFeed(nodes: readonly unknown[]): SearchResultItem[] {
  return mapSearchResultNodes(nodes)
}

// See jsEvaluator.ts — without this, deciphering (server_abr_streaming_url,
// signature-ciphered legacy formats) throws on every video that needs it.
// PlatformShim's type isn't exported publicly; this is the shape Player.js
// actually calls it with.
;(Platform.shim as unknown as { eval: typeof evaluatePlayerScript }).eval = evaluatePlayerScript

let clientPromise: Promise<Innertube> | null = null

export function getClient(): Promise<Innertube> {
  // retrieve_player: without the JS player, youtubei.js can't decipher
  // signature-ciphered format URLs at all ("Deciphering formats is not
  // possible without the JS player" per its own types) — that's exactly
  // what toDash() needs and was missing.
  clientPromise ??= Innertube.create({ generate_session_locally: true, retrieve_player: true })
  return clientPromise
}

const channelCache = new Map<string, { promise: Promise<Awaited<ReturnType<Innertube['getChannel']>>>; expiresAt: number }>()

export function getBrowseChannel(channelId: string): Promise<Awaited<ReturnType<Innertube['getChannel']>>> {
  const cached = channelCache.get(channelId)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const promise = getClient().then((yt) => yt.getChannel(channelId)).catch((error) => {
    channelCache.delete(channelId)
    throw error
  })
  channelCache.set(channelId, { promise, expiresAt: Date.now() + 5 * 60 * 1000 })
  while (channelCache.size > 30) channelCache.delete(channelCache.keys().next().value!)
  return promise
}

// Keyed by videoId so concurrent requests for the same video share one
// in-flight execution instead of racing (react StrictMode's double-invoke,
// a dev HMR remount losing renderer-side state, or just a double click can
// all trigger a second call before the first settles — each one used to open
// its own hidden BotGuard window on the same session partition and they'd
// step on each other).
const inFlightRequests = new Map<string, Promise<VideoInfoResult>>()

export function fetchVideoInfo(videoId: string): Promise<VideoInfoResult> {
  const existing = inFlightRequests.get(videoId)
  if (existing) {
    console.log(`[youtube] fetchVideoInfo(${videoId}) already in flight, reusing it`)
    return existing
  }

  const promise = fetchVideoInfoUncached(videoId).finally(() => {
    inFlightRequests.delete(videoId)
  })
  inFlightRequests.set(videoId, promise)
  return promise
}

export async function searchVideos(query: string): Promise<SearchResultItem[]> {
  console.log(`[youtube] searchVideos(${query})`)
  const yt = await getClient()
  const results = await yt.search(query, { type: 'video' })
  return mapSearchResultNodes(results.results.filterType(YTNodes.Video, YTNodes.GridVideo, YTNodes.LockupView))
}

export async function getSearchSuggestions(query: string): Promise<string[]> {
  const cleanQuery = query.trim()
  if (!cleanQuery) return []

  const yt = await getClient()
  const suggestions = await yt.getSearchSuggestions(cleanQuery)
  return Array.isArray(suggestions) ? suggestions.filter((suggestion): suggestion is string => typeof suggestion === 'string') : []
}

export async function getHomeFeed(): Promise<SearchResultItem[]> {
  console.log('[youtube] getHomeFeed()')
  const yt = await getClient()
  const feed = await yt.getHomeFeed()

  return mapSearchResultNodes(feed.videos.filterType(YTNodes.Video, YTNodes.GridVideo, YTNodes.LockupView))
}

export async function getChannelInfo(channelId: string, includeVideos = true): Promise<ChannelInfoResult> {
  console.log(`[youtube] getChannelInfo(${channelId})`)
  const channel = await getBrowseChannel(channelId)
  const videosTab = includeVideos && channel.has_videos ? await channel.getVideos() : channel
  const header = channel.header as { author?: { id?: string; name?: string; best_thumbnail?: { url: string } }; subscribers?: { toString(): string } } | undefined
  const resolvedChannelId = header?.author?.id ?? channel.metadata.external_id ?? channelId
  const channelName = header?.author?.name ?? channel.metadata.title ?? '(desconocido)'
  const pageHeader = channel.header instanceof YTNodes.PageHeader ? channel.header.content : null
  const pageImage = pageHeader?.image
  const pageAvatar = pageImage instanceof YTNodes.DecoratedAvatarView ? pageImage.avatar?.image?.at(-1)?.url
    : pageImage instanceof YTNodes.ContentPreviewImageView ? pageImage.image.at(-1)?.url : null
  const bannerUrl = pageHeader?.banner?.image.at(-1)?.url ??
    (channel.header instanceof YTNodes.C4TabbedHeader ? channel.header.banner?.at(-1)?.url : null)
  const metadataParts = pageHeader?.metadata?.metadata_rows.flatMap((row) => row.metadata_parts ?? []) ?? []

  const videos = includeVideos ? mapSearchResultNodes(videosTab.videos.filterType(YTNodes.Video, YTNodes.GridVideo, YTNodes.LockupView), resolvedChannelId, channelName) : []

  return {
    channelId: resolvedChannelId,
    name: channelName,
    thumbnailUrl: pageAvatar ?? header?.author?.best_thumbnail?.url ?? channel.metadata.avatar?.at(-1)?.url ?? channel.metadata.thumbnail?.at(-1)?.url ?? null,
    subscriberCountText: header?.subscribers?.toString() ?? metadataParts.map((part) => part.text?.toString()).find((text) => /subscribers|suscriptores/i.test(text ?? '')) ?? null,
    videos,
    description: channel.metadata.description ?? null,
    bannerUrl: bannerUrl ?? null,
    tabs: [
      ...(channel.has_home ? ['home' as const] : []),
      ...(channel.has_videos || channel.metadata.music_artist_name ? ['videos' as const] : []),
      ...(channel.has_shorts ? ['shorts' as const] : []),
      ...(channel.has_live_streams ? ['live' as const] : []),
      ...(channel.has_playlists ? ['playlists' as const] : []),
      ...(channel.has_podcasts ? ['podcasts' as const] : []),
      ...(channel.has_releases ? ['releases' as const] : []),
      ...(channel.has_courses ? ['courses' as const] : []),
      ...(channel.has_community ? ['community' as const] : []),
      'about',
      ...(channel.has_search ? ['search' as const] : [])
    ]
  }
}

const RELATIVE_TIME_UNIT_MS: Record<string, number> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000
}

/**
 * youtubei.js only hands back relative text ("3 days ago", "Streamed 2 weeks
 * ago") — there's no absolute timestamp on these nodes — so this is an
 * approximation good enough to sort a merged feed, not to display a real
 * date. Unparseable/missing text sorts as "epoch" (oldest last).
 */
function approximatePublishedAtMs(publishedText: string | null): number {
  if (!publishedText) return 0
  const match = publishedText.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i)
  if (!match) return 0
  const amount = Number(match[1])
  const unitMs = RELATIVE_TIME_UNIT_MS[match[2].toLowerCase()] ?? 0
  return Date.now() - amount * unitMs
}

/**
 * Merges the latest videos from every locally-subscribed channel (see
 * subscriptionsStore.ts — this is not a real YouTube account, just a local
 * list) into one feed, newest first per `approximatePublishedAtMs`.
 */
export async function getSubscriptionsFeed(channelIds: string[]): Promise<SearchResultItem[]> {
  console.log(`[youtube] getSubscriptionsFeed(${channelIds.length} channels)`)
  const channels = await Promise.all(
    channelIds.map((channelId) =>
      getChannelInfo(channelId).catch((error) => {
        console.error(`[youtube] getSubscriptionsFeed: failed to load channel ${channelId}`, error)
        return null
      })
    )
  )

  return channels
    .filter((channel): channel is ChannelInfoResult => channel !== null)
    .flatMap((channel) => channel.videos)
    .sort((a, b) => approximatePublishedAtMs(b.publishedText) - approximatePublishedAtMs(a.publishedText))
}

/**
 * Extracts subtitle/CC tracks from youtubei.js's captions data — plain
 * `<track>` elements in GlobalPlayerHost.tsx consume these directly (no
 * shaka involvement, works for both the DASH and SABR playback paths).
 * `base_url` returns YouTube's XML timedtext format by default; `fmt=vtt`
 * gets WebVTT, which the browser's native track element understands.
 */
function extractCaptionTracks(captions: {
  caption_tracks?: { base_url: string; name: { toString(): string }; language_code: string; kind?: string }[]
}): CaptionTrack[] {
  if (!captions.caption_tracks) return []

  return captions.caption_tracks.map((track) => {
    const url = new URL(track.base_url)
    url.searchParams.set('fmt', 'vtt')
    return {
      url: url.toString(),
      languageCode: track.language_code,
      label: track.name.toString(),
      isAutomatic: track.kind === 'asr'
    }
  })
}

function formatVttTimestamp(ms: number): string {
  const totalSeconds = ms / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`
}

/**
 * Converts YouTube's storyboard spec (a grid of tiny sprite-sheet images, one
 * tile per interval of the video) into a WebVTT "thumbnails" track — the
 * format shaka-player's stock UI expects for the seek-bar hover preview
 * (each cue's text is `<spriteUrl>#xywh=x,y,w,h}`, see
 * GlobalPlayerHost.tsx#loadThumbnailsTrack). Picks the last (most detailed)
 * board level YouTube offers; earlier levels are coarser previews meant for
 * the tiny scrubber YouTube's own web player shows before you start hovering.
 */
function buildStoryboardVtt(storyboards: unknown, videoLengthSeconds: number | null): string | null {
  if (!storyboards || typeof storyboards !== 'object' || !('boards' in storyboards) || !Array.isArray(storyboards.boards)) {
    return null
  }

  const board = storyboards.boards.at(-1) as
    | {
        template_url: string
        thumbnail_width: number
        thumbnail_height: number
        thumbnail_count: number
        interval: number
        columns: number
        rows: number
      }
    | undefined
  if (!board || board.thumbnail_count <= 0) return null

  const tilesPerPage = board.columns * board.rows
  const numberOfImages = Math.ceil(board.thumbnail_count / tilesPerPage)
  const intervalInSeconds = board.interval > 0
    ? board.interval / 1000
    : (videoLengthSeconds ?? 0) / (numberOfImages * tilesPerPage)
  const lines = ['WEBVTT', '']
  let startSeconds = 0

  for (let i = 0; i < numberOfImages; i++) {
    const spriteUrl = board.template_url.replace('$M.jpg', `${i}.jpg`)
    let x = 0
    let y = 0

    for (let j = 0; j < tilesPerPage; j++) {
      const endSeconds = startSeconds + intervalInSeconds
      lines.push(`${formatVttTimestamp(startSeconds * 1000)} --> ${formatVttTimestamp(endSeconds * 1000)}`)
      lines.push(`${spriteUrl}#xywh=${x},${y},${board.thumbnail_width},${board.thumbnail_height}`)
      lines.push('')

      startSeconds = endSeconds
      x = (x + board.thumbnail_width) % (board.thumbnail_width * board.columns)
      if (x === 0) y += board.thumbnail_height
    }
  }
  return lines.join('\n')
}

function getChannelThumbnailUrl(info: { secondary_info?: { owner?: { author?: { best_thumbnail?: { url: string }; avatar_thumbnail_url?: string } } | null } | null }): string | null {
  return info.secondary_info?.owner?.author?.best_thumbnail?.url ?? info.secondary_info?.owner?.author?.avatar_thumbnail_url ?? null
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('es-UY').format(value)
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('es-UY', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 }).format(value)
}

function formatDurationText(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatDateText(value: string | undefined): string | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

function getViewCountText(info: {
  basic_info: { view_count?: number }
  primary_info?: { view_count?: { view_count?: { toString(): string }; short_view_count?: { toString(): string } } | null } | null
}): string | null {
  const viewCount = info.basic_info.view_count
  if (typeof viewCount === 'number' && Number.isFinite(viewCount)) {
    return `${formatInteger(viewCount)} visualizaciones`
  }

  return info.primary_info?.view_count?.view_count?.toString() ?? info.primary_info?.view_count?.short_view_count?.toString() ?? null
}

function getLikeCountText(likeCount: number | undefined): string | null {
  if (typeof likeCount !== 'number' || !Number.isFinite(likeCount)) return null
  return formatCompactNumber(likeCount)
}

function getPublishedText(info: {
  primary_info?: { published?: { toString(): string } } | null
  page?: [unknown, unknown?]
}): string | null {
  const microformat = (info.page?.[0] as { microformat?: unknown } | undefined)?.microformat as
    | { publish_date?: string; upload_date?: string }
    | undefined
  return info.primary_info?.published?.toString() ?? formatDateText(microformat?.publish_date ?? microformat?.upload_date)
}

function getDescriptionText(info: { secondary_info?: { description?: { toString(): string } } | null; basic_info: { short_description?: string } }): string | null {
  const description = info.secondary_info?.description?.toString() ?? info.basic_info.short_description ?? null
  const trimmed = description?.trim()
  return trimmed ? trimmed : null
}

function getSubscriberCountText(info: { secondary_info?: { owner?: { subscriber_count?: { toString(): string } } | null } | null }): string | null {
  return info.secondary_info?.owner?.subscriber_count?.toString() ?? null
}

async function fetchVideoInfoUncached(videoId: string): Promise<VideoInfoResult> {
  const t0 = performance.now()
  console.log(`[youtube] fetchVideoInfo(${videoId})`)
  const yt = await getClient()

  // The poToken is content-bound to this exact videoId (see script.ts's
  // mintAsWebsafeString call), so it's minted fresh per video — but that
  // mint is now a cheap local call against a cached BotGuard window (see
  // poToken.ts), not a full challenge round trip every time.
  const tPoTokenStart = performance.now()
  const { poToken, visitorData } = await generatePoToken({ videoId })
  const tPoToken = performance.now() - tPoTokenStart
  console.log(`[youtube] poToken generated (${poToken.length} chars) in ${tPoToken.toFixed(0)}ms`)

  yt.session.context.client.visitorData = visitorData
  yt.session.po_token = poToken
  if (yt.session.player) {
    yt.session.player.po_token = poToken
  }

  const tGetInfoStart = performance.now()
  const info = await yt.getInfo(videoId, { po_token: poToken })
  const tGetInfo = performance.now() - tGetInfoStart
  console.log(`[youtube] getInfo ok, playability=${info.playability_status?.status} in ${tGetInfo.toFixed(0)}ms`)

  // Same check FreeTube does before ever calling toDash() (see
  // freetube-audio-lab/src/renderer/views/Watch/Watch.js around its
  // `createLocalSabrManifest` branch): when YouTube requires SABR for this
  // video, the adaptive formats it hands back don't carry a direct url /
  // signature_cipher / cipher at all — toDash() tries to decipher them
  // anyway and blows up with the unhelpful "No valid URL to decipher".
  // Detecting this up front means a clear message instead of that crash.
  const playerConfig = info.player_config as
    | { media_common_config?: { media_ustreamer_request_config?: unknown } }
    | undefined
  const requiresSabr =
    Boolean(info.streaming_data?.server_abr_streaming_url) &&
    Boolean(playerConfig?.media_common_config?.media_ustreamer_request_config)

  let manifest: string | null = null
  let sabr: VideoInfoResult['sabr'] = null
  const tManifestStart = performance.now()
  if (requiresSabr) {
    const player = yt.session.player
    if (!player) {
      console.error('[youtube] this video requires SABR streaming, but no Player instance is available to decipher the ABR url')
    } else {
      try {
        sabr = await buildSabrPayload(
          // youtubei.js's own types don't line up 1:1 with the narrower shape
          // sabrManifest.ts expects (it only reads a handful of fields) — the
          // runtime object has all of them, this cast just tells TS that.
          info as unknown as Parameters<typeof buildSabrPayload>[0],
          (url) => player.decipher(url),
          poToken,
          yt.session.context.client
        )
        if (sabr) {
          console.log(
            `[youtube] built SABR payload, ${sabr.manifest.formats.length} formats, duration=${sabr.manifest.durationSeconds}s, in ${(performance.now() - tManifestStart).toFixed(0)}ms`
          )
        } else {
          console.error('[youtube] SABR was detected but the payload could not be built (missing formats/ustreamer config)')
        }
      } catch (error) {
        console.error('[youtube] buildSabrPayload failed', error)
        sabr = null
      }
    }
  } else {
    try {
      manifest = await info.toDash()
      console.log(`[youtube] toDash ok, manifest length=${manifest.length}, in ${(performance.now() - tManifestStart).toFixed(0)}ms`)
    } catch (error) {
      console.error('[youtube] toDash() failed', error)
      manifest = null
    }
  }

  const result: VideoInfoResult = {
    videoId,
    title: info.basic_info.title ?? '(sin título)',
    channelId: info.basic_info.channel?.id ?? null,
    channelName: info.basic_info.channel?.name ?? '(desconocido)',
    channelThumbnailUrl: getChannelThumbnailUrl(info),
    subscriberCountText: getSubscriberCountText(info),
    captions: info.captions ? extractCaptionTracks(info.captions) : [],
    storyboardVtt: buildStoryboardVtt(info.storyboards, info.basic_info.duration ?? null),
    relatedVideos: info.watch_next_feed ? mapWatchNextFeed(info.watch_next_feed) : [],
    thumbnailUrl: info.basic_info.thumbnail?.at(-1)?.url ?? null,
    lengthSeconds: info.basic_info.duration ?? null,
    durationText: formatDurationText(info.basic_info.duration ?? null),
    viewCountText: getViewCountText(info),
    likeCountText: getLikeCountText(info.basic_info.like_count),
    publishedText: getPublishedText(info),
    category: info.basic_info.category,
    description: getDescriptionText(info),
    dashManifest: manifest,
    sabr
  }

  // Best-effort: a broken history write shouldn't fail video playback.
  recordHistoryEntry({
    videoId: result.videoId,
    title: result.title,
    channelId: result.channelId,
    channelName: result.channelName,
    thumbnailUrl: result.thumbnailUrl
  }).catch((error) => console.error('[history] failed to record entry', error))

  console.log(
    `[youtube] fetchVideoInfo(${videoId}) done in ${(performance.now() - t0).toFixed(0)}ms (poToken ${tPoToken.toFixed(0)}ms, getInfo ${tGetInfo.toFixed(0)}ms)`
  )

  return result
}
