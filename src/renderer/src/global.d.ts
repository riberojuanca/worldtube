import type {
  ChannelResponse,
  CreateLocalUserRequest,
  DeleteLocalUserRequest,
  CreateProfileRequest,
  HistoryEntry,
  LocalSessionState,
  LoginLocalUserRequest,
  ProfilesState,
  SavedPlaylist,
  SavedVideo,
  SearchResponse,
  Subscription,
  UpdateProfileRequest,
  VideoInfoResponse
} from '../../shared/ipc'

declare global {
  interface Window {
    api: {
      getVideoInfo: (videoId: string) => Promise<VideoInfoResponse>
      search: (query: string) => Promise<SearchResponse>
      getChannel: (channelId: string) => Promise<ChannelResponse>
      getHomeFeed: () => Promise<SearchResponse>
      getSessionState: () => Promise<LocalSessionState>
      createLocalUser: (request: CreateLocalUserRequest) => Promise<LocalSessionState>
      loginLocalUser: (request: LoginLocalUserRequest) => Promise<LocalSessionState>
      logoutLocalUser: () => Promise<LocalSessionState>
      deleteLocalUser: (request: DeleteLocalUserRequest) => Promise<LocalSessionState>
      exportData: () => Promise<string | null>
      importData: () => Promise<LocalSessionState | null>
      getProfilesState: () => Promise<ProfilesState>
      createProfile: (request: CreateProfileRequest) => Promise<ProfilesState>
      updateProfile: (request: UpdateProfileRequest) => Promise<ProfilesState>
      setActiveProfile: (profileId: string) => Promise<ProfilesState>
      removeProfile: (profileId: string) => Promise<ProfilesState>
      getHistory: () => Promise<HistoryEntry[]>
      clearHistory: () => Promise<void>
      listSavedPlaylists: () => Promise<SavedPlaylist[]>
      listSavedVideos: () => Promise<SavedVideo[]>
      listSubscriptions: () => Promise<Subscription[]>
      getSubscriptionsFeed: () => Promise<SearchResponse>
      subscribe: (sub: Omit<Subscription, 'subscribedAt'>) => Promise<void>
      unsubscribe: (channelId: string) => Promise<void>
    }
  }
}

export {}
