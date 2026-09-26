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
/**
 * How much of Sophia's speech may wait for the room: three minutes. Google streams a reply faster than it plays, so
 * the whole of a long reply has to fit (CX-0045: a 2 s bound dropped the middle of every longer reply). Beyond it
 * the newest frames are refused and counted: a reply that long loses its end, never its middle. Stop Speaking and
 * barge-in still clear everything queued at once.
 */
export const OUTPUT_BACKLOG_FRAMES = 9000
const OUTPUT_FRAME_MS = 20
const OUTPUT_SAMPLES_PER_MS = OUTPUT_RATE / 1000

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
  private carry: { generation: number; samples: Int16Array } = { generation: 0, samples: new Int16Array(0) }
  /** Frames refused because the backlog was full (never for a generation change, which is intended). */
  dropped = 0

  push(samples: Int16Array, generation: number): void {
    if (this.carry.generation !== generation) this.carry = { generation, samples: new Int16Array(0) }
    const all = new Int16Array(this.carry.samples.length + samples.length)
    all.set(this.carry.samples)
    all.set(samples, this.carry.samples.length)
    let at = 0
    for (; at + OUTPUT_FRAME <= all.length; at += OUTPUT_FRAME) {
      if (this.queue.length < OUTPUT_BACKLOG_FRAMES)
        this.queue.push({ generation, samples: all.slice(at, at + OUTPUT_FRAME) })
      else this.dropped += 1
    }
    this.carry.samples = all.slice(at)
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
    this.carry = { generation: 0, samples: new Int16Array(0) }
  }

  get queued(): number {
    return this.queue.length
  }
}

/** Why a reply's audio ended: it all played, or it was cut (Stop Speaking, a pause, a handoff, barge-in, a reconnect). */
export type ReplyEnd = 'played' | 'stopped' | 'interrupted' | 'recovered'

interface ReplyTally {
  startedAt: number
  lastAt: number
  receivedSamples: number
  playedFrames: number
  droppedBefore: number
  maxQueued: number
  generated: boolean
}

/**
 * The continuity of one reply's audio, content-free (CX-0045): how much arrived and over how long, how much played,
 * how much was refused for backlog or cleared by a cut, and the deepest the queue got. Durations in ms.
 */
export class ReplyAudio {
  private reply: ReplyTally | null = null

  received(samples: number, queued: number, droppedTotal: number, now: number): void {
    this.reply ??= {
      startedAt: now,
      lastAt: now,
      receivedSamples: 0,
      playedFrames: 0,
      droppedBefore: droppedTotal,
      maxQueued: 0,
      generated: false,
    }
    this.reply.receivedSamples += samples
    this.reply.lastAt = now
    this.reply.maxQueued = Math.max(this.reply.maxQueued, queued)
  }

  played(): void {
    if (this.reply) this.reply.playedFrames += 1
  }

  /** Google finished the turn; what is queued still plays. */
  generated(): void {
    if (this.reply) this.reply.generated = true
  }

  get complete(): boolean {
    return this.reply?.generated ?? false
  }

  /** The reply's figures, once: null when no audio arrived since the last end. */
  end(how: ReplyEnd, queued: number, droppedTotal: number): Record<string, unknown> | null {
    const r = this.reply
    this.reply = null
    if (!r) return null
    return {
      ended: how,
      receivedMs: Math.round(r.receivedSamples / OUTPUT_SAMPLES_PER_MS),
      arrivalMs: r.lastAt - r.startedAt,
      playedMs: r.playedFrames * OUTPUT_FRAME_MS,
      droppedMs: (droppedTotal - r.droppedBefore) * OUTPUT_FRAME_MS,
      clearedMs: queued * OUTPUT_FRAME_MS,
      maxQueuedMs: r.maxQueued * OUTPUT_FRAME_MS,
    }
  }
}
