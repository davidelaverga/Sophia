// REHEARSAL (development only; never live evidence): a stand-in for Gemini Live that calls no Google model
// and needs no key, so the real room path (API, LiveKit, this bridge, the Studio's light) can be exercised
// locally. It reports ready, answers every ~4 s of held-floor audio and every notice with a short chime (so
// playback, Stop Speaking and barge-in are real), and makes no tool call. Like `runtime-host.mjs --rehearse`,
// anything it produces must be labelled rehearsal: it proves wiring, not Sophia hearing or understanding anyone.
import { OUTPUT_RATE, pcmToBase64 } from './audio.ts'
import type { ConnectLive } from './live-session.ts'

export const REHEARSAL_BANNER = 'REHEARSAL: no Google model is called; nothing here is live evidence'

/** Forwarded 100 ms chunks between answers: about four seconds of the holder's audio. */
const CHUNKS_PER_ANSWER = 40
const PART_MS = 100

/** A two-note chime, 24 kHz mono, in 100 ms parts. */
function chime(): string[] {
  const perPart = (OUTPUT_RATE * PART_MS) / 1000
  const notes = [660, 880]
  return notes.flatMap((hz) =>
    Array.from({ length: 4 }, (_part, part) => {
      const samples = Int16Array.from({ length: perPart }, (_sample, i) => {
        const t = (part * perPart + i) / OUTPUT_RATE
        return Math.round(5000 * Math.sin(2 * Math.PI * hz * t) * Math.exp(-2 * t))
      })
      return pcmToBase64(samples)
    }),
  )
}

export const connectRehearsal: ConnectLive = async (_options, events) => {
  await Promise.resolve()
  let closed = false
  let heard = 0
  let playing: ReturnType<typeof setInterval> | null = null
  const ready = setTimeout(() => events.setupComplete(), 200)
  const answer = () => {
    if (closed || playing) return
    const parts = chime()
    playing = setInterval(() => {
      const part = parts.shift()
      if (closed || !part) {
        if (playing) clearInterval(playing)
        playing = null
        if (!closed) events.turnComplete()
        return
      }
      events.audio(part, `audio/pcm;rate=${OUTPUT_RATE}`)
    }, PART_MS)
  }
  return {
    sendAudio: () => {
      heard += 1
      if (heard % CHUNKS_PER_ANSWER === 0) answer()
    },
    sendAudioStreamEnd: () => {
      heard = 0
    },
    sendFrame: () => undefined,
    sendToolResponses: () => undefined,
    sendNotice: answer,
    close: () => {
      closed = true
      clearTimeout(ready)
      if (playing) clearInterval(playing)
    },
  }
}
