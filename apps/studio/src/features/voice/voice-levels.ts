// How loud each voice in the call is now (docs/plans/voice-amplitude.md): read in this browser from the audio it already
// receives, and nothing is sent anywhere. One AudioContext for the call, made on the first read (after Join's press), an
// analyser per microphone track on the device check's scale (levelOf), let go when its person leaves or the call ends.
// It never throws: what can't be read reads 0, and nothing moves.
import { RoomEvent, Track, type Participant, type RemoteParticipant, type Room } from 'livekit-client'
import { levelOf } from './device-check.ts'
import { isSophia } from './sophia-channel.ts'

/** One track's analyser: how loud it is now, and its end. */
export interface Tap {
  level: () => number
  stop: () => void
}

/** What taps tracks for one call: a tap per track; resumed when sound is allowed, closed with the call. */
export interface Tapper {
  tap: (track: MediaStreamTrack) => Tap
  resume: () => void
  close: () => void
}

/**
 * The browser's: an analyser per track on one AudioContext. Safari keeps a context made outside a press suspended, so
 * the next press or key wakes it as well as LiveKit allowing sound.
 */
export function analyserTapper(): Tapper {
  const context = new AudioContext()
  const wake = () => void context.resume().catch(() => undefined)
  window.addEventListener('pointerdown', wake, { once: true })
  window.addEventListener('keydown', wake, { once: true })
  return {
    tap: (track) => {
      const source = context.createMediaStreamSource(new MediaStream([track]))
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      return {
        level: () => {
          analyser.getByteTimeDomainData(samples)
          return levelOf(samples)
        },
        stop: () => source.disconnect(),
      }
    },
    resume: wake,
    close: () => {
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
      void context.close().catch(() => undefined)
    },
  }
}

type LevelRoom = Pick<Room, 'on' | 'localParticipant' | 'remoteParticipants'>

/** The levels of one call: each person's by identity, and Sophia's, 0…1. */
export interface VoiceLevels {
  voiceLevel: (identity: string) => number
  sophiaLevel: () => number
}

export function voiceLevels(room: LevelRoom, makeTapper: () => Tapper = analyserTapper): VoiceLevels {
  let tapper: Tapper | null = null
  let ended = false
  const taps = new Map<string, { track: MediaStreamTrack; tap: Tap }>()
  const drop = (identity: string) => {
    taps.get(identity)?.tap.stop()
    taps.delete(identity)
  }
  /** A tap on this track, kept while the track is the same; a new track is tapped anew. */
  const tapOf = (identity: string, track: MediaStreamTrack): Tap => {
    const held = taps.get(identity)
    if (held?.track === track) return held.tap
    drop(identity)
    tapper ??= makeTapper()
    const tap = tapper.tap(track)
    taps.set(identity, { track, tap })
    return tap
  }
  const read = (p: Participant | undefined): number => {
    const track = p?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
    if (ended || !p || !track) return 0
    try {
      return tapOf(p.identity, track).level()
    } catch {
      return 0
    }
  }
  room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => drop(p.identity))
  room.on(RoomEvent.AudioPlaybackStatusChanged, (playing: boolean) => {
    if (playing) tapper?.resume()
  })
  room.on(RoomEvent.Disconnected, () => {
    if (ended) return
    ended = true
    for (const identity of taps.keys()) drop(identity)
    tapper?.close()
    tapper = null
  })
  const person = (identity: string) =>
    identity === room.localParticipant.identity ? room.localParticipant : room.remoteParticipants.get(identity)
  return {
    voiceLevel: (identity) => {
      const p = person(identity)
      return p && !isSophia(p) ? read(p) : 0
    },
    sophiaLevel: () => {
      const her = room.remoteParticipants.get('sophia')
      return her && isSophia(her) ? read(her) : 0
    },
  }
}
