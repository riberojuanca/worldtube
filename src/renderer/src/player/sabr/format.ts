import { buildSabrFormat } from 'googlevideo/utils'
import type { SabrFormatInfo } from '../../../../shared/ipc'

/**
 * `googlevideo` doesn't re-export its `SabrFormat` type by name from any of
 * its public entry points (only functions that use it) — this pulls the
 * shape out structurally via one of those functions instead of duplicating
 * the interface by hand.
 */
export type GVSabrFormat = ReturnType<typeof buildSabrFormat>

/**
 * The key we use everywhere (shaka stream `originalId`, the `sabr://…?key=`
 * query param, and what we hand `googlevideo`'s adapter) to identify one
 * format. Matches `googlevideo`'s own `createKey()` (itag + xtags) so its
 * internal format lookups (`fromFormat`, `fromMediaHeader`) line up with ours
 * without any translation layer.
 */
export function formatKey(itag: number, xtags: string | undefined): string {
  return `${itag}:${xtags ?? ''}`
}

export function keyOfFormatInfo(format: SabrFormatInfo): string {
  return formatKey(format.itag, format.xtags)
}

/** Converts our own IPC format shape into the shape googlevideo's SabrStreamingAdapter expects. */
export function toGoogleVideoFormat(format: SabrFormatInfo): GVSabrFormat {
  return {
    itag: format.itag,
    lastModified: format.lastModified,
    xtags: format.xtags,
    width: format.width,
    height: format.height,
    mimeType: format.mimeType,
    bitrate: format.bitrate,
    approxDurationMs: 0,
    language: format.language,
    isOriginal: format.isOriginal
  }
}

export function isAudioFormat(format: SabrFormatInfo): boolean {
  return format.mimeType.startsWith('audio/')
}
