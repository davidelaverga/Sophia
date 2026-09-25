// Audio framing for the bridge (architecture 06 §4). Pure: sample arithmetic and bounded queues, no I/O.
// Input to Google is mono signed 16-bit PCM at 16 kHz in ~100 ms chunks (`audio/pcm;rate=16000`); a frame in any
// other format is refused, never relabelled. Output from Google is PCM at its declared rate (24 kHz mono on the
// initial route), split into 20 ms frames for the LiveKit AudioSource, with a bounded backlog.

export const INPUT_RATE = 16_000
export const INPUT_MIME = `audio/pcm;rate=${INPUT_RATE}`
/** Samples per chunk sent to Google: 100 ms at 16 kHz. */
export const INPUT_CHUNK = 1600
/** At most this many chunks wait for Google; older ones are dropped and counted as a gap, not pretended heard. */
export const INPUT_BACKLOG = 5

export const OUTPUT_RATE = 24_000
/** One output frame: 20 ms at 24 kHz. */
export const OUTPUT_FRAME = 480
/** At most 2 s of Sophia's speech waits for the room; beyond it the oldest frames are dropped and counted. */
export const OUTPUT_BACKLOG_FRAMES = 100

export class FormatError extends Error {}

/** Little-endian base64 of 16-bit samples, as Google's realtime input expects. */
export function pcmToBase64(samples: Int16Array): string {
  const bytes = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i += 1) bytes.writeInt16LE(samples[i] ?? 0, i * 2)
  return bytes.toString('base64')
}

export function base64ToPcm(data: string): Int16Array {
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length % 2 !== 0) throw new FormatError('PCM data has an odd byte length')
  const samples = new Int16Array(bytes.length / 2)
  for (let i = 0; i < samples.length; i += 1) samples[i] = bytes.readInt16LE(i * 2)
  return samples
}

/**
 * RMS level (about -50 dBFS) from which forwarded input counts as sound Google may answer. A noise-suppressed quiet
 * room sits well below it; even quiet speech sits well above it.
 */
export const AUDIBLE_RMS = 104

/** Did this chunk carry sound (words, or anything Google might answer) rather than near-silence? */
export function isAudible(samples: Int16Array): boolean {
  if (samples.length === 0) return false
  let sum = 0
  for (const s of samples) sum += s * s
  return Math.sqrt(sum / samples.length) >= AUDIBLE_RMS
}

/** The sample rate a `audio/pcm;rate=N` MIME type declares; anything else is not PCM we can play. */
export function pcmRate(mimeType: string | undefined): number {
  const match = /^audio\/pcm(?:;\s*rate=(\d+))?$/i.exec(mimeType ?? '')
  if (!match) throw new FormatError(`not raw PCM: ${mimeType ?? 'no MIME type'}`)
  return match[1] ? Number(match[1]) : OUTPUT_RATE
}

/** Groups the admitted holder's 16 kHz mono frames into chunks for Google, with a bounded backlog. */
export class InputChunker {
  private pending: number[] = []
  private readonly ready: Int16Array[] = []
  /** Samples dropped because Google could not keep up: a gap in what Sophia heard. */
  dropped = 0

  push(samples: Int16Array, sampleRate: number, channels: number): void {
    if (sampleRate !== INPUT_RATE || channels !== 1) {
      throw new FormatError(`input must be mono ${INPUT_RATE} Hz PCM, got ${channels} ch at ${sampleRate} Hz`)
    }
    for (const s of samples) this.pending.push(s)
    while (this.pending.length >= INPUT_CHUNK) {
      this.ready.push(Int16Array.from(this.pending.slice(0, INPUT_CHUNK)))
      this.pending = this.pending.slice(INPUT_CHUNK)
    }
    while (this.ready.length > INPUT_BACKLOG) this.dropped += this.ready.shift()?.length ?? 0
  }

  /** The next chunk to send, if one is complete. */
  take(): Int16Array | undefined {
    return this.ready.shift()
  }

  /** Discard everything (a handoff or pause): nothing of the old holder reaches Google afterwards. */
  clear(): void {
    this.pending = []
    this.ready.length = 0
  }
}

/** One output frame tagged with the playback generation it belongs to. */
export interface OutputFrame {
  generation: number
  samples: Int16Array
}

/** Splits Sophia's PCM into 20 ms frames; frames of an older generation are dropped when the generation moves. */
export class OutputFramer {
  private readonly queue: OutputFrame[] = []
  private carry: { generation: number; samples: number[] } = { generation: 0, samples: [] }
  /** Frames dropped for backpressure (never for a generation change, which is intended). */
  dropped = 0

  push(samples: Int16Array, generation: number): void {
    if (this.carry.generation !== generation) this.carry = { generation, samples: [] }
    for (const s of samples) this.carry.samples.push(s)
    while (this.carry.samples.length >= OUTPUT_FRAME) {
      this.queue.push({ generation, samples: Int16Array.from(this.carry.samples.slice(0, OUTPUT_FRAME)) })
      this.carry.samples = this.carry.samples.slice(OUTPUT_FRAME)
    }
    while (this.queue.length > OUTPUT_BACKLOG_FRAMES) {
      this.queue.shift()
      this.dropped += 1
    }
  }

  /** The next frame of `generation`; frames of any other generation are discarded on the way. */
  next(generation: number): Int16Array | undefined {
    while (this.queue.length > 0) {
      const frame = this.queue.shift()
      if (frame && frame.generation === generation) return frame.samples
    }
    return undefined
  }

  /** Stop Speaking or barge-in: nothing queued is played. */
  clear(): void {
    this.queue.length = 0
    this.carry = { generation: 0, samples: [] }
  }

  get queued(): number {
    return this.queue.length
  }
}
