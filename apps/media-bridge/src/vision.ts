// Selected visual input (architecture 06 §9): at most one frame per second from the ONE source a person chose
// to show, the latest frame only (a stale frame is dropped, never queued behind audio), each tagged with its
// capture time and observation epoch. A frame whose epoch has moved on (Stop Looking, a new selection) is
// never sent. Frames are downscaled and JPEG-encoded here; no other camera or screen is read at all.
import jpeg from 'jpeg-js'

/** At most one frame per this interval. */
export const FRAME_INTERVAL_MS = 1000
/** Frames are downscaled to at most this width (the model gets a still, not a stream). */
export const MAX_FRAME_WIDTH = 1024
const JPEG_QUALITY = 70

export interface RgbaFrame {
  rgba: Uint8Array
  width: number
  height: number
}

export interface TaggedFrame extends RgbaFrame {
  capturedAt: number
  observationEpoch: number
}

/** Latest-only, rate-limited sampling of the selected source. */
export class FrameSampler {
  private latest: TaggedFrame | null = null
  private lastSent = 0

  offer(frame: TaggedFrame): void {
    this.latest = frame
  }

  /** The frame to send now, if one is due and still of the current epoch; everything older is dropped. */
  take(now: number, currentEpoch: number): TaggedFrame | null {
    const frame = this.latest
    if (!frame || now - this.lastSent < FRAME_INTERVAL_MS) return null
    this.latest = null
    if (frame.observationEpoch !== currentEpoch) return null
    this.lastSent = now
    return frame
  }

  /** Stop Looking or a new selection: nothing already sampled is sent. */
  clear(): void {
    this.latest = null
  }
}

/** Nearest-neighbour downscale of RGBA to at most `maxWidth` wide (aspect kept). */
export function downscale(frame: RgbaFrame, maxWidth = MAX_FRAME_WIDTH): RgbaFrame {
  if (frame.width <= maxWidth) return frame
  const width = maxWidth
  const height = Math.max(1, Math.round((frame.height * maxWidth) / frame.width))
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(frame.height - 1, Math.floor((y * frame.height) / height))
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(frame.width - 1, Math.floor((x * frame.width) / width))
      out.set(frame.rgba.subarray((sy * frame.width + sx) * 4, (sy * frame.width + sx) * 4 + 4), (y * width + x) * 4)
    }
  }
  return { rgba: out, width, height }
}

export function toJpeg(frame: RgbaFrame): Buffer {
  const small = downscale(frame)
  return jpeg.encode({ data: small.rgba, width: small.width, height: small.height }, JPEG_QUALITY).data
}
