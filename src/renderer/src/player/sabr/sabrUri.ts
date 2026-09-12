/**
 * The `sabr:` scheme URIs we hand shaka-player for segment requests. These
 * never leave the process — playerAdapter.ts's scheme handler turns each one
 * into a real SABR wire request — so the shape is entirely up to us; it just
 * needs to round-trip through the URL query params below.
 */

export type SabrTrackKind = 'audio' | 'video'

export function buildInitUri(kind: SabrTrackKind, key: string): string {
  return `sabr://${kind}?key=${encodeURIComponent(key)}&init`
}

export interface ParsedSabrUri {
  key: string
  isInit: boolean
  startTimeMs: number | null
}

export function parseSabrUri(uri: string): ParsedSabrUri {
  const url = new URL(uri)
  const startTimeMs = url.searchParams.get('startTimeMs')
  return {
    key: url.searchParams.get('key') ?? '',
    isInit: url.searchParams.has('init'),
    startTimeMs: startTimeMs !== null ? Number(startTimeMs) : null
  }
}
