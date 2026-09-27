// The LiveKit side of the bridge (architecture 06 §1, §4, §9; source ids LK-01–LK-03): raw RTC through
// `@livekit/rtc-node` 1.1.0, joined as the `sophia` identity with a token the API issued for one room.
//
// Sophia receives only the permitted tracks: members' microphones (never a guest's, never screen audio), and a
// camera or screen only while a member has chosen to show it (the looked-at target). Microphone audio arrives
// as 16 kHz mono PCM from the SDK's own resampler. Sophia publishes exactly one audio track, 24 kHz mono through
// `AudioSource(24000, 1, 200)`. Participant attributes carry what the bridge observes (input, output, voice),
// never content: they reach everyone in the room.
import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
  VideoBufferType,
  VideoStream,
} from '@livekit/rtc-node'
import { INPUT_RATE, OUTPUT_RATE } from './audio.ts'
import { FRAME_INTERVAL_MS, type RgbaFrame } from './vision.ts'

export type Standing = 'admin' | 'editor' | 'viewer' | 'guest' | 'unknown'
export type VisualSource = 'screen' | 'camera'

export interface RoomPerson {
  identity: string
  standing: Standing
}

export interface LookTarget {
  participantIdentity: string
  source: VisualSource
}

export interface RoomEvents {
  /** Anyone joined, left or changed standing: the full list of people (Sophia excluded). */
  people: (people: RoomPerson[]) => void
  audio: (identity: string, samples: Int16Array, sampleRate: number, channels: number) => void
  frame: (identity: string, source: VisualSource, frame: RgbaFrame, capturedAt: number) => void
  connection: (state: 'connected' | 'reconnecting' | 'disconnected', reason: string | null) => void
}

/** What the room session needs from a room; tests supply a labelled fake. */
export interface RoomLink {
  people: () => RoomPerson[]
  /** Queue one 20 ms frame of Sophia's speech; resolves when the source accepts it (backpressure). */
  play: (samples: Int16Array) => Promise<void>
  /** Stop Speaking or barge-in: drop what the source still holds. */
  clearPlayback: () => void
  /** Subscribe to this camera or screen only (null: none). */
  watch: (target: LookTarget | null) => void
  setState: (attributes: Record<string, string>) => Promise<void>
  close: () => Promise<void>
}

export type JoinRoom = (access: { serverUrl: string; token: string }, events: RoomEvents) => Promise<RoomLink>

export const SOPHIA_IDENTITY = 'sophia'
/** The AudioSource's queue: Sophia's selected target, not an upstream guarantee (architecture 06 §4). */
const OUTPUT_QUEUE_MS = 200

/** A participant's standing from the metadata the API signed into their token; nothing else is trusted. */
export function standingOf(metadata: string | undefined): Standing {
  try {
    const value: unknown = JSON.parse(metadata ?? 'null')
    if (typeof value !== 'object' || value === null) return 'unknown'
    if ('guest' in value && value.guest === true) return 'guest'
    const role = 'role' in value ? value.role : undefined
    return role === 'admin' || role === 'editor' || role === 'viewer' ? role : 'unknown'
  } catch {
    return 'unknown'
  }
}

const isMember = (standing: Standing) => standing === 'admin' || standing === 'editor' || standing === 'viewer'

function visualSource(source: TrackSource | undefined): VisualSource | null {
  if (source === TrackSource.SOURCE_SCREENSHARE) return 'screen'
  if (source === TrackSource.SOURCE_CAMERA) return 'camera'
  return null
}

/** Should the bridge receive this publication at all? */
function permitted(pub: RemoteTrackPublication, who: RemoteParticipant, target: LookTarget | null): boolean {
  if (pub.source === TrackSource.SOURCE_MICROPHONE) return isMember(standingOf(who.metadata))
  const visual = visualSource(pub.source)
  return visual !== null && target !== null && target.participantIdentity === who.identity && target.source === visual
}

/** A reader's stop flag: leaving the loop releases the stream (a locked stream cannot be cancelled directly). */
interface Reader {
  stopped: boolean
}

async function readAudio(stream: AudioStream, identity: string, events: RoomEvents, reader: Reader): Promise<void> {
  for await (const frame of stream) {
    if (reader.stopped) break
    events.audio(identity, frame.data, frame.sampleRate, frame.channels)
  }
}

async function readVideo(stream: VideoStream, who: LookTarget, events: RoomEvents, reader: Reader): Promise<void> {
  let last = 0
  for await (const event of stream) {
    if (reader.stopped) break
    const now = Date.now()
    if (now - last < FRAME_INTERVAL_MS) continue
    last = now
    const rgba = event.frame.convert(VideoBufferType.RGBA)
    events.frame(who.participantIdentity, who.source, { rgba: rgba.data, width: rgba.width, height: rgba.height }, now)
  }
}

class LiveKitRoom implements RoomLink {
  private readonly room = new Room()
  private readonly source = new AudioSource(OUTPUT_RATE, 1, OUTPUT_QUEUE_MS)
  private readonly events: RoomEvents
  private target: LookTarget | null = null
  private readonly readers = new Map<string, Reader>()

  constructor(events: RoomEvents) {
    this.events = events
  }

  async join(access: { serverUrl: string; token: string }): Promise<void> {
    this.listen()
    await this.room.connect(access.serverUrl, access.token, { autoSubscribe: false, dynacast: false })
    const local = this.room.localParticipant
    if (!local) throw new Error('joined without a local participant')
    const track = LocalAudioTrack.createAudioTrack('sophia', this.source)
    await local.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }))
    this.resubscribe()
    this.events.people(this.people())
  }

  private listen(): void {
    const changed = () => {
      this.resubscribe()
      this.events.people(this.people())
    }
    this.room.on(RoomEvent.ParticipantConnected, changed)
    this.room.on(RoomEvent.ParticipantDisconnected, changed)
    this.room.on(RoomEvent.ParticipantMetadataChanged, changed)
    this.room.on(RoomEvent.TrackPublished, () => this.resubscribe())
    this.room.on(RoomEvent.TrackSubscribed, (track, pub, who) => this.subscribed(track, pub, who))
    this.room.on(RoomEvent.TrackUnsubscribed, (_track, pub) => this.stopStream(pub.sid))
    this.room.on(RoomEvent.Reconnecting, () => this.events.connection('reconnecting', null))
    this.room.on(RoomEvent.Reconnected, () => this.events.connection('connected', null))
    this.room.on(RoomEvent.Disconnected, (reason) =>
      this.events.connection('disconnected', `livekit: ${String(reason)}`),
    )
  }

  people(): RoomPerson[] {
    return [...this.room.remoteParticipants.values()]
      .filter((p) => p.identity !== SOPHIA_IDENTITY)
      .map((p) => ({ identity: p.identity, standing: standingOf(p.metadata) }))
  }

  /** Subscribe to what is permitted now and drop everything else. */
  private resubscribe(): void {
    for (const who of this.room.remoteParticipants.values()) {
      for (const pub of who.trackPublications.values()) {
        const want = permitted(pub, who, this.target)
        if (want !== pub.subscribed) pub.setSubscribed(want)
        if (!want) this.stopStream(pub.sid)
      }
    }
  }

  private subscribed(track: RemoteTrack, pub: RemoteTrackPublication, who: RemoteParticipant): void {
    const sid = pub.sid
    if (!sid) return
    // A subscription that was pending when the target moved on: refuse it now.
    if (!permitted(pub, who, this.target)) return pub.setSubscribed(false)
    this.stopStream(sid)
    const reader: Reader = { stopped: false }
    this.readers.set(sid, reader)
    const visual = visualSource(pub.source)
    const done = () => {
      if (this.readers.get(sid) === reader) this.readers.delete(sid)
    }
    if (track.kind === TrackKind.KIND_AUDIO) {
      readAudio(new AudioStream(track, INPUT_RATE, 1), who.identity, this.events, reader).then(done, done)
    } else if (visual) {
      const target = { participantIdentity: who.identity, source: visual }
      readVideo(new VideoStream(track), target, this.events, reader).then(done, done)
    }
  }

  private stopStream(sid: string | undefined): void {
    const reader = sid ? this.readers.get(sid) : undefined
    if (!sid || !reader) return
    reader.stopped = true
    this.readers.delete(sid)
  }

  async play(samples: Int16Array): Promise<void> {
    await this.source.captureFrame(new AudioFrame(samples, OUTPUT_RATE, 1, samples.length))
  }

  clearPlayback(): void {
    this.source.clearQueue()
  }

  watch(target: LookTarget | null): void {
    this.target = target
    this.resubscribe()
  }

  async setState(attributes: Record<string, string>): Promise<void> {
    await this.room.localParticipant?.setAttributes(attributes)
  }

  async close(): Promise<void> {
    for (const sid of this.readers.keys()) this.stopStream(sid)
    await this.room.disconnect()
    await this.source.close()
  }
}

export const joinLiveKitRoom: JoinRoom = async (access, events) => {
  const room = new LiveKitRoom(events)
  try {
    await room.join(access)
  } catch (err: unknown) {
    await room.close().catch(() => undefined)
    throw err
  }
  return room
}
