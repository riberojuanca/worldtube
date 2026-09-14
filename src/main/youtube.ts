import { Innertube, Platform, YTNodes } from 'youtubei.js'
import { generatePoToken } from './poToken'
import { buildSabrPayload } from './sabrManifest'
import { evaluatePlayerScript } from './jsEvaluator'
import { getHistory, recordHistoryEntry } from './historyStore'
import { getAppLanguage, listActiveSubscriptions } from './localDb'
import { translateFor } from '../shared/locale'
import type { CaptionTrack, ChannelInfoResult, HomeDiscovery, HomeSection, RecommendedChannel, SearchResultItem, VideoInfoResult, VideoPreview } from '../shared/ipc'

type VideoOrGridVideo =
  | InstanceType<typeof YTNodes.Video>
  | InstanceType<typeof YTNodes.GridVideo>
  | InstanceType<typeof YTNodes.CompactVideo>
  | InstanceType<typeof YTNodes.CompactMovie>

type LockupView = InstanceType<typeof YTNodes.LockupView>

type ChannelEndpoint = { payload?: { browseId?: string } }
type TextLike = {
  text?: string
  endpoint?: ChannelEndpoint
  runs?: { text: string; endpoint?: ChannelEndpoint }[]
  toString(): string
}
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
  return getLockupPrimaryThumbnail(lockup)?.image?.[0]?.url ?? null
}

function getLockupPreviewUrl(lockup: LockupView): string | null {
  const overlay = getLockupPrimaryThumbnail(lockup)?.overlays?.find((item) => item instanceof YTNodes.AnimatedThumbnailOverlayView)
  return overlay instanceof YTNodes.AnimatedThumbnailOverlayView ? overlay.thumbnail[0]?.url ?? null : null
}

function getLockupDurationText(lockup: LockupView): string | null {
  const overlays = getLockupPrimaryThumbnail(lockup)?.overlays ?? []
  for (const overlay of overlays) {
    const badges = (overlay as OverlayWithBadges).badges ?? []
    for (const badge of badges) {
      if (badge.badge_style === 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE') return 'LIVE'
      const clock = badge.text?.split(':') ?? []
      if (clock.length < 2 || clock.length > 3) continue
      if (clock.every((part, index) => part.length > 0 && Array.from(part).every((digit) => digit >= '0' && digit <= '9') &&
        (index === 0 || (part.length === 2 && Number(part) < 60)))) return badge.text ?? null
    }
  }
  return null
}

function getLockupMetadataRows(lockup: LockupView): MetadataRowLike[] {
  return (lockup.metadata?.metadata?.metadata_rows ?? []) as MetadataRowLike[]
}

function getLockupPublishedText(lockup: LockupView): string | null {
  for (const part of getLockupMetadataRows(lockup).flatMap((row) => row.metadata_parts ?? [])) {
    const label = textValue(part.text)
    if (!label) continue
    const words = label.toLowerCase().trim().split(/\s+/u)
    const ago = words.indexOf('ago')
    if (ago < 2) continue
    const unit = words[ago - 1].endsWith('s') ? words[ago - 1].slice(0, -1) : words[ago - 1]
    const amount = words[ago - 2] === 'a' ? 1 : Number(words[ago - 2])
    if (Object.hasOwn(RELATIVE_TIME_UNIT_MS, unit) && Number.isFinite(amount) && amount >= 0) return label
  }
  return null
}

function isMembersOnlyLockup(lockup: LockupView): boolean {
  return getLockupMetadataRows(lockup).some((row) => row.badges?.some((badge) => badge.style === 'BADGE_MEMBERS_ONLY'))
}

function getLockupChannelName(lockup: LockupView, fallbackChannelName = '(unknown)'): string {
  // Text endpoints/runs are part of YouTube.js's parsed model. Identify an
  // author by a channel browse target, not by excluding English statistics.
  for (const part of getLockupMetadataRows(lockup).flatMap((row) => row.metadata_parts ?? [])) {
    for (const text of [part.text, part.avatar_stack?.text]) {
      if (!text) continue
      const channelRun = text.runs?.find((run) => run.endpoint?.payload?.browseId?.startsWith('UC'))
      if (channelRun) return channelRun.text
      if (text.endpoint?.payload?.browseId?.startsWith('UC')) return textValue(text) ?? fallbackChannelName
    }
    const avatarLabel = textValue(part.avatar_stack?.text)
    if (avatarLabel) return avatarLabel
  }
  const avatarTarget = lockup.metadata?.image?.renderer_context?.command_context?.on_tap?.payload?.browseId
  const authorRow = getLockupMetadataRows(lockup)[0]?.metadata_parts ?? []
  // Some author labels omit navigation data; avoid treating statistics as names.
  const label = textValue(authorRow[0]?.text)
  if (label && label !== getLockupPublishedText(lockup)) {
    const words = label.toLowerCase().trim().split(/\s+/u)
    const statistics = ['views', 'view', 'watching', 'waiting', 'premieres', 'scheduled']
    const beginsWithNumber = label[0] >= '0' && label[0] <= '9'
    if (!words.some((word) => statistics.includes(word)) && (!beginsWithNumber || avatarTarget?.startsWith('UC'))) return label
  }
  return fallbackChannelName
}

function getLockupChannelId(lockup: LockupView, fallbackChannelId: string | null = null): string | null {
  for (const part of getLockupMetadataRows(lockup).flatMap((row) => row.metadata_parts ?? [])) {
    for (const text of [part.text, part.avatar_stack?.text]) {
      const endpoints = [text?.endpoint, ...(text?.runs?.map((run) => run.endpoint) ?? [])]
      const id = endpoints.find((endpoint) => endpoint?.payload?.browseId?.startsWith('UC'))?.payload?.browseId
      if (id) return id
    }
  }
  return lockup.metadata?.image?.renderer_context?.command_context?.on_tap?.payload?.browseId ?? fallbackChannelId
}

function mapLockupView(lockup: LockupView, fallbackChannelId: string | null = null, fallbackChannelName = '(unknown)'): SearchResultItem | null {
  if (lockup.content_type !== 'VIDEO' && lockup.content_type !== 'STATION') return null
  if (isMembersOnlyLockup(lockup)) return null

  return {
    videoId: lockup.content_id,
    title: textValue(lockup.metadata?.title) ?? translateFor(getAppLanguage(), '(untitled)'),
    channelId: getLockupChannelId(lockup, fallbackChannelId),
    channelName: getLockupChannelName(lockup, fallbackChannelName),
    thumbnailUrl: getLockupThumbnailUrl(lockup),
    previewUrl: getLockupPreviewUrl(lockup),
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
  fallbackChannelName = '(unknown)'
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
      thumbnailUrl: (isGridVideo || isCompactMovie ? video.thumbnails?.[0]?.url : video.best_thumbnail?.url) ?? null,
      durationText: ((video instanceof YTNodes.Video || video instanceof YTNodes.CompactVideo) && video.is_live)
        || (isGridVideo && video.thumbnail_overlays.some((overlay) => overlay instanceof YTNodes.ThumbnailOverlayTimeStatus && overlay.style === 'LIVE'))
        ? 'LIVE' : (isGridVideo ? video.duration?.toString() : video.duration.text) ?? null,
      viewCountText:
        (isCompactMovie ? null : video.short_view_count?.toString()) ??
        (isGridVideo ? video.views?.toString() : isCompactMovie ? null : video.view_count?.toString()) ??
        null,
      publishedText: (isCompactMovie ? null : video.published?.toString()) ?? null,
      previewUrl: video instanceof YTNodes.Video || video instanceof YTNodes.CompactVideo
        ? getMovingThumbnailUrl(video.rich_thumbnail) : null
    }
  })
}

export function mapSearchResultNodes(
  nodes: readonly unknown[],
  fallbackChannelId: string | null = null,
  fallbackChannelName = '(unknown)'
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

function getMovingThumbnailUrl(value: unknown): string | null {
  // MovingThumbnail's parser returns the thumbnail array directly.
  if (!Array.isArray(value)) return null
  const image = value[0] as { url?: unknown } | undefined
  return typeof image?.url === 'string' ? image.url : null
}

const previewCache = new Map<string, { value: VideoPreview | null; expires: number }>()
const previewRequests = new Map<string, Promise<VideoPreview | null>>()
let previewQueue: Promise<unknown> = Promise.resolve()

export function getVideoPreview(videoId: string): Promise<VideoPreview | null> {
  if (typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return Promise.resolve(null)
  const cached = previewCache.get(videoId)
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value)
  const pending = previewRequests.get(videoId)
  if (pending) return pending
  if (previewRequests.size >= 8) return Promise.resolve(null)
  const request = previewQueue.then(async (): Promise<VideoPreview | null> => {
    try {
      const yt = await getClient()
      const info = await yt.getInfo(videoId)
      const boards = info.storyboards instanceof YTNodes.PlayerStoryboardSpec ? info.storyboards.boards : []
      const board = boards.reduce<(typeof boards)[number] | null>((best, item) =>
        !best || item.thumbnail_width * item.thumbnail_height > best.thumbnail_width * best.thumbnail_height ? item : best, null)
      if (!board || ![board.columns, board.rows, board.thumbnail_count].every((value) => Number.isSafeInteger(value) && value > 0)) return null
      const capacity = board.columns * board.rows
      const sheet = Math.floor(Math.floor(board.thumbnail_count / 2) / capacity)
      const imageUrl = board.template_url.replaceAll('$M', String(sheet))
      const url = new URL(imageUrl)
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.ytimg.com')) return null
      return { imageUrl, columns: board.columns, rows: board.rows,
        frameCount: Math.min(24, capacity, board.thumbnail_count - sheet * capacity) }
    } catch { return null }
  }).then((value) => {
    previewCache.delete(videoId)
    previewCache.set(videoId, { value, expires: Date.now() + (value ? 600_000 : 120_000) })
    if (previewCache.size > 64) previewCache.delete(previewCache.keys().next().value!)
    return value
  }).finally(() => previewRequests.delete(videoId))
  previewRequests.set(videoId, request)
  previewQueue = request.catch(() => null)
  return request
}

async function resolveChannelNames(videos: SearchResultItem[]): Promise<SearchResultItem[]> {
  const missing = new Set(['', '(unknown)', '(desconocido)'])
  const ids = [...new Set(videos.filter((video) => missing.has(video.channelName) && video.channelId?.startsWith('UC'))
    .map((video) => video.channelId!))]
  const names = new Map<string, string>()
  for (let start = 0; start < ids.length; start += 4) {
    await Promise.all(ids.slice(start, start + 4).map(async (id) => {
      try {
        const channel = await getChannelInfo(id, false)
        if (channel.name && !missing.has(channel.name)) names.set(id, channel.name)
      } catch { /* Keep missing metadata explicit if the header cannot be loaded. */ }
    }))
  }
  return videos.map((video) => missing.has(video.channelName) && names.has(video.channelId ?? '')
    ? { ...video, channelName: names.get(video.channelId!)! } : video)
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

export async function searchVideos(query: string): Promise<{ videos: SearchResultItem[]; channels: RecommendedChannel[] }> {
  console.log(`[youtube] searchVideos(${query})`)
  const yt = await getClient()
  const results = await yt.search(query)
  const channelNodes = results.channels.length ? results.channels :
    (await yt.search(query, { type: 'channel' }).catch(() => null))?.channels ?? []
  const channels = channelNodes.map((channel) => ({
    channelId: channel.id, name: channel.author.name,
    thumbnailUrl: channel.author.best_thumbnail?.url ?? null,
    subscriberCountText: channel instanceof YTNodes.Channel ? channel.subscriber_count?.toString() ?? null : channel.subscribers?.toString() ?? null,
    description: channel instanceof YTNodes.Channel ? channel.description_snippet?.toString() ?? null : null
  }))
  return { videos: await resolveChannelNames(mapSearchResultNodes(results.videos)), channels }
}

export async function getSearchSuggestions(query: string): Promise<string[]> {
  const cleanQuery = query.trim()
  if (!cleanQuery) return []

  const yt = await getClient()
  const suggestions = await yt.getSearchSuggestions(cleanQuery)
  return Array.isArray(suggestions) ? suggestions.filter((suggestion): suggestion is string => typeof suggestion === 'string') : []
}

export async function getHomeFeed(sections: HomeSection[] = []): Promise<SearchResultItem[]> {
  console.log('[youtube] getHomeFeed()')
  const yt = await getClient()
  const feed = await yt.getHomeFeed().catch((error) => {
    console.warn('[youtube] anonymous home failed, using discovery:', error instanceof Error ? error.message : String(error))
    return null
  })
  const videos = feed ? mapSearchResultNodes(feed.videos) : []
  console.log(`[youtube] home: ${feed?.videos.length ?? 0} video nodes, ${videos.length} mapped videos`)
  if (videos.length) return videos

  // Anonymous home responses can have no recommendations. Use this profile's
  // own recent viewing as seeds, without minting tokens or recording a watch.
  const history = await getHistory()
  const watched = new Set(history.map((entry) => entry.videoId))
  const recommendations = await Promise.all(history.slice(0, 3).map(async (entry) => {
    try {
      const info = await yt.getInfo(entry.videoId)
      const related = mapWatchNextFeed(info.watch_next_feed ?? []).filter((video) => !watched.has(video.videoId))
      const keywords = info.basic_info.keywords?.filter((keyword) => keyword.trim().length > 0 && keyword.length <= 60) ?? []
      return { entry, related, topic: info.basic_info.category,
        liveQuery: keywords.slice(0, 2).join(' ') || entry.channelName || entry.title }
    } catch (error) {
      console.warn('[youtube] home recommendation seed failed:', error instanceof Error ? error.message : String(error))
      return { entry, related: [] as SearchResultItem[], topic: null, liveQuery: entry.channelName || entry.title }
    }
  }))
  const unique = new Map<string, SearchResultItem>()
  for (const batch of recommendations) {
    if (batch.related.length) sections.push({ id: batch.entry.videoId, title: batch.entry.title,
      topic: batch.topic, liveQuery: batch.liveQuery, videos: batch.related })
    for (const video of batch.related) {
      if (!watched.has(video.videoId) && !unique.has(video.videoId)) unique.set(video.videoId, video)
    }
  }
  if (unique.size) {
    console.log(`[youtube] home: ${unique.size} recommendations from local history`)
    return [...unique.values()]
  }

  const subscriptions = await listActiveSubscriptions()
  if (subscriptions.length) {
    const subscribedVideos = await getSubscriptionsFeed(subscriptions.slice(0, 6).map((channel) => channel.channelId))
    console.log(`[youtube] home: ${subscribedVideos.length} videos from local subscriptions`)
    if (subscribedVideos.length) return subscribedVideos
  }

  // A fresh local profile has no recommendation seeds. Fetch real discovery
  // results without adding artificial entries to its history or subscriptions.
  const queries = getAppLanguage() === 'es'
    ? ['música en vivo', 'ciencia y tecnología', 'naturaleza y viajes']
    : ['live music', 'science and technology', 'nature and travel']
  const batches = await Promise.all(queries.map(async (query) => {
    try {
      const results = await yt.search(query, { type: 'video' })
      return mapSearchResultNodes(results.videos).slice(0, 8)
    } catch (error) {
      console.warn('[youtube] initial discovery failed:', error instanceof Error ? error.message : String(error))
      return [] as SearchResultItem[]
    }
  }))
  const discovery = new Map<string, SearchResultItem>()
  for (let index = 0; index < 8; index++) {
    for (const batch of batches) {
      const video = batch[index]
      if (video && !discovery.has(video.videoId)) discovery.set(video.videoId, video)
    }
  }
  console.log(`[youtube] home: ${discovery.size} initial discovery videos`)
  return [...discovery.values()]
}

export async function getHomeDiscovery(): Promise<{ videos: SearchResultItem[]; home: HomeDiscovery }> {
  const sections: HomeSection[] = []
  const history = await getHistory()
  const subscriptions = await listActiveSubscriptions()
  const videos = await resolveChannelNames(await getHomeFeed(sections))
  const resolvedVideos = new Map(videos.map((video) => [video.videoId, video]))
  for (const section of sections) section.videos = section.videos.map((video) => resolvedVideos.get(video.videoId) ?? video)
  const excluded = new Set([...subscriptions.map((channel) => channel.channelId), ...history.map((entry) => entry.channelId)])
  const counts = new Map<string, number>()
  for (const video of videos) {
    if (video.channelId && !excluded.has(video.channelId)) counts.set(video.channelId, (counts.get(video.channelId) ?? 0) + 1)
  }
  const ids = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id)
  const channelsPromise = Promise.all(ids.map(async (id): Promise<RecommendedChannel | null> => {
    try {
      const info = await getChannelInfo(id, false)
      return { channelId: id, name: info.name, thumbnailUrl: info.thumbnailUrl,
        subscriberCountText: info.subscriberCountText, description: null }
    } catch { return null }
  }))
  const livePromise = (async () => {
    const yt = await getClient()
    const queries = [...new Set(sections.length ? sections.slice(0, 2).map((section) => section.liveQuery || section.title)
      : history.slice(0, 2).map((entry) => entry.channelName || entry.title))]
    if (!queries.length && subscriptions[0]) queries.push(subscriptions[0].channelName)
    const batches = await Promise.all(queries.map(async (query) => {
      try {
        const results = await yt.search(query, { type: 'video', features: ['live'] })
        return mapSearchResultNodes(results.videos.filterType(YTNodes.Video).filter((video) => video.is_live))
          .map((video) => ({ ...video, durationText: 'LIVE' }))
      } catch { return [] }
    }))
    return [...new Map(batches.flat().map((video) => [video.videoId, video])).values()]
  })()
  const [channels, liveVideos] = await Promise.all([channelsPromise, livePromise])
  console.log(`[youtube] home discovery: ${sections.length} sections, ${liveVideos.length} live videos, ${channels.filter(Boolean).length} channels`)
  return { videos, home: { sections, liveVideos, channels: channels.filter((channel): channel is RecommendedChannel => channel !== null) } }
}

export async function getChannelInfo(channelId: string, includeVideos = true): Promise<ChannelInfoResult> {
  console.log(`[youtube] getChannelInfo(${channelId})`)
  const channel = await getBrowseChannel(channelId)
  const videosTab = includeVideos && channel.has_videos ? await channel.getVideos() : channel
  const header = channel.header as { author?: { id?: string; name?: string; best_thumbnail?: { url: string } }; subscribers?: { toString(): string } } | undefined
  const resolvedChannelId = header?.author?.id ?? channel.metadata.external_id ?? channelId
  const channelName = header?.author?.name ?? channel.metadata.title ?? translateFor(getAppLanguage(), '(unknown)')
  const pageHeader = channel.header instanceof YTNodes.PageHeader ? channel.header.content : null
  const pageImage = pageHeader?.image
  const pageAvatar = pageImage instanceof YTNodes.DecoratedAvatarView ? pageImage.avatar?.image?.[0]?.url
    : pageImage instanceof YTNodes.ContentPreviewImageView ? pageImage.image[0]?.url : null
  const bannerUrl = pageHeader?.banner?.image[0]?.url ??
    (channel.header instanceof YTNodes.C4TabbedHeader ? channel.header.banner?.[0]?.url : null)
  const metadataParts = pageHeader?.metadata?.metadata_rows.flatMap((row) => row.metadata_parts ?? []) ?? []

  const videos = includeVideos ? mapSearchResultNodes(videosTab.videos.filterType(YTNodes.Video, YTNodes.GridVideo, YTNodes.LockupView), resolvedChannelId, channelName) : []

  return {
    channelId: resolvedChannelId,
    name: channelName,
    thumbnailUrl: pageAvatar ?? header?.author?.best_thumbnail?.url ?? channel.metadata.avatar?.[0]?.url ?? channel.metadata.thumbnail?.[0]?.url ?? null,
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
  if (!board || ![board.thumbnail_count, board.columns, board.rows, board.thumbnail_width, board.thumbnail_height]
    .every((value) => Number.isSafeInteger(value) && value > 0)) return null

  const durationMs = videoLengthSeconds && Number.isFinite(videoLengthSeconds) && videoLengthSeconds > 0
    ? videoLengthSeconds * 1000 : null
  const stepMs = Number.isFinite(board.interval) && board.interval > 0
    ? board.interval : (durationMs ?? 0) / board.thumbnail_count
  if (stepMs <= 0) return null

  // Absolute tile indexing avoids accumulated timestamp drift and ignores
  // unused cells on the final sprite sheet. Shaka consumes standard VTT cues.
  const cues: string[] = []
  const capacity = board.columns * board.rows
  for (let tile = 0; tile < board.thumbnail_count; tile++) {
    const startMs = tile * stepMs
    if (durationMs !== null && startMs >= durationMs) break
    const endMs = Math.min(startMs + stepMs, durationMs ?? Infinity)
    const sheet = Math.floor(tile / capacity)
    const cell = tile % capacity
    const rectangle = [cell % board.columns * board.thumbnail_width,
      Math.floor(cell / board.columns) * board.thumbnail_height, board.thumbnail_width, board.thumbnail_height]
    const image = board.template_url.replaceAll('$M', String(sheet))
    cues.push(`${formatVttTimestamp(startMs)} --> ${formatVttTimestamp(endMs)}\n${image}#xywh=${rectangle.join(',')}\n`)
  }
  return cues.length ? `WEBVTT\n\n${cues.join('\n')}` : null
}

function getChannelThumbnailUrl(info: { secondary_info?: { owner?: { author?: { best_thumbnail?: { url: string }; avatar_thumbnail_url?: string } } | null } | null }): string | null {
  return info.secondary_info?.owner?.author?.best_thumbnail?.url ?? info.secondary_info?.owner?.author?.avatar_thumbnail_url ?? null
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat(getAppLanguage() === 'es' ? 'es-UY' : 'en-US').format(value)
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(getAppLanguage() === 'es' ? 'es-UY' : 'en-US', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 }).format(value)
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
  return new Intl.DateTimeFormat(getAppLanguage() === 'es' ? 'es-UY' : 'en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

function getViewCountText(info: {
  basic_info: { view_count?: number }
  primary_info?: { view_count?: { view_count?: { toString(): string }; short_view_count?: { toString(): string } } | null } | null
}): string | null {
  const viewCount = info.basic_info.view_count
  if (typeof viewCount === 'number' && Number.isFinite(viewCount)) {
    return translateFor(getAppLanguage(), '{count} views', { count: formatInteger(viewCount) })
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

async function prepareLiveManifestUrl(url: string, decipher: (url: string) => Promise<string>): Promise<string> {
  const manifestUrl = new URL(url)
  const path = manifestUrl.pathname.split('/')
  const nIndex = path.indexOf('n')
  const pathChallenge = nIndex >= 0 ? path[nIndex + 1] : undefined
  const challenge = pathChallenge ? decodeURIComponent(pathChallenge) : manifestUrl.searchParams.get('n')
  if (!challenge) return url

  // Player.decipher understands query parameters, while live manifests
  // encode the same n challenge as /n/value inside their signed URL paths.
  const challengeUrl = new URL(manifestUrl.origin)
  challengeUrl.searchParams.set('n', challenge)
  const solved = new URL(await decipher(challengeUrl.href)).searchParams.get('n')
  if (!solved || solved === challenge || solved.startsWith('enhanced_except_')) {
    throw new Error('Could not solve the live manifest n challenge')
  }
  if (pathChallenge) {
    path[nIndex + 1] = encodeURIComponent(solved)
    manifestUrl.pathname = path.join('/')
  }
  if (manifestUrl.searchParams.has('n')) manifestUrl.searchParams.set('n', solved)
  return manifestUrl.href
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
  const isLive = Boolean(info.basic_info.is_live)
  const liveManifests: NonNullable<VideoInfoResult['liveManifests']> = []
  const tManifestStart = performance.now()
  if (isLive) {
    // Live formats have no VOD segment indexes. Keep YouTube's remote
    // manifests so Shaka can refresh their moving segment windows.
    const sources: NonNullable<VideoInfoResult['liveManifests']> = []
    if (info.streaming_data?.dash_manifest_url) {
      sources.push({ url: info.streaming_data.dash_manifest_url, mimeType: 'application/dash+xml' })
    }
    if (info.streaming_data?.hls_manifest_url) {
      sources.push({ url: info.streaming_data.hls_manifest_url, mimeType: 'application/x-mpegURL' })
    }
    for (const source of sources) {
      try {
        const url = await prepareLiveManifestUrl(source.url, async (challengeUrl) => {
          if (!yt.session.player) throw new Error('No YouTube Player available to solve the live URL challenge')
          return yt.session.player.decipher(challengeUrl)
        })
        liveManifests.push({ ...source, url })
        console.log(`[youtube] live manifest prepared [video=${videoId}, type=${source.mimeType}, nTransformed=${url !== source.url}]`)
      } catch (error) {
        console.error(`[youtube] live manifest preparation failed [video=${videoId}, type=${source.mimeType}]`, error)
      }
    }
    console.log(`[youtube] live manifests available: ${liveManifests.map((source) => source.mimeType).join(', ') || 'none'}`)
  } else if (requiresSabr) {
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
    title: info.basic_info.title ?? translateFor(getAppLanguage(), '(untitled)'),
    channelId: info.basic_info.channel?.id ?? null,
    channelName: info.basic_info.channel?.name ?? translateFor(getAppLanguage(), '(unknown)'),
    channelThumbnailUrl: getChannelThumbnailUrl(info),
    subscriberCountText: getSubscriberCountText(info),
    captions: info.captions ? extractCaptionTracks(info.captions) : [],
    storyboardVtt: isLive ? null : buildStoryboardVtt(info.storyboards, info.basic_info.duration ?? null),
    relatedVideos: info.watch_next_feed ? await resolveChannelNames(mapWatchNextFeed(info.watch_next_feed)) : [],
    thumbnailUrl: info.basic_info.thumbnail?.[0]?.url ?? null,
    lengthSeconds: info.basic_info.duration ?? null,
    durationText: isLive ? 'LIVE' : formatDurationText(info.basic_info.duration ?? null),
    viewCountText: getViewCountText(info),
    likeCountText: getLikeCountText(info.basic_info.like_count),
    publishedText: getPublishedText(info),
    category: info.basic_info.category,
    description: getDescriptionText(info),
    dashManifest: manifest,
    liveManifests,
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
