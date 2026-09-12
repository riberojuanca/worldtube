/**
 * Reads a single ISO-BMFF "sidx" (Segment Index) box, per ISO/IEC 14496-12
 * §8.16.3 — this is the box YouTube points at with an adaptive format's
 * `indexRange` for MP4-based formats (avc1/mp4a).
 *
 * We don't need a general MP4 box walker here: `indexRange` already tells us
 * exactly which bytes of the init response are this one box (its own 8-byte
 * header included), so we just read the fields off a DataView in spec order.
 */

export interface Mp4SidxReference {
  startSeconds: number
  endSeconds: number
  /** Byte offset of this segment within the full remote file (not just this response). */
  startByte: number
  endByte: number
}

export function parseMp4Sidx(sidxBox: ArrayBuffer, sidxFileOffset: number): Mp4SidxReference[] {
  const view = new DataView(sidxBox)
  let pos = 0

  const boxSize = view.getUint32(pos)
  const boxType = readAscii(view, pos + 4, 4)
  pos += 8
  if (boxType !== 'sidx') {
    throw new Error(`parseMp4Sidx: expected a "sidx" box, got "${boxType}"`)
  }

  const version = view.getUint8(pos)
  pos += 4 // 1 byte version + 3 bytes flags (fullbox header)

  pos += 4 // reference_ID — irrelevant to us

  const timescale = view.getUint32(pos)
  pos += 4
  if (timescale === 0) {
    throw new Error('parseMp4Sidx: sidx box has a zero timescale')
  }

  let earliestPresentationTime: number
  let firstOffset: number
  if (version === 0) {
    earliestPresentationTime = view.getUint32(pos)
    firstOffset = view.getUint32(pos + 4)
    pos += 8
  } else {
    earliestPresentationTime = readUint64(view, pos)
    firstOffset = readUint64(view, pos + 8)
    pos += 16
  }

  pos += 2 // reserved
  const referenceCount = view.getUint16(pos)
  pos += 2

  const references: Mp4SidxReference[] = []
  let unscaledTime = earliestPresentationTime
  // First referenced segment starts right after this box (+ the spec's own padding field).
  let byteCursor = sidxFileOffset + boxSize + firstOffset

  for (let i = 0; i < referenceCount; i++) {
    const chunk = view.getUint32(pos)
    const referencesAnotherSidx = (chunk >>> 31) === 1
    const referenceSize = chunk & 0x7fffffff
    const subsegmentDuration = view.getUint32(pos + 4)
    pos += 12 // chunk (4) + duration (4) + SAP flags (4, unused)

    if (referencesAnotherSidx) {
      throw new Error('parseMp4Sidx: hierarchical sidx boxes are not supported')
    }

    references.push({
      startSeconds: unscaledTime / timescale,
      endSeconds: (unscaledTime + subsegmentDuration) / timescale,
      startByte: byteCursor,
      endByte: byteCursor + referenceSize - 1
    })

    unscaledTime += subsegmentDuration
    byteCursor += referenceSize
  }

  return references
}

function readAscii(view: DataView, offset: number, length: number): string {
  let s = ''
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i))
  return s
}

// JS numbers only carry 53 bits of integer precision, which is fine here —
// these are byte offsets into a single video's stream, nowhere near that limit.
function readUint64(view: DataView, offset: number): number {
  return view.getUint32(offset) * 2 ** 32 + view.getUint32(offset + 4)
}
