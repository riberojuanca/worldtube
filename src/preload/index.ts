import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type {
  ChannelResponse,
  CreateLocalUserRequest,
  DeleteLocalUserRequest,
  CreateProfileRequest,
  HistoryEntry,
  LocalSessionState,
  LoginLocalUserRequest,
  ProfilesState,
  SearchRequest,
  SearchResponse,
  SavedPlaylist,
  SavedVideo,
  Subscription,
  UpdateProfileRequest,
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
  getSessionState: (): Promise<LocalSessionState> => ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_STATE),
  createLocalUser: (request: CreateLocalUserRequest): Promise<LocalSessionState> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE_USER, request),
  loginLocalUser: (request: LoginLocalUserRequest): Promise<LocalSessionState> => ipcRenderer.invoke(IPC_CHANNELS.SESSION_LOGIN, request),
  logoutLocalUser: (): Promise<LocalSessionState> => ipcRenderer.invoke(IPC_CHANNELS.SESSION_LOGOUT),
  deleteLocalUser: (request: DeleteLocalUserRequest): Promise<LocalSessionState> => ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE_USER, request),
  exportData: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.DATA_EXPORT),
  importData: (): Promise<LocalSessionState | null> => ipcRenderer.invoke(IPC_CHANNELS.DATA_IMPORT),
  getProfilesState: (): Promise<ProfilesState> => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_GET_STATE),
  createProfile: (request: CreateProfileRequest): Promise<ProfilesState> => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_CREATE, request),
  updateProfile: (request: UpdateProfileRequest): Promise<ProfilesState> => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_UPDATE, request),
  setActiveProfile: (profileId: string): Promise<ProfilesState> => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_SET_ACTIVE, profileId),
  removeProfile: (profileId: string): Promise<ProfilesState> => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_REMOVE, profileId),
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LIST),
  clearHistory: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR),
  listSavedPlaylists: (): Promise<SavedPlaylist[]> => ipcRenderer.invoke(IPC_CHANNELS.SAVED_PLAYLISTS_LIST),
  listSavedVideos: (): Promise<SavedVideo[]> => ipcRenderer.invoke(IPC_CHANNELS.SAVED_VIDEOS_LIST),
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
