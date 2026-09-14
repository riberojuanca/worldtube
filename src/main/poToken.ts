import { app, BrowserWindow, session } from 'electron'
import { build } from 'esbuild'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { registerBotGuardNetwork } from './botguardNetwork'

export interface PoTokenInput {
  videoId: string
}

export interface PoTokenResult {
  poToken: string
  /** Must be used as the InnerTube session's visitorData from here on — see script.ts. */
  visitorData: string
}

let bundledScriptPromise: Promise<string> | null = null

/**
 * Bundles src/main/botguard/script.ts (which imports bgutils-js) into one
 * self-contained script, so it can be handed to `executeJavaScript()` as a
 * plain string. Done once per app run and cached — this is a runtime
 * shortcut appropriate for dev; a real packaged build should pre-bundle this
 * at build time instead (esbuild would need to ship as a real dependency
 * otherwise, and re-bundling on every launch is wasted work).
 */
function getBundledScript(): Promise<string> {
  if (app.isPackaged) {
    bundledScriptPromise ??= readFile(join(process.resourcesPath, 'botguard.js'), 'utf8')
    return bundledScriptPromise
  }
  bundledScriptPromise ??= build({
    // app.getAppPath() (not __dirname): electron-vite bundles this module
    // itself into out/main/index.js, so __dirname there is out/main/, not
    // src/main/ — the .ts source we need to bundle only exists at the
    // project root. In dev that's exactly what getAppPath() returns (see
    // electron-vite's --app-path flag); a packaged build would need this
    // source file shipped as an extra resource, or (better) pre-bundled at
    // build time instead of on every launch — see the comment above.
    entryPoints: [join(app.getAppPath(), 'src/main/botguard/script.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120'
  }).then((result) => result.outputFiles[0].text)

  return bundledScriptPromise
}

let potokenSession: Electron.Session | null = null

function getPoTokenSession(): Electron.Session {
  if (potokenSession) return potokenSession

  // No `persist:` prefix: in-memory only, wiped when the app quits.
  // Isolated from the app's normal session so this never mixes with the
  // user's own cookies/storage.
  const s = session.fromPartition('botguard', { cache: false })

  s.setPermissionCheckHandler(() => false)
  s.setPermissionRequestHandler((_contents, _permission, respond) => respond(false))

  potokenSession = s
  return s
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`[poToken] timeout after ${ms}ms: ${label}`)), ms))
  ])
}

interface BotGuardWindow {
  win: BrowserWindow
  visitorData: string
  createdAt: number
}

// Solving the BotGuard challenge (home page fetch, running the attestation
// VM, exchanging it for an integrity token) is the expensive, video-independent
// part — only the final "mint a poToken for this videoId" step actually needs
// to happen per video, and that step is a local, no-network computation once
// the integrity token exists (see script.ts's initBotGuard/mintPoToken split).
// So instead of redoing the whole challenge per video (the original
// implementation — see git history — which made every single video load pay
// for a fresh home-page fetch + BotGuard VM run), one hidden window is kept
// alive and reused across videos, refreshed only periodically.
const BOTGUARD_WINDOW_TTL_MS = 30 * 60 * 1000

async function createBotGuardWindow(): Promise<BotGuardWindow> {
  console.log('[poToken] bundling botguard script...')
  const script = await getBundledScript()
  console.log(`[poToken] bundled (${script.length} chars), opening hidden window...`)

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session: getPoTokenSession(),
      offscreen: true,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'), 'botguard-preload.cjs')
    }
  })
  win.webContents.setAudioMuted(true)
  registerBotGuardNetwork(win)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  try {
    // This local blank document only runs the attestation interpreter. Network
    // requests use the narrowly scoped native bridge, not renderer fetch/CORS.
    await withTimeout(
      win.webContents.loadURL(
        'data:text/html,<!DOCTYPE html><html><head><title></title></head><body></body></html>',
        { baseURLForDataURL: 'https://www.youtube.com/' }
      ),
      10_000,
      'loadURL'
    )

    console.log('[poToken] window loaded, running BotGuard challenge (once for this window)...')
    // `script` defines __botguardInit__/__botguardMint__ on globalThis but
    // doesn't call them — the trailing statement here is what makes the
    // awaited promise's resolved value what executeJavaScript returns.
    const initResult = (await withTimeout(
      win.webContents.executeJavaScript(`${script}\nglobalThis.__botguardInit__()`),
      30_000,
      'executeJavaScript(botguard init)'
    )) as { visitorData?: string } | undefined

    if (!initResult?.visitorData) {
      throw new Error(`BotGuard init did not return visitorData (got ${JSON.stringify(initResult)})`)
    }

    console.log('[poToken] BotGuard challenge solved, window ready for cheap per-video minting')
    return { win, visitorData: initResult.visitorData, createdAt: Date.now() }
  } catch (error) {
    console.error('[poToken] initialization failed:', error instanceof Error ? error.message : String(error))
    win.destroy()
    throw error
  }
}

let botguardWindowPromise: Promise<BotGuardWindow> | null = null

function getBotGuardWindow(): Promise<BotGuardWindow> {
  if (!botguardWindowPromise) {
    botguardWindowPromise = createBotGuardWindow().catch((error) => {
      botguardWindowPromise = null
      throw error
    })
  }
  return botguardWindowPromise
}

function resetBotGuardWindow(botguard: BotGuardWindow): void {
  botguard.win.destroy()
  botguardWindowPromise = null
}

async function mintFromWindow(botguard: BotGuardWindow, videoId: string): Promise<string> {
  const poToken = (await withTimeout(
    botguard.win.webContents.executeJavaScript(`globalThis.__botguardMint__(${JSON.stringify(videoId)})`),
    10_000,
    'executeJavaScript(botguard mint)'
  )) as string | undefined

  if (!poToken) {
    throw new Error(`mintPoToken did not return a poToken (got ${JSON.stringify(poToken)})`)
  }
  return poToken
}

async function generatePoTokenSerialized(input: PoTokenInput): Promise<PoTokenResult> {
  let botguard = await getBotGuardWindow()

  if (Date.now() - botguard.createdAt > BOTGUARD_WINDOW_TTL_MS) {
    console.log('[poToken] cached BotGuard window is past its TTL, refreshing...')
    resetBotGuardWindow(botguard)
    botguard = await getBotGuardWindow()
  }

  try {
    const poToken = await mintFromWindow(botguard, input.videoId)
    return { poToken, visitorData: botguard.visitorData }
  } catch (error) {
    // The cached window/minter could be dead for reasons that only show up
    // at mint time (renderer crash, an integrity token YouTube rejected
    // sooner than our TTL guess) — drop it and retry once against a fresh
    // window rather than failing every video until the app restarts.
    console.error('[poToken] mint against cached window failed, recreating once and retrying', error)
    resetBotGuardWindow(botguard)
    const fresh = await getBotGuardWindow()
    const poToken = await mintFromWindow(fresh, input.videoId)
    return { poToken, visitorData: fresh.visitorData }
  }
}

// Serializes access to the shared hidden window — two videos requested at
// once (prefetching a related video, a fast double click, React StrictMode)
// shouldn't run overlapping executeJavaScript calls against the same page.
let queue: Promise<unknown> = Promise.resolve()

/**
 * Generates a video-bound "proof of origin" token via bgutils-js/BotGuard,
 * the same anti-abuse challenge every YouTube web client (official or not)
 * has to solve to get non-throttled streaming URLs. The expensive part (the
 * actual BotGuard challenge) only runs once per hidden window, not once per
 * video — see BOTGUARD_WINDOW_TTL_MS above.
 */
export function generatePoToken(input: PoTokenInput): Promise<PoTokenResult> {
  const result = queue.then(() => generatePoTokenSerialized(input))
  // Keep the queue alive even if this call fails, so it doesn't wedge every
  // later call — the caller still sees this call's own rejection via `result`.
  queue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}
