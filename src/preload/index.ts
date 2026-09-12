import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type {
  ChannelResponse,
  HistoryEntry,
  SearchRequest,
  SearchResponse,
  Subscription,
  VideoInfoRequest,
  VideoInfoResponse
} from '../shared/ipc'

const api = {
  getVideoInfo: (videoId: string): Promise<VideoInfoResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_VIDEO_INFO, { videoId } satisfies VideoInfoRequest),
  search: (query: string): Promise<SearchResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH, { query } satisfies SearchRequest),
  getChannel: (channelId: string): Promise<ChannelResponse> => ipcRenderer.invoke(IPC_CHANNELS.GET_CHANNEL, { channelId }),
  getHomeFeed: (): Promise<SearchResponse> => ipcRenderer.invoke(IPC_CHANNELS.GET_HOME_FEED),
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LIST),
  clearHistory: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR),
  listSubscriptions: (): Promise<Subscription[]> => ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_LIST),
  getSubscriptionsFeed: (): Promise<SearchResponse> => ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_FEED),
  subscribe: (sub: Omit<Subscription, 'subscribedAt'>): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_ADD, sub),
  unsubscribe: (channelId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_REMOVE, channelId)
}

export type WorldTubeApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error only reached when contextIsolation is disabled
  window.api = api
}
