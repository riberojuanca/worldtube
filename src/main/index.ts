import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc'
import type {
  ChannelResponse,
  SearchRequest,
  SearchResponse,
  Subscription,
  VideoInfoRequest,
  VideoInfoResponse
} from '../shared/ipc'
import { fetchVideoInfo, getChannelInfo, getHomeFeed, getSubscriptionsFeed, searchVideos } from './youtube'
import { clearHistory, getHistory } from './historyStore'
import { addSubscription, listSubscriptions, removeSubscription } from './subscriptionsStore'

// This dev machine doesn't have the setuid chrome-sandbox helper configured
// (needs root-owned 4755, which we won't set from here), so Chromium's native
// startup aborts before any of this file's JS runs — app.commandLine.appendSwitch()
// here is too late to matter. `pnpm dev` passes electron-vite's own `--noSandbox`
// flag instead. A packaged build hitting the same host will need `--no-sandbox`
// passed to the electron binary itself (see freetube-audio-lab's dev notes).

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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

ipcMain.handle(IPC_CHANNELS.SEARCH, async (_event, { query }: SearchRequest): Promise<SearchResponse> => {
  try {
    const data = await searchVideos(query)
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.GET_HOME_FEED, async (): Promise<SearchResponse> => {
  try {
    const data = await getHomeFeed()
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.GET_CHANNEL, async (_event, { channelId }: { channelId: string }): Promise<ChannelResponse> => {
  try {
    const data = await getChannelInfo(channelId)
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, () => getHistory())
ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () => clearHistory())

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
  createWindow()

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
