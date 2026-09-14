import shaka from 'shaka-player/dist/shaka-player.ui.js'
import { SabrStreamingAdapter } from 'googlevideo/sabr-streaming-adapter'
import type { ReloadPlaybackContext } from 'googlevideo/protos'
import type { SabrManifestInfo, SabrStreamInfo } from '../../../../shared/ipc'
import { ShakaSabrPlayerAdapter, ensureSabrSchemeRegistered, registerSabrPlayerAdapter } from './playerAdapter'
import { buildSabrManifestUri, ensureSabrManifestParserRegistered } from './manifestParser'
import { toGoogleVideoFormat } from './format'

export { buildSabrManifestUri } from './manifestParser'

ensureSabrSchemeRegistered()
ensureSabrManifestParserRegistered()

export interface SabrSessionCallbacks {
  /** Called when YouTube's server tells us to reload the player with new parameters (expired stream, etc). */
  onReloadRequested: (context: ReloadPlaybackContext) => void
}

export interface SabrSession {
  manifestUri: string
  dispose: () => void
}

/**
 * Wires up one video's worth of SABR playback: a fresh `googlevideo`
 * SabrStreamingAdapter + our ShakaSabrPlayerAdapter, attached to the given
 * (persistent, app-lifetime) shaka.Player. Returns the manifest URI to
 * `player.load()` and a `dispose()` to call before starting the next one.
 */
export function startSabrSession(player: shaka.Player, manifest: SabrManifestInfo, stream: SabrStreamInfo, callbacks: SabrSessionCallbacks): SabrSession {
  const sessionId = crypto.randomUUID()
  let disposed = false
  const playerAdapter = new ShakaSabrPlayerAdapter()

  const sabrAdapter = new SabrStreamingAdapter({
    playerAdapter,
    clientInfo: {
      clientName: stream.clientInfo.clientNameId,
      clientVersion: stream.clientInfo.clientVersion,
      osName: stream.clientInfo.osName,
      osVersion: stream.clientInfo.osVersion
    }
  })

  sabrAdapter.onMintPoToken(async () => stream.poToken)
  sabrAdapter.onReloadPlayerResponse(async (context) => {
    if (!disposed) callbacks.onReloadRequested(context)
  })

  sabrAdapter.attach(player)
  sabrAdapter.setStreamingURL(stream.abrUrl)
  sabrAdapter.setUstreamerConfig(stream.ustreamerConfigB64)
  sabrAdapter.setServerAbrFormats(manifest.formats.map(toGoogleVideoFormat))

  const unregister = registerSabrPlayerAdapter(sessionId, playerAdapter)

  return {
    manifestUri: buildSabrManifestUri(manifest, sessionId),
    dispose: () => {
      if (disposed) return
      disposed = true
      unregister()
      sabrAdapter.dispose()
    }
  }
}
