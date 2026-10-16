// «You're muted» when talking with the microphone off (docs/plans/muted-speech.md). The rule is the watch: loud samples
// for half a second, gaps under 200 ms bridged, then quiet for 20 seconds; it has no clock or microphone of its own, so
// it is unit-tested. The listening is the room's: while the microphone is off it opens its own stream on the chosen
// microphone, never sent, and lets it go when the microphone is on again or the call ends.
import { levelOf } from './device-check.ts'

/** Loud enough to be speech, on the meter's scale. */
const LOUD = 0.25
/** How long speech lasts before it is said. */
const SPAN_MS = 500
/** A gap this short is still the same stretch of speech. */
const GAP_MS = 200
/** Once said, quiet for this long. */
const QUIET_MS = 20_000

/** A watch over level samples: true for the sample that should say «You're muted». */
export function mutedSpeech(): (level: number, at: number) => boolean {
  let loudSince: number | null = null
  let lastLoud = Number.NEGATIVE_INFINITY
  let saidAt = Number.NEGATIVE_INFINITY
  return (level, at) => {
    if (level < LOUD) {
      if (at - lastLoud > GAP_MS) loudSince = null
      return false
    }
    if (loudSince === null || at - lastLoud > GAP_MS) loudSince = at
    lastLoud = at
    if (at - loudSince < SPAN_MS || at - saidAt < QUIET_MS) return false
    saidAt = at
    return true
  }
}

/**
 * When to listen (Codex P2s on #357): from any moment the microphone is off, a call that begins muted included; on the
 * microphone in use, so one switched while muted is listened to instead; never past the call's end. `listen` opens the
 * listening on a device and returns the way to let it go.
 */
export function mutedWatch(listen: (deviceId: string | undefined) => () => void) {
  let stop: (() => void) | null = null
  let device: string | undefined
  const end = () => {
    stop?.()
    stop = null
  }
  return {
    set(off: boolean, deviceId: string | undefined) {
      if (!off || deviceId !== device) end()
      if (off && !stop) {
        device = deviceId
        stop = listen(deviceId)
      }
    },
    end,
  }
}

/**
 * Listen on the microphone while it is off in the call, for speech only: a stream of its own, analysed here and never
 * sent. Returns the way to let it go.
 */
export function hearWhileMuted(deviceId: string | undefined, onSpeaking: () => void): () => void {
  let live = true
  let stop: (() => void) | null = null
  const watch = mutedSpeech()
  const audio = deviceId ? { deviceId: { ideal: deviceId } } : true
  navigator.mediaDevices.getUserMedia({ audio }).then(
    (stream) => {
      const tracks = stream.getTracks()
      if (!live) {
        for (const track of tracks) track.stop()
        return
      }
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        if (watch(levelOf(samples), performance.now())) onSpeaking()
      }, 100)
      stop = () => {
        clearInterval(timer)
        void context.close()
        for (const track of tracks) track.stop()
      }
    },
    // A microphone refused or gone: nothing to listen to, and nothing to say.
    () => undefined,
  )
  return () => {
    live = false
    stop?.()
  }
}
