import type {
  ChannelResponse,
  CollectionRequest,
  CollectionResponse,
  PlayerAudioPreferences,
  ChannelPageRequest,
  ChannelPageResponse,
  CreateLocalUserRequest,
  DeleteLocalUserRequest,
  CreateProfileRequest,
  CreateSavedPlaylistRequest,
  HistoryEntry,
  LocalSessionState,
  LibraryKind,
  LoginLocalUserRequest,
  ProfilesState,
  SaveVideoRequest,
  SavedPlaylist,
  SavedVideo,
  SearchHistoryEntry,
  SearchFilters,
  SearchResponse,
  SearchSuggestionsResponse,
  Subscription,
  UpdateProfileRequest,
  VideoInfoResponse
} from '../../shared/ipc'

declare global {
  interface Window {
    api: {
      getVideoPreview: (videoId: string) => Promise<import('../../shared/ipc').VideoPreview | null>
      getAppPreferences: () => Promise<import('../../shared/locale').AppPreferences>
      setAppPreferences: (preferences: import('../../shared/locale').AppPreferences) => Promise<void>
      getUpdateState: () => Promise<import('../../shared/ipc').UpdateState>
      checkForUpdates: () => Promise<import('../../shared/ipc').UpdateState>
      downloadUpdate: () => Promise<import('../../shared/ipc').UpdateState>
      installUpdate: () => Promise<void>
      onUpdateState: (listener: (state: import('../../shared/ipc').UpdateState) => void) => () => void
      getPlayerAudioPreferences: () => Promise<PlayerAudioPreferences>
      setPlayerAudioPreferences: (audio: PlayerAudioPreferences) => Promise<void>
      getVideoInfo: (videoId: string) => Promise<VideoInfoResponse>
      search: (query: string, filters?: SearchFilters) => Promise<SearchResponse>
      getCollection: (request: CollectionRequest) => Promise<CollectionResponse>
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
      listSavedPlaylists: (library?: LibraryKind) => Promise<SavedPlaylist[]>
      createSavedPlaylist: (request: CreateSavedPlaylistRequest) => Promise<SavedPlaylist>
      listSavedVideos: (playlistId?: string | null, library?: LibraryKind) => Promise<SavedVideo[]>
      saveVideo: (request: SaveVideoRequest) => Promise<SavedVideo>
      removeSavedVideo: (videoId: string, playlistId?: string | null, library?: LibraryKind) => Promise<void>
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
