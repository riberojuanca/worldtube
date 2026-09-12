import type { ChannelResponse, HistoryEntry, SearchResponse, Subscription, VideoInfoResponse } from '../../shared/ipc'

declare global {
  interface Window {
    api: {
      getVideoInfo: (videoId: string) => Promise<VideoInfoResponse>
      search: (query: string) => Promise<SearchResponse>
      getChannel: (channelId: string) => Promise<ChannelResponse>
      getHomeFeed: () => Promise<SearchResponse>
      getHistory: () => Promise<HistoryEntry[]>
      clearHistory: () => Promise<void>
      listSubscriptions: () => Promise<Subscription[]>
      getSubscriptionsFeed: () => Promise<SearchResponse>
      subscribe: (sub: Omit<Subscription, 'subscribedAt'>) => Promise<void>
      unsubscribe: (channelId: string) => Promise<void>
    }
  }
}

export {}
