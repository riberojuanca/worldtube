import { ipcMain, type BrowserWindow } from 'electron'

export interface BotGuardRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
}

export interface BotGuardResponse {
  status: number
  statusText: string
  contentType: string
  body: string
}

const windows = new Map<number, { win: BrowserWindow; pending: Set<AbortController> }>()
let registered = false
const allowedHeaders = new Set(['accept', 'accept-language', 'content-type', 'x-goog-visitor-id',
  'x-youtube-client-version', 'x-youtube-client-name', 'x-goog-api-key', 'x-user-agent'])

function permittedTarget(target: URL, method: string): boolean {
  if (target.protocol !== 'https:' || target.username || target.password || target.port) return false
  if (target.hostname === 'www.youtube.com') {
    return method === 'GET' ? target.pathname === '/' :
      ['/youtubei/v1/att/get', '/api/jnn/v1/GenerateIT'].includes(target.pathname)
  }
  if (method !== 'GET') return false
  return target.hostname === 'www.google.com' && target.pathname.startsWith('/js/')
}

export function registerBotGuardNetwork(win: BrowserWindow): void {
  const owner = { win, pending: new Set<AbortController>() }
  windows.set(win.webContents.id, owner)
  const id = win.webContents.id
  win.webContents.once('destroyed', () => {
    for (const controller of owner.pending) controller.abort()
    windows.delete(id)
  })
  if (registered) return
  registered = true

  ipcMain.handle('worldtube:botguard:request', async (event, request: BotGuardRequest): Promise<BotGuardResponse> => {
    const caller = windows.get(event.sender.id)
    if (!caller || event.senderFrame !== caller.win.webContents.mainFrame) throw new Error('Unauthorized BotGuard network caller')
    if (!request || typeof request.url !== 'string' || !['GET', 'POST'].includes(request.method)) {
      throw new Error('Invalid BotGuard request')
    }
    const target = new URL(request.url)
    if (!permittedTarget(target, request.method)) throw new Error('Blocked BotGuard network destination')
    if (request.body !== undefined && (typeof request.body !== 'string' || request.body.length > 1024 * 1024)) {
      throw new Error('Invalid BotGuard request body')
    }
    const headers = new Headers()
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      if (!allowedHeaders.has(name.toLowerCase()) || typeof value !== 'string') throw new Error('Blocked BotGuard request header')
      headers.set(name, value)
    }
    if (target.hostname === 'www.youtube.com' && request.method === 'POST') {
      headers.set('Origin', target.origin)
      headers.set('Referer', `${target.origin}/`)
    }

    const controller = new AbortController()
    caller.pending.add(controller)
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      // Native session.fetch has no opaque data-page CORS origin to work around.
      // Reject redirects rather than forwarding credentials to an unchecked URL.
      const response = await caller.win.webContents.session.fetch(target.href, {
        method: request.method, headers, body: request.method === 'POST' ? request.body : undefined,
        credentials: 'omit', redirect: 'error', signal: controller.signal
      })
      if (Number(response.headers.get('content-length')) > 16 * 1024 * 1024) throw new Error('BotGuard response too large')
      const body = await response.text()
      if (body.length > 16 * 1024 * 1024) throw new Error('BotGuard response too large')
      return { status: response.status, statusText: response.statusText,
        contentType: response.headers.get('content-type') ?? '', body }
    } finally {
      clearTimeout(timeout)
      caller.pending.delete(controller)
    }
  })
}
