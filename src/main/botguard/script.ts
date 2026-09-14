import { BotGuardClient } from 'bgutils-js/botguard'
import { buildURL, GOOG_API_KEY } from 'bgutils-js/utils'
import { WebPoMinter } from 'bgutils-js/webpo'
import type { WebPoSignalOutput } from 'bgutils-js/shared-types'
import { extractYouTubePageData } from './pageData'
import type { BotGuardRequest, BotGuardResponse } from '../botguardNetwork'

/**
 * Runs inside a hidden, offscreen BrowserWindow (see ../poToken.ts) — bundled
 * with esbuild into a single self-contained script and handed to
 * `webContents.executeJavaScript()`, because BotGuard needs a real
 * `window`/`document`, which only exist in a renderer, not in the main process.
 *
 * Page configuration is extracted as AST data by pageData.ts. Requests are
 * performed by Electron's isolated session.fetch bridge; no renderer CORS
 * headers are rewritten. The attestation lifecycle uses BgUtils's public API.
 * Historical adaptations and replacement sources are recorded in
 * docs/LICENSE_REVIEW.md and docs/PROVENANCE_REPLACEMENTS.md.
 *
 * Split into `initBotGuard` (expensive: home page fetch, solving the
 * challenge, minting an integrity token — none of this is video-specific)
 * and `mintPoToken` (cheap: a local, no-network call on the already-built
 * `WebPoMinter`, which *is* video-specific). poToken.ts calls `initBotGuard`
 * once per hidden window and keeps that window alive, calling `mintPoToken`
 * — a much smaller script — for every subsequent video, instead of redoing
 * the whole challenge from scratch each time.
 *
 * Public request key baked into every YouTube web client's own JS bundle —
 * not a secret, every third-party InnerTube client (yt-dlp, NewPipe, etc.)
 * uses this same constant.
 */
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo'

interface InitResult {
  visitorData: string
}

declare global {
  // eslint-disable-next-line no-var
  var __botguardMinter__: InstanceType<typeof WebPoMinter> | undefined
  interface Window {
    botguardNetwork: { request(request: BotGuardRequest): Promise<BotGuardResponse> }
  }
}

// A bare "Failed to fetch" from the browser tells you nothing about which of
// the several fetch() calls below actually failed (network, CORS, etc. all
// look identical) — label each one so a future failure is diagnosable from
// the error message alone instead of another guessing round.
async function fetchStep(label: string, input: string, init?: RequestInit): Promise<Response> {
  try {
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    const result = await window.botguardNetwork.request({ url: input,
      method: init?.method === 'POST' ? 'POST' : 'GET', headers,
      body: typeof init?.body === 'string' ? init.body : undefined })
    if (result.status < 200 || result.status >= 300) throw new Error(`HTTP ${result.status}: ${result.body.slice(0, 300)}`)
    return new Response(result.body, { status: result.status, statusText: result.statusText,
      headers: { 'content-type': result.contentType } })
  } catch (error) {
    throw new Error(`[${label}] fetch threw: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function initBotGuard(): Promise<InitResult> {
  const homeResponse = await fetchStep('home page', 'https://www.youtube.com/', {
    headers: { 'Accept-Language': 'en-US' }
  })
  const page = extractYouTubePageData(await homeResponse.text())
  const ytConfig = page.config as {
    INNERTUBE_CONTEXT?: { client?: { visitorData?: string; clientVersion?: string } }
    VISITOR_DATA?: string
    INNERTUBE_CLIENT_VERSION?: string
  }
  const initialAttestationData = page.attestation

  const context = ytConfig.INNERTUBE_CONTEXT
  const visitorData: string = context?.client?.visitorData ?? ytConfig.VISITOR_DATA ?? ''
  const clientVersion = context?.client?.clientVersion ?? ytConfig.INNERTUBE_CLIENT_VERSION
  if (!visitorData || !clientVersion || !context) throw new Error('YouTube page configuration is missing client identity')

  // BotGuard reads a couple of fields off `window.yt.config_`.
  ;(window as unknown as { yt: { config_: unknown } }).yt = { config_: ytConfig }

  let challengeData = (typeof initialAttestationData.R === 'string'
    ? JSON.parse(initialAttestationData.R) : initialAttestationData.R) as {
    bgChallenge?: {
      interpreterUrl?: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string }
      program: string
      globalName: string
    }
  }

  if (!challengeData?.bgChallenge) {
    if (typeof initialAttestationData.T !== 'string') throw new Error('YouTube attestation data is missing eacrToken')
    const challengeResponse = await fetchStep(
      'att/get',
      'https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false&alt=json',
      {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
          'X-Goog-Visitor-Id': visitorData,
          'X-Youtube-Client-Version': clientVersion,
          'X-Youtube-Client-Name': '1'
        },
        body: JSON.stringify({
          engagementType: 'ENGAGEMENT_TYPE_UNBOUND',
          eacrToken: initialAttestationData.T,
          context
        })
      }
    )

    if (!challengeResponse.ok) {
      throw new Error(`att/get failed with status ${challengeResponse.status}: ${await challengeResponse.text()}`)
    }

    challengeData = await challengeResponse.json()
    if (!challengeData.bgChallenge) {
      throw new Error('YouTube did not return a BotGuard challenge')
    }
  }

  let interpreterUrl = challengeData.bgChallenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue
  if (!interpreterUrl) {
    throw new Error('BotGuard challenge had no interpreter URL')
  }
  if (interpreterUrl.startsWith('//')) {
    interpreterUrl = `https:${interpreterUrl}`
  }

  const interpreterJs = await (await fetchStep('interpreter script', new URL(interpreterUrl, 'https://www.youtube.com/').href)).text()
  if (!interpreterJs) {
    throw new Error('Could not load the BotGuard VM script')
  }

  // eslint-disable-next-line no-new-func -- this IS the VM: it's YouTube's own attestation interpreter
  new Function(interpreterJs)()

  const botGuard = await BotGuardClient.create({
    program: challengeData.bgChallenge.program,
    globalName: challengeData.bgChallenge.globalName,
    globalObject: window
  })

  const webPoSignalOutput: WebPoSignalOutput = []
  const botGuardResponse = await botGuard.snapshot({ webPoSignalOutput }, 10_000)

  const integrityResponse = await fetchStep('GenerateIT', buildURL('GenerateIT', true), {
    method: 'POST',
    headers: {
      'content-type': 'application/json+protobuf',
      'x-goog-api-key': GOOG_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1'
    },
    body: JSON.stringify([REQUEST_KEY, botGuardResponse])
  })

  const integrityData: unknown = await integrityResponse.json()
  const integrityToken = Array.isArray(integrityData) ? integrityData[0] : undefined
  if (typeof integrityToken !== 'string' || integrityToken.length === 0) {
    const shape = Array.isArray(integrityData)
      ? integrityData.map((field) => field === null ? 'null' : Array.isArray(field) ? 'array' : typeof field).join(', ')
      : integrityData === null ? 'null' : typeof integrityData
    throw new Error(`Could not obtain an integrity token (GenerateIT HTTP ${integrityResponse.status}; response types: ${shape})`)
  }

  globalThis.__botguardMinter__ = await WebPoMinter.create({ integrityToken }, webPoSignalOutput)

  return { visitorData }
}

/**
 * Cheap follow-up call for every video after the first in this window's
 * lifetime — purely local (HMAC over the videoId using key material already
 * derived by `initBotGuard`), no network round trip.
 */
function mintPoToken(videoId: string): Promise<string> {
  if (!globalThis.__botguardMinter__) {
    throw new Error('mintPoToken called before initBotGuard completed')
  }
  return globalThis.__botguardMinter__.mintAsWebsafeString(videoId)
}

// esbuild's IIFE bundle format wraps this whole module in `(function(){...})()`,
// so these would just be local bindings *inside* that wrapper otherwise —
// stash them on `globalThis` so poToken.ts's own trailing statements
// (appended after this bundle, see getBundledScript's callers) can invoke
// whichever one it needs and have executeJavaScript see the result as its
// completion value.
;(globalThis as unknown as { __botguardInit__: typeof initBotGuard }).__botguardInit__ = initBotGuard
;(globalThis as unknown as { __botguardMint__: typeof mintPoToken }).__botguardMint__ = mintPoToken
