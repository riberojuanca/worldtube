import { randomUUID } from 'node:crypto'
import { YTNodes } from 'youtubei.js'
import { getBrowseChannel, getClient, getLockupThumbnailUrl, mapSearchResultNodes } from './youtube'
import type { ChannelPageRequest, ChannelPageResult, ChannelPlaylistItem, ChannelPostItem, SearchResultItem } from '../shared/ipc'

type ChannelFeed = Awaited<ReturnType<Awaited<ReturnType<typeof getClient>>['getChannel']>>
type PlaylistFeed = Awaited<ReturnType<Awaited<ReturnType<typeof getClient>>['getPlaylist']>>
type BrowseFeed = ChannelFeed | PlaylistFeed | Awaited<ReturnType<ChannelFeed['getContinuation']>> | Awaited<ReturnType<ChannelFeed['applyFilter']>>

const continuations = new Map<string, { feed: BrowseFeed; channelId: string; tab: string; playlistId?: string; name: string; filters: string[]; sorts: string[]; secondaryFilters: string[]; contentTypes: string[]; createdAt: number }>()
const MAX_CONTINUATIONS = 80
const CONTINUATION_TTL = 60 * 60 * 1000

function descendants(value: unknown): unknown[] {
  const nodes: unknown[] = []
  const visited = new WeakSet<object>()
  function visit(item: unknown) {
    if (!item || typeof item !== 'object' || visited.has(item)) return
    visited.add(item)
    if (Array.isArray(item)) {
      item.forEach(visit)
      return
    }
    nodes.push(item)
    const record = item as Record<string, unknown>
    for (const key of ['content', 'contents', 'items', 'videos', 'attachment', 'images']) visit(record[key])
  }
  visit(value)
  return nodes
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  return Array.from(new Map(items.map((item) => [key(item), item])).values())
}

function videosFrom(nodes: readonly unknown[], channelId: string, name: string): SearchResultItem[] {
  const videos = mapSearchResultNodes(nodes, channelId, name)
  for (const node of nodes) {
    if (node instanceof YTNodes.ShortsLockupView || node instanceof YTNodes.ReelItem) {
      const short = node instanceof YTNodes.ShortsLockupView
      const id = short ? node.on_tap_endpoint.payload.videoId : node.id
      if (typeof id !== 'string') continue
      videos.push({
        videoId: id,
        title: (short ? node.overlay_metadata.primary_text?.toString() : node.title.toString()) ?? '',
        channelId,
        channelName: name,
        thumbnailUrl: (short ? node.thumbnail : node.thumbnails).at(-1)?.url ?? null,
        durationText: null,
        viewCountText: (short ? node.overlay_metadata.secondary_text?.toString() : node.views?.toString()) ?? null,
        publishedText: null
      })
    } else if (node instanceof YTNodes.PlaylistVideo) {
      if (!node.is_playable) continue
      videos.push({ videoId: node.id, title: node.title.toString(), channelId: node.author?.id ?? channelId,
        channelName: node.author?.name ?? name, thumbnailUrl: node.thumbnails.at(-1)?.url ?? null,
        durationText: node.duration?.text ?? null, viewCountText: null, publishedText: node.video_info?.toString() ?? null })
    } else if (node instanceof YTNodes.ChannelVideoPlayer) {
      videos.push({ videoId: node.id, title: node.title.toString(), channelId, channelName: name,
        thumbnailUrl: `https://i.ytimg.com/vi/${node.id}/hqdefault.jpg`, durationText: null,
        viewCountText: node.view_count?.toString() ?? null, publishedText: node.published_time?.toString() ?? null })
    }
  }
  return unique(videos, (video) => video.videoId)
}

function playlistsFrom(nodes: readonly unknown[]): ChannelPlaylistItem[] {
  const playlists: ChannelPlaylistItem[] = []
  for (const node of nodes) {
    if (node instanceof YTNodes.GridPlaylist || node instanceof YTNodes.Playlist) {
      playlists.push({ playlistId: node.id, title: node.title.toString(), thumbnailUrl: node.thumbnails.at(-1)?.url ?? null,
        videoCountText: node.video_count?.toString() ?? null })
    } else if (node instanceof YTNodes.LockupView && ['PLAYLIST', 'ALBUM', 'PODCAST'].includes(node.content_type)) {
      playlists.push({ playlistId: node.content_id, title: node.metadata?.title?.toString() ?? '',
        thumbnailUrl: getLockupThumbnailUrl(node), videoCountText: null })
    }
  }
  return unique(playlists, (playlist) => playlist.playlistId)
}

function postsFrom(feed: BrowseFeed, channelId: string, name: string): ChannelPostItem[] {
  return feed.posts.map((post) => {
    const original = post instanceof YTNodes.SharedPost ? post.original_post : post
    const attachments = descendants(original?.attachment)
    return {
      id: post.id, text: post.content?.toString() ?? '', publishedText: post.published?.toString() ?? null,
      images: attachments.filter((node): node is InstanceType<typeof YTNodes.BackstageImage> => node instanceof YTNodes.BackstageImage)
        .flatMap((image) => image.image.at(-1)?.url ? [image.image.at(-1)!.url] : []),
      videos: videosFrom(attachments, channelId, name),
      playlists: playlistsFrom(attachments),
      pollChoices: attachments.filter((node): node is InstanceType<typeof YTNodes.Poll> | InstanceType<typeof YTNodes.Quiz> => node instanceof YTNodes.Poll || node instanceof YTNodes.Quiz)
        .flatMap((poll) => poll.choices.map((choice) => choice.text.toString()))
    }
  })
}

function emptyPage(): ChannelPageResult {
  return { videos: [], playlists: [], posts: [], sections: [], filters: [], sorts: [], secondaryFilters: [], contentTypes: [], continuation: null, about: null }
}

export async function getChannelPage(request: ChannelPageRequest): Promise<ChannelPageResult> {
  const now = Date.now()
  for (const [id, entry] of continuations) if (now - entry.createdAt > CONTINUATION_TTL) continuations.delete(id)
  let feed: BrowseFeed
  let name = ''
  let filters: string[] = []
  let sorts: string[] = []
  let secondaryFilters: string[] = []
  let contentTypes: string[] = []
  if (request.continuation) {
    const previous = continuations.get(request.continuation)
    if (!previous || previous.channelId !== request.channelId || previous.tab !== request.tab || previous.playlistId !== request.playlistId) {
      throw new Error('La lista vencio. Vuelve a abrir esta seccion.')
    }
    feed = await previous.feed.getContinuation()
    name = previous.name
    filters = previous.filters
    sorts = previous.sorts
    secondaryFilters = previous.secondaryFilters
    contentTypes = previous.contentTypes
  } else {
    const yt = await getClient()
    const channel = await getBrowseChannel(request.channelId)
    name = channel.metadata.title ?? ''
    if (request.tab === 'about') {
      const result = emptyPage()
      result.about = { description: channel.metadata.description ?? '', details: [], links: [] }
      if (channel.has_about) {
        const about = await channel.getAbout()
        if (about instanceof YTNodes.ChannelAboutFullMetadata) {
          result.about = { description: about.description?.toString() ?? '',
            details: [about.country, about.joined_date, about.view_count].map((text) => text?.toString()).filter((text): text is string => Boolean(text)),
            links: about.primary_links.flatMap((link) => {
              const url = link.endpoint.payload.url
              return typeof url === 'string' && /^https?:\/\//.test(url) ? [{ title: link.title.toString(), url }] : []
            }) }
        } else if (about.metadata) {
          const metadata = about.metadata
          result.about = { description: metadata.description ?? '',
            details: [metadata.country, metadata.subscriber_count, metadata.video_count, metadata.view_count, metadata.joined_date?.toString()].filter((text): text is string => Boolean(text)),
            links: metadata.links.flatMap((link) => {
              const url = link.link?.toString()
              return url && /^https?:\/\//.test(url) ? [{ title: link.title?.toString() ?? url, url }] : []
            }) }
        }
      }
      return result
    }
    if (!request.playlistId && request.tab === 'videos' && !channel.has_videos && channel.metadata.music_artist_name) {
      const id = channel.metadata.external_id ?? request.channelId
      if (!id.startsWith('UC')) throw new Error('No se encontro la playlist de subidas de este canal.')
      feed = await yt.getPlaylist(`UU${id.slice(2)}`)
    } else if (request.playlistId) {
      feed = await yt.getPlaylist(request.playlistId)
    } else {
      switch (request.tab) {
        case 'home': feed = await channel.getHome(); break
        case 'videos': feed = await channel.getVideos(); break
        case 'shorts': feed = await channel.getShorts(); break
        case 'live': feed = await channel.getLiveStreams(); break
        case 'playlists': feed = await channel.getPlaylists(); break
        case 'podcasts': feed = await channel.getPodcasts(); break
        case 'releases': feed = await channel.getReleases(); break
        case 'courses': feed = await channel.getCourses(); break
        case 'community': feed = await channel.getCommunity(); break
        case 'search':
          if (!request.query?.trim()) return emptyPage()
          feed = await channel.search(request.query.trim()); break
        default: throw new Error('Seccion desconocida')
      }
      filters = feed.filters
      sorts = feed.sort_filters
      secondaryFilters = feed.secondary_filters
      const subMenu = feed.current_tab?.content
      if (subMenu instanceof YTNodes.SectionList && subMenu.sub_menu instanceof YTNodes.ChannelSubMenu) {
        contentTypes = feed.content_type_filters
      }
      if (request.contentType) feed = await feed.applyContentTypeFilter(request.contentType)
      if (request.sort) feed = await feed.applySort(request.sort)
      if (request.filter || request.secondaryFilter) feed = await feed.applyFilter(request.filter || filters[0], request.secondaryFilter)
    }
  }
  const result = emptyPage()
  result.filters = filters
  result.sorts = sorts
  result.secondaryFilters = secondaryFilters
  result.contentTypes = contentTypes
  result.videos = videosFrom(feed.videos, request.channelId, name)
  result.playlists = playlistsFrom(feed.playlists)
  result.posts = postsFrom(feed, request.channelId, name)
  if (request.tab === 'community' && !request.playlistId) {
    result.videos = []
    result.playlists = []
  }
  if (request.tab === 'home' && !request.playlistId) {
    result.sections = feed.shelves.map((shelf) => {
      const nodes = descendants(shelf)
      return { title: shelf.title?.toString() ?? '', videos: videosFrom(nodes, request.channelId, name), playlists: playlistsFrom(nodes) }
    }).filter((section) => section.videos.length > 0 || section.playlists.length > 0)
    const featured = videosFrom(feed.memo.getType(YTNodes.ChannelVideoPlayer), request.channelId, name)
    if (featured.length) result.sections.unshift({ title: 'Destacado', videos: featured, playlists: [] })
  }
  if (feed.has_continuation) {
    const id = randomUUID()
    continuations.set(id, { feed, channelId: request.channelId, tab: request.tab, playlistId: request.playlistId, name, filters, sorts, secondaryFilters, contentTypes, createdAt: now })
    while (continuations.size > MAX_CONTINUATIONS) continuations.delete(continuations.keys().next().value!)
    result.continuation = id
  }
  return result
}
