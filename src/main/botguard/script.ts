import { BotGuardClient } from 'bgutils-js/botguard'
import { buildURL, GOOG_API_KEY, parseLooseJSON } from 'bgutils-js/utils'
import { WebPoMinter } from 'bgutils-js/webpo'
import type { WebPoSignalOutput } from 'bgutils-js/shared-types'

/**
 * Runs inside a hidden, offscreen BrowserWindow (see ../poToken.ts) — bundled
 * with esbuild into a single self-contained script and handed to
 * `webContents.executeJavaScript()`, because BotGuard needs a real
 * `window`/`document` and to make same-origin-as-youtube.com requests, which
 * only exists in a renderer, not in the main process.
 *
 * First pass tried skipping straight to a bare `/att/get` call and got
 * `400 FAILED_PRECONDITION` — YouTube expects an `eacrToken` that only comes
 * from an actual page load, so this scrapes youtube.com's own home page for
 * it first, same technique FreeTube uses (see
 * freetube-audio-lab/src/renderer/helpers/api/local.js#getHTMLPage /
 * #getWatchHTMLWatchPage) — reimplemented here against the public
 * `bgutils-js` API, not copied from that file.
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
}

// A bare "Failed to fetch" from the browser tells you nothing about which of
// the several fetch() calls below actually failed (network, CORS, etc. all
// look identical) — label each one so a future failure is diagnosable from
// the error message alone instead of another guessing round.
async function fetchStep(label: string, input: RequestInfo, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    throw new Error(`[${label}] fetch threw: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function initBotGuard(): Promise<InitResult> {
  const homeResponse = await fetchStep('home page', 'https://www.youtube.com/', {
    headers: { 'Accept-Language': 'en-US' }
  })
  const homeHtml = await homeResponse.text()

  const ytConfigMatch = homeHtml.match(/ytcfg\.set\(({.+?})\);/s)
  if (!ytConfigMatch) {
    throw new Error('Could not find ytcfg in the YouTube home page')
  }
  const ytConfig = JSON.parse(ytConfigMatch[1])

  const attestationMatch = homeHtml.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/)
  if (!attestationMatch) {
    throw new Error('Could not find BotGuard attestation data in the YouTube home page')
  }
  const initialAttestationData = parseLooseJSON(attestationMatch[1]) as {
    R: { bgChallenge?: unknown }
    T: string
  }

  const context = ytConfig.INNERTUBE_CONTEXT
  const visitorData: string = context?.client?.visitorData ?? ytConfig.VISITOR_DATA ?? ''
  const clientVersion: string = context?.client?.clientVersion ?? ytConfig.INNERTUBE_CLIENT_VERSION

  // BotGuard reads a couple of fields off `window.yt.config_`.
  ;(window as unknown as { yt: { config_: unknown } }).yt = { config_: ytConfig }

  let challengeData = initialAttestationData.R as {
    bgChallenge?: {
      interpreterUrl?: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string }
      program: string
      globalName: string
    }
  }

  if (!challengeData?.bgChallenge) {
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

  const interpreterJs = await (await fetchStep('interpreter script', interpreterUrl)).text()
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

  const [integrityToken] = await integrityResponse.json()
  if (typeof integrityToken !== 'string') {
    throw new Error('Could not obtain an integrity token')
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
