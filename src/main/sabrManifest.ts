import { Constants } from 'youtubei.js'
import type { SabrFormatInfo, SabrManifestInfo, SabrStreamInfo } from '../shared/ipc'

/**
 * Builds the JSON payload the renderer needs to play a video that YouTube
 * only serves through SABR (its newer streaming protocol — most current
 * videos hit this path, see the SABR detection in youtube.ts).
 *
 * This mirrors what the freetube-audio-lab prototype's `createLocalSabrManifest`
 * does client-side (see its Watch.js), but built here on the main side, where
 * we already have the deciphering `Player` instance and the poToken. The wire
 * protocol itself (the `sabr:` requests, UMP responses) is implemented
 * independently in src/renderer/src/player/sabr/ — this module only collects
 * the inputs it needs.
 */
export async function buildSabrPayload(
  info: {
    cpn: string
    streaming_data?: {
      server_abr_streaming_url?: string
      adaptive_formats: Array<{
        itag: number
        last_modified_ms: string
        mime_type: string
        xtags?: string
        bitrate: number
        init_range?: { start: number; end: number }
        index_range?: { start: number; end: number }
        width?: number
        height?: number
        fps?: number
        language?: string | null
        audio_sample_rate?: number
        audio_channels?: number
        spatial_audio_type?: string
        color_info?: { primaries?: string; transfer_characteristics?: string }
        approx_duration_ms: number
      }>
    }
    player_config?: {
      media_common_config?: {
        media_ustreamer_request_config?: { video_playback_ustreamer_config?: string }
      }
    }
  },
  decipher: (url: string) => Promise<string>,
  poToken: string,
  client: { clientName: string; clientVersion: string; osName: string; osVersion: string }
): Promise<{ manifest: SabrManifestInfo; stream: SabrStreamInfo } | null> {
  const streamingData = info.streaming_data
  const ustreamerConfigB64 = streamingData?.server_abr_streaming_url
    ? info.player_config?.media_common_config?.media_ustreamer_request_config?.video_playback_ustreamer_config
    : undefined

  if (!streamingData?.server_abr_streaming_url || !ustreamerConfigB64) {
    return null
  }

  const formats = streamingData.adaptive_formats.filter((format) => format.init_range && format.index_range)
  if (formats.length === 0) {
    return null
  }

  const abrUrl = new URL(await decipher(streamingData.server_abr_streaming_url))
  abrUrl.searchParams.set('alr', 'yes')
  abrUrl.searchParams.set('cpn', info.cpn)

  const clientNameId = Constants.CLIENT_NAME_IDS[client.clientName as keyof typeof Constants.CLIENT_NAME_IDS]

  const manifest: SabrManifestInfo = {
    // Different formats can report slightly different durations; using the
    // shortest avoids the player getting stuck trying to reach a duration
    // longer than what every stream actually has.
    durationSeconds: Math.min(...formats.map((f) => f.approx_duration_ms)) / 1000,
    formats: formats.map(
      (format): SabrFormatInfo => ({
        itag: format.itag,
        lastModified: format.last_modified_ms,
        mimeType: format.mime_type,
        xtags: format.xtags,
        bitrate: format.bitrate,
        initRange: format.init_range!,
        indexRange: format.index_range!,
        width: format.width,
        height: format.height,
        frameRate: format.fps,
        language: format.language,
        audioSampleRate: format.audio_sample_rate,
        audioChannels: format.audio_channels,
        spatialAudio: Boolean(format.spatial_audio_type),
        colorPrimaries: format.color_info?.primaries,
        colorTransferCharacteristics: format.color_info?.transfer_characteristics
      })
    )
  }

  const stream: SabrStreamInfo = {
    abrUrl: abrUrl.toString(),
    poToken,
    ustreamerConfigB64,
    clientInfo: {
      clientNameId: Number(clientNameId),
      clientVersion: client.clientVersion,
      osName: client.osName,
      osVersion: client.osVersion
    }
  }

  return { manifest, stream }
}
