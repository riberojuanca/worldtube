import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc'
import { translateFor } from '../shared/locale'
import { registerUpdates, checkForUpdatesOnStartup } from './updates'
import type {
  ChannelResponse,
  CreateLocalUserRequest,
  DeleteLocalUserRequest,
  CreateProfileRequest,
  CreateSavedPlaylistRequest,
  LocalSessionState,
  LoginLocalUserRequest,
  ProfilesState,
  SaveVideoRequest,
  SearchRequest,
  SearchResponse,
  SearchSuggestionsResponse,
  Subscription,
  UpdateProfileRequest,
  VideoInfoRequest,
  VideoInfoResponse
} from '../shared/ipc'
import { fetchVideoInfo, getChannelInfo, getHomeDiscovery, getSearchSuggestions, getSubscriptionsFeed, getVideoPreview, searchVideos } from './youtube'
import { getChannelPage } from './channelBrowse'
import type { ChannelPageRequest, ChannelPageResponse } from '../shared/ipc'
import { clearHistory, getHistory } from './historyStore'
import {
  createLocalUser,
  getAppPreferences,
  setAppPreferences,
  createActiveSavedPlaylist,
  deleteLocalUser,
  createUserProfile,
  exportLocalData,
  getProfilesState,
  getSessionState,
  getPlayerAudioPreferences,
  setPlayerAudioPreferences,
  importLocalData,
  listActiveSearchHistory,
  listActiveSavedPlaylists,
  listActiveSavedVideos,
  loginLocalUser,
  logoutLocalUser,
  recordActiveSearchQuery,
  removeActiveSavedVideo,
  removeUserProfile,
  saveActiveVideo,
  setActiveUserProfile,
  updateUserProfile
} from './localDb'
import { addSubscription, listSubscriptions, removeSubscription } from './subscriptionsStore'

// Keep the data directory identical in development and packaged installations.
app.setName('worldtube')
if (process.platform === 'linux') {
  app.setDesktopName(app.isPackaged ? 'com.riberojuanca.worldtube.desktop' : 'com.riberojuanca.worldtube.dev.desktop')
}

// This dev machine doesn't have the setuid chrome-sandbox helper configured
// (needs root-owned 4755, which we won't set from here), so Chromium's native
// startup aborts before any of this file's JS runs — app.commandLine.appendSwitch()
// here is too late to matter. `pnpm dev` passes electron-vite's own `--noSandbox`
// flag instead. A packaged build hitting the same host will need `--no-sandbox`
// passed to the electron binary itself (see freetube-audio-lab's dev notes).

function createWindow(): void {
  const icon = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources/icon.png')
  const mainWindow = new BrowserWindow({
    icon,
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // The renderer's `fetch()` calls to YouTube's SABR/ABR endpoint
  // (googlevideo.com), and the native <track> loads for captions
  // (www.youtube.com/api/timedtext, see GlobalPlayerHost.tsx) are otherwise
  // blocked by CORS — those servers don't send Access-Control-Allow-Origin
  // for an app origin like this one. Same approach as poToken.ts's hidden
  // BotGuard session: inject the headers a real page load would send, and
  // allow the response back in. Scoped to just these two paths so nothing
  // else loaded in this window is affected.
  const CORS_WORKAROUND_URLS = ['https://*.googlevideo.com/*', 'https://www.youtube.com/api/timedtext*']

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders({ urls: CORS_WORKAROUND_URLS }, ({ requestHeaders }, callback) => {
    requestHeaders.Referer = 'https://www.youtube.com/'
    requestHeaders.Origin = 'https://www.youtube.com'
    callback({ requestHeaders })
  })

  mainWindow.webContents.session.webRequest.onHeadersReceived({ urls: CORS_WORKAROUND_URLS }, ({ responseHeaders }, callback) => {
    const headers: Record<string, string[]> = { ...responseHeaders }
    // googlevideo.com already echoes back an ACAO header for the Origin we
    // send (see onBeforeSendHeaders above) — appending another one instead of
    // replacing it produces an invalid multi-value header the browser rejects.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'access-control-allow-origin') delete headers[key]
    }
    headers['Access-Control-Allow-Origin'] = ['*']
    callback({ responseHeaders: headers })
  })

  // Renderer console output normally only goes to Chrome DevTools, invisible
  // from the terminal running `pnpm dev` — mirror it into our own stdout so
  // React/shaka-player errors show up in the same place as main-process logs.
  mainWindow.webContents.on('console-message', (details) => {
    console.log(`[renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle(
  IPC_CHANNELS.GET_VIDEO_INFO,
  async (_event, { videoId }: VideoInfoRequest): Promise<VideoInfoResponse> => {
    try {
      const data = await fetchVideoInfo(videoId)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
)

ipcMain.handle(IPC_CHANNELS.GET_VIDEO_PREVIEW, (_event, videoId: string) => getVideoPreview(videoId))

ipcMain.handle(IPC_CHANNELS.SEARCH, async (_event, { query }: SearchRequest): Promise<SearchResponse> => {
  try {
    await recordActiveSearchQuery(query).catch((error) => {
      console.warn('[search-history] failed to record query', error)
    })
    const data = await searchVideos(query)
    return { ok: true, data: data.videos, channels: data.channels }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.SEARCH_SUGGESTIONS, async (_event, { query }: SearchRequest): Promise<SearchSuggestionsResponse> => {
  try {
    const data = await getSearchSuggestions(query)
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.GET_HOME_FEED, async (): Promise<SearchResponse> => {
  try {
    const data = await getHomeDiscovery()
    return { ok: true, data: data.videos, home: data.home }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.GET_CHANNEL, async (_event, { channelId }: { channelId: string }): Promise<ChannelResponse> => {
  try {
    const data = await getChannelInfo(channelId, false)
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.CHANNEL_PAGE, async (_event, request: ChannelPageRequest): Promise<ChannelPageResponse> => {
  try {
    return { ok: true, data: await getChannelPage(request) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

registerUpdates()
ipcMain.handle(IPC_CHANNELS.APP_PREFERENCES_GET, () => getAppPreferences())
ipcMain.handle(IPC_CHANNELS.APP_PREFERENCES_SET, (_event, preferences: import('../shared/locale').AppPreferences) => setAppPreferences(preferences))
ipcMain.handle(IPC_CHANNELS.SESSION_GET_STATE, (): Promise<LocalSessionState> => getSessionState())
ipcMain.handle(IPC_CHANNELS.PLAYER_AUDIO_GET, () => getPlayerAudioPreferences())
ipcMain.handle(IPC_CHANNELS.PLAYER_AUDIO_SET, (_event, audio: import('../shared/ipc').PlayerAudioPreferences) => setPlayerAudioPreferences(audio))
ipcMain.handle(IPC_CHANNELS.SESSION_CREATE_USER, (_event, request: CreateLocalUserRequest): Promise<LocalSessionState> => createLocalUser(request))
ipcMain.handle(IPC_CHANNELS.SESSION_LOGIN, (_event, request: LoginLocalUserRequest): Promise<LocalSessionState> => loginLocalUser(request))
ipcMain.handle(IPC_CHANNELS.SESSION_LOGOUT, (): Promise<LocalSessionState> => logoutLocalUser())
ipcMain.handle(IPC_CHANNELS.SESSION_DELETE_USER, (_event, request: DeleteLocalUserRequest): Promise<LocalSessionState> => deleteLocalUser(request))

ipcMain.handle(IPC_CHANNELS.DATA_EXPORT, async (event): Promise<string | null> => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
  const result = await dialog.showSaveDialog(ownerWindow, {
    title: translateFor((await getAppPreferences()).language, 'Exportar datos de WorldTube'),
    defaultPath: 'worldtube-data.json',
    filters: [{ name: 'WorldTube data', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null
  await exportLocalData(result.filePath)
  return result.filePath
})

ipcMain.handle(IPC_CHANNELS.DATA_IMPORT, async (event): Promise<LocalSessionState | null> => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
  const result = await dialog.showOpenDialog(ownerWindow, {
    title: translateFor((await getAppPreferences()).language, 'Importar datos de WorldTube'),
    properties: ['openFile'],
    filters: [{ name: 'WorldTube data', extensions: ['json'] }]
  })
  const [filePath] = result.filePaths
  if (result.canceled || !filePath) return null
  return importLocalData(filePath)
})

ipcMain.handle(IPC_CHANNELS.PROFILES_GET_STATE, (): Promise<ProfilesState> => getProfilesState())
ipcMain.handle(IPC_CHANNELS.PROFILES_CREATE, (_event, request: CreateProfileRequest): Promise<ProfilesState> => createUserProfile(request))
ipcMain.handle(IPC_CHANNELS.PROFILES_UPDATE, (_event, request: UpdateProfileRequest): Promise<ProfilesState> => updateUserProfile(request))
ipcMain.handle(IPC_CHANNELS.PROFILES_SET_ACTIVE, (_event, profileId: string): Promise<ProfilesState> => setActiveUserProfile(profileId))
ipcMain.handle(IPC_CHANNELS.PROFILES_REMOVE, (_event, profileId: string): Promise<ProfilesState> => removeUserProfile(profileId))

ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, () => getHistory())
ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () => clearHistory())

ipcMain.handle(IPC_CHANNELS.SAVED_PLAYLISTS_LIST, () => listActiveSavedPlaylists())
ipcMain.handle(IPC_CHANNELS.SAVED_PLAYLISTS_CREATE, (_event, request: CreateSavedPlaylistRequest) => createActiveSavedPlaylist(request))
ipcMain.handle(IPC_CHANNELS.SAVED_VIDEOS_LIST, (_event, playlistId?: string | null) => listActiveSavedVideos(playlistId))
ipcMain.handle(IPC_CHANNELS.SAVED_VIDEOS_SAVE, (_event, request: SaveVideoRequest) => saveActiveVideo(request))
ipcMain.handle(IPC_CHANNELS.SAVED_VIDEOS_REMOVE, (_event, videoId: string, playlistId?: string | null) =>
  removeActiveSavedVideo(videoId, playlistId)
)
ipcMain.handle(IPC_CHANNELS.SEARCH_HISTORY_LIST, () => listActiveSearchHistory())
ipcMain.handle(IPC_CHANNELS.SEARCH_HISTORY_RECORD, (_event, query: string) => recordActiveSearchQuery(query))

ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_LIST, () => listSubscriptions())
ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_FEED, async (): Promise<SearchResponse> => {
  try {
    const subs = await listSubscriptions()
    const data = await getSubscriptionsFeed(subs.map((sub) => sub.channelId))
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})
ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_ADD, (_event, sub: Omit<Subscription, 'subscribedAt'>) => addSubscription(sub))
ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_REMOVE, (_event, channelId: string) => removeSubscription(channelId))

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources/icon.png'))
  }
  createWindow()
  void checkForUpdatesOnStartup()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Dev-only: exercise the real fetchVideoInfo pipeline on boot without
  // needing anyone to click through the UI. Set WORLDTUBE_AUTOTEST_VIDEO_ID
  // when launching `pnpm dev` — logs go through the same console.log calls
  // as a real request, so they show up wherever those are being watched.
  const autotestVideoId = process.env.WORLDTUBE_AUTOTEST_VIDEO_ID
  if (autotestVideoId) {
    fetchVideoInfo(autotestVideoId)
      .then((data) => console.log('[autotest] RESULT_OK', JSON.stringify({ ...data, dashManifest: data.dashManifest ? `<${data.dashManifest.length} chars>` : null })))
      .catch((error) => console.error('[autotest] RESULT_ERROR', error))
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
