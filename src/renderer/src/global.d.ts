import type {
  ChannelResponse,
  PlayerAudioPreferences,
  ChannelPageRequest,
  ChannelPageResponse,
  CreateLocalUserRequest,
  DeleteLocalUserRequest,
  CreateProfileRequest,
  CreateSavedPlaylistRequest,
  HistoryEntry,
  LocalSessionState,
  LoginLocalUserRequest,
  ProfilesState,
  SaveVideoRequest,
  SavedPlaylist,
  SavedVideo,
  SearchHistoryEntry,
  SearchResponse,
  SearchSuggestionsResponse,
  Subscription,
  UpdateProfileRequest,
  VideoInfoResponse
} from '../../shared/ipc'

declare global {
  interface Window {
    api: {
      getPlayerAudioPreferences: () => Promise<PlayerAudioPreferences>
      setPlayerAudioPreferences: (audio: PlayerAudioPreferences) => Promise<void>
      getVideoInfo: (videoId: string) => Promise<VideoInfoResponse>
      search: (query: string) => Promise<SearchResponse>
      getSearchSuggestions: (query: string) => Promise<SearchSuggestionsResponse>
      getChannel: (channelId: string) => Promise<ChannelResponse>
      getChannelPage: (request: ChannelPageRequest) => Promise<ChannelPageResponse>
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
      createSavedPlaylist: (request: CreateSavedPlaylistRequest) => Promise<SavedPlaylist>
      listSavedVideos: (playlistId?: string | null) => Promise<SavedVideo[]>
      saveVideo: (request: SaveVideoRequest) => Promise<SavedVideo>
      removeSavedVideo: (videoId: string, playlistId?: string | null) => Promise<void>
      listSearchHistory: () => Promise<SearchHistoryEntry[]>
      recordSearchQuery: (query: string) => Promise<SearchHistoryEntry[]>
      listSubscriptions: () => Promise<Subscription[]>
      getSubscriptionsFeed: () => Promise<SearchResponse>
      subscribe: (sub: Omit<Subscription, 'subscribedAt'>) => Promise<void>
      unsubscribe: (channelId: string) => Promise<void>
    }
  }
}

export {}
