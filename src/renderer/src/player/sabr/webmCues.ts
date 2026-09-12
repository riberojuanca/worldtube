/**
 * Reads just enough of a WebM/Matroska container (an EBML document, see
 * https://www.rfc-editor.org/rfc/rfc8794) to turn YouTube's `indexRange`
 * (the "Cues" element) into a list of playable time/byte segments, for
 * webm/opus and webm/vp9 adaptive formats. MP4-based formats use
 * mp4Sidx.ts instead.
 *
 * Rather than a general-purpose EBML tree reader, this only walks the one
 * path we actually need: EBML header → Segment → Info (for timescale +
 * duration) out of the init response, and Segment → Cues → CuePoint →
 * CueTrackPositions → CueClusterPosition out of the index response.
 */

const IDS = {
  EBML: 0x1a45dfa3,
  SEGMENT: 0x18538067,
  INFO: 0x1549a966,
  TIMECODE_SCALE: 0x2ad7b1,
  DURATION: 0x4489,
  CUES: 0x1c53bb6b,
  CUE_POINT: 0xbb,
  CUE_TIME: 0xb3,
  CUE_TRACK_POSITIONS: 0xb7,
  CUE_CLUSTER_POSITION: 0xf1
}

interface EbmlElement {
  id: number
  /** Absolute offset, within the buffer passed to readElements, of this element's payload. */
  contentStart: number
  contentEnd: number
}

/** Reads the sibling elements found between [start, end) of a buffer — does not recurse. */
function* readElements(view: DataView, start: number, end: number): Generator<EbmlElement> {
  let pos = start
  while (pos < end) {
    const id = readVint(view, pos, /* keepMarker */ true)
    const size = readVint(view, id.nextPos, /* keepMarker */ false)
    const contentStart = size.nextPos
    const contentEnd = contentStart + size.value
    yield { id: id.value, contentStart, contentEnd }
    pos = contentEnd
  }
}

function findChild(view: DataView, start: number, end: number, id: number): EbmlElement | undefined {
  for (const el of readElements(view, start, end)) {
    if (el.id === id) return el
  }
  return undefined
}

function readVint(view: DataView, offset: number, keepMarker: boolean): { value: number; nextPos: number } {
  const firstByte = view.getUint8(offset)
  if (firstByte === 0) throw new Error('webmCues: invalid EBML vint (leading byte is 0)')

  // Length in bytes = position of the highest set bit, counting from the MSB (1-indexed).
  let length = 1
  let mask = 0x80
  while ((firstByte & mask) === 0) {
    length++
    mask >>= 1
  }

  let value = keepMarker ? firstByte : firstByte & (mask - 1)
  for (let i = 1; i < length; i++) {
    value = value * 256 + view.getUint8(offset + i)
  }

  return { value, nextPos: offset + length }
}

function readUint(view: DataView, el: EbmlElement): number {
  let value = 0
  for (let i = el.contentStart; i < el.contentEnd; i++) {
    value = value * 256 + view.getUint8(i)
  }
  return value
}

function readFloat(view: DataView, el: EbmlElement): number {
  const length = el.contentEnd - el.contentStart
  if (length === 4) return view.getFloat32(el.contentStart)
  if (length === 8) return view.getFloat64(el.contentStart)
  throw new Error(`webmCues: unexpected Float element width ${length}`)
}

export interface WebmTimingInfo {
  /** Where the Segment element's payload starts — CueClusterPosition values are relative to this. */
  segmentPayloadOffset: number
  /** Seconds per raw timecode unit. */
  timecodeScale: number
  durationSeconds: number
}

/** Parses just the EBML header + Segment→Info path out of a WebM init response. */
export function parseWebmTimingInfo(initData: ArrayBuffer): WebmTimingInfo {
  const view = new DataView(initData)

  const ebml = findChild(view, 0, initData.byteLength, IDS.EBML)
  if (!ebml) throw new Error('parseWebmTimingInfo: missing EBML header element')

  const segment = findChild(view, ebml.contentEnd, initData.byteLength, IDS.SEGMENT)
  if (!segment) throw new Error('parseWebmTimingInfo: missing Segment element')

  const info = findChild(view, segment.contentStart, segment.contentEnd, IDS.INFO)
  if (!info) throw new Error('parseWebmTimingInfo: missing Info element (truncated init response?)')

  const timecodeScaleEl = findChild(view, info.contentStart, info.contentEnd, IDS.TIMECODE_SCALE)
  const durationEl = findChild(view, info.contentStart, info.contentEnd, IDS.DURATION)
  if (!durationEl) throw new Error('parseWebmTimingInfo: Info element has no Duration')

  const timecodeScaleNanoseconds = timecodeScaleEl ? readUint(view, timecodeScaleEl) : 1_000_000
  const timecodeScale = timecodeScaleNanoseconds / 1_000_000_000

  return {
    segmentPayloadOffset: segment.contentStart,
    timecodeScale,
    durationSeconds: readFloat(view, durationEl) * timecodeScale
  }
}

export interface WebmCueReference {
  startSeconds: number
  endSeconds: number
  startByte: number
  /** Open-ended (fetch to end of resource) only for the very last cue point. */
  endByte: number | null
}

/** Parses a WebM "Cues" (indexRange) response into segment references. */
export function parseWebmCues(cuesData: ArrayBuffer, timing: WebmTimingInfo): WebmCueReference[] {
  const view = new DataView(cuesData)

  const cues = findChild(view, 0, cuesData.byteLength, IDS.CUES)
  if (!cues) throw new Error('parseWebmCues: expected a Cues element')

  const points: { timeSeconds: number; byte: number }[] = []
  for (const cuePoint of readElements(view, cues.contentStart, cues.contentEnd)) {
    if (cuePoint.id !== IDS.CUE_POINT) continue

    const cueTime = findChild(view, cuePoint.contentStart, cuePoint.contentEnd, IDS.CUE_TIME)
    const trackPositions = findChild(view, cuePoint.contentStart, cuePoint.contentEnd, IDS.CUE_TRACK_POSITIONS)
    if (!cueTime || !trackPositions) continue

    const clusterPosition = findChild(view, trackPositions.contentStart, trackPositions.contentEnd, IDS.CUE_CLUSTER_POSITION)
    if (!clusterPosition) continue

    points.push({
      timeSeconds: readUint(view, cueTime) * timing.timecodeScale,
      byte: timing.segmentPayloadOffset + readUint(view, clusterPosition)
    })
  }

  const references: WebmCueReference[] = []
  for (let i = 0; i < points.length; i++) {
    const isLast = i === points.length - 1
    references.push({
      startSeconds: points[i].timeSeconds,
      endSeconds: isLast ? timing.durationSeconds : points[i + 1].timeSeconds,
      startByte: points[i].byte,
      endByte: isLast ? null : points[i + 1].byte - 1
    })
  }

  return references
}
