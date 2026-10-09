// LiveKit's place on the fixture page: the fixtures' Vite config resolves the room controller's
// `import('./livekit-room.ts')` (useProjectRoom) to this module, so the real controller runs over a connection
// that reaches no server. It records what it is asked, in order, and can refuse a device or drop the call, as
// LiveKit would report them. What Sophia sends goes through the Studio's own listener (sophia-channel.ts), as bytes
// from her participant on the reply topic. Who else is in the room, what Sophia's participant says and the video
// feeds come from fake-people.ts. Under a grant the token names (`qualification=on`, A15), the Studio's own voice
// receipts (voice-qualification.ts) hear the microphone's publication and the voices' elements from here, as they
// would from LiveKit. Nothing else in the Studio is replaced.
import { RoomEvent, Track, type Room } from 'livekit-client'
import type { RoomQualification, RoomToken } from '@sophia/contracts'
import { CHAT_REPLY_TOPIC, encodeChatPacket, type ChatPacket } from '@sophia/contracts/room-chat'
import type { CallEnd } from '../src/features/voice/call-end.ts'
import type { RoomCallbacks, RoomConnection } from '../src/features/voice/livekit-room.ts'
import type { RoomParticipant } from '../src/features/voice/room-view.ts'
import { listenToSophia } from '../src/features/voice/sophia-channel.ts'
import { watchQualification } from '../src/features/voice/voice-qualification.ts'
import {
  allowSound,
  feeds,
  onPeopleChange,
  others,
  personId,
  setSophia,
  sophiaSignal,
  soundBlocked,
  viewerSpeaks,
} from './fake-people.ts'
import { TRACKS } from './data.ts'
import { VIEWER_NAME } from './demo.ts'

/** What the room's connection was asked, in order: `connect`, `microphone:on`, `text:off`, `leave`… */
export const asked: string[] = []

/** Leaving waits while held, as a real disconnect can (room-recap checks). */
export const leaving: { held: boolean; fails: boolean; waiting: (() => void)[] } = {
  held: false,
  fails: false,
  waiting: [],
}

/** `refuse=camera`: the browser refuses the camera, as a blocked permission does. */
const refused = new URLSearchParams(window.location.search).get('refuse')

let ended: RoomCallbacks['onEnded'] | null = null
/** The room events this call's Sophia listener waits on, by name. */
let listeners = new Map<string, ((...args: unknown[]) => void)[]>()
/** Sophia's participant as LiveKit shows it: the identity and the standing the API signs. */
const SOPHIA = { identity: 'sophia', metadata: JSON.stringify({ sophia: true }) }

function emit(event: RoomEvent, ...args: unknown[]): void {
  for (const fn of listeners.get(event) ?? []) fn(...args)
}

/** A packet from Sophia, as the bytes her bridge publishes on the reply topic. */
function fromSophia(packet: ChatPacket): void {
  emit(RoomEvent.DataReceived, encodeChatPacket(packet), SOPHIA, undefined, CHAT_REPLY_TOPIC)
}

/** The call ends without this person leaving: lost by default, as LiveKit reports a connection gone. */
export function dropCall(why: CallEnd = 'dropped'): void {
  ended?.(why)
}

/** The bridge tells this reader a result is ready, as its chat notice arrives (SMC-M03 S6). */
export function deliverNotice(packet: Parameters<NonNullable<RoomCallbacks['onNotice']>>[0]): void {
  fromSophia(packet)
}

/** A live caption of what is said aloud reaches this member, as the bridge sends one (CX-0023). */
export function deliverCaption(packet: Parameters<NonNullable<RoomCallbacks['onCaption']>>[0]): void {
  fromSophia(packet)
}

/** The voices' elements on the page (`voicesArrive`): the call's end removes them, as livekit-room.ts removes its own. */
const voices = new Set<HTMLAudioElement>()

/**
 * Sophia's voice and the first other person's reach this page, as LiveKit attaches a subscribed track (remoteAudio in
 * livekit-room.ts): an audio element each, marked whose it is as remoteAudio marks it. They carry no sound of their
 * own; a check gives them one.
 */
export function voicesArrive(): void {
  const member = { identity: personId(1), metadata: '{}' }
  for (const [mark, trackSid, who] of [
    ['sophia', TRACKS.sophia, SOPHIA],
    ['member', TRACKS.member, member],
  ] as const) {
    const el = document.createElement('audio')
    el.dataset.sophiaRoomAudio = mark
    document.body.append(el)
    voices.add(el)
    emit(RoomEvent.TrackSubscribed, { kind: Track.Kind.Audio, attachedElements: [el] }, { trackSid }, who)
  }
}

/** The viewer's microphone as LiveKit publishes it: its publication, and the MediaStreamTrack it carries. */
const MICROPHONE = {
  source: Track.Source.Microphone,
  trackSid: TRACKS.microphone,
  track: { mediaStreamTrack: { id: TRACKS.microphoneTrack } },
}

/**
 * The call's tracks as LiveKit keeps them: the microphone is published the first time it turns on (turned off, it is
 * muted, not unpublished); when the call ends, the others' tracks go first, their elements with them, then the
 * microphone is unpublished.
 */
function callTracks() {
  let published = false
  return {
    microphoneOn: () => {
      if (published) return
      published = true
      emit(RoomEvent.LocalTrackPublished, MICROPHONE)
    },
    end: () => {
      for (const el of voices) el.remove()
      voices.clear()
      if (published) emit(RoomEvent.LocalTrackUnpublished, MICROPHONE)
      published = false
    },
  }
}

/** Sophia's participant leaves the room, as when her bridge lost its link or restarted. */
export function sophiaLeaves(): void {
  setSophia(null)
  emit(RoomEvent.ParticipantDisconnected, SOPHIA)
}

const blocked = () => new DOMException('Permission denied', 'NotAllowedError')

/** The viewer as LiveKit lists the local participant, devices off until the call turns them on. */
const viewer = (): RoomParticipant => ({
  identity: '00000000-0000-4000-8000-0000000000a1',
  name: VIEWER_NAME,
  speaking: false,
  micOn: false,
  cameraOn: false,
  screenOn: false,
  local: true,
  standing: 'admin',
})

/** What the page said it follows, last (following-signal.ts sends only a change). */
let said: string | null = null

/** What the page says it follows, as the room's connection records it: only a change is sent. */
function sayFollowing(versionId: string | null): Promise<void> {
  if (versionId !== said) asked.push(`following:${versionId ?? ''}`)
  said = versionId
  return Promise.resolve()
}

/**
 * A new connection's room, as the Studio's own listeners hear it: Sophia's packets (sophia-channel.ts) and, under a
 * grant, the voice receipts (voice-qualification.ts). Its listeners replace the last connection's.
 */
function listenAnew(cb: RoomCallbacks, qualification: RoomQualification | undefined): void {
  listeners = new Map()
  const room = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
    },
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fake of the one method the listeners use
  const heard = room as unknown as Pick<Room, 'on'>
  listenToSophia(heard, cb)
  watchQualification(heard, qualification)
}

/** The token is the API's answer: no server is behind it, and only the grant it may name is read. */
export function connectRoom({ qualification }: RoomToken, cb: RoomCallbacks): Promise<RoomConnection> {
  asked.push('connect')
  said = null // a new connection has said nothing yet, as following-signal.ts starts each one
  const me = viewer()
  let textOnly = false
  let open = true
  listenAnew(cb, qualification)
  const tracks = callTracks()
  // Nothing more is heard from a room this connection left or lost, as LiveKit emits nothing after a disconnect.
  onPeopleChange(() => {
    if (open) cb.onChange()
  })
  ended = (why) => {
    if (!open) return
    open = false
    tracks.end()
    cb.onEnded(why)
  }
  const device =
    (name: 'microphone' | 'camera' | 'screen', key: 'micOn' | 'cameraOn' | 'screenOn') => (on: boolean) => {
      asked.push(`${name}:${on ? 'on' : 'off'}`)
      if (on && refused === name) return Promise.reject(blocked())
      me[key] = on
      if (name === 'microphone' && on) tracks.microphoneOn()
      cb.onChange()
      return Promise.resolve()
    }
  return Promise.resolve({
    sendChat: () => {
      asked.push('chat')
      return Promise.resolve()
    },
    setTextMode: (on) => {
      asked.push(`text:${on ? 'on' : 'off'}`)
      textOnly = on
    },
    textMode: () => textOnly,
    participants: () => [{ ...me, speaking: viewerSpeaks() }, ...others()],
    sophia: sophiaSignal,
    audioBlocked: soundBlocked,
    startAudio: () => {
      allowSound()
      return Promise.resolve()
    },
    feeds,
    setMicrophone: device('microphone', 'micOn'),
    setCamera: device('camera', 'cameraOn'),
    setScreenShare: device('screen', 'screenOn'),
    setFollowing: sayFollowing,
    leave: () => {
      asked.push('leave')
      open = false
      tracks.end()
      // A slow disconnect (`window.fixture.holdLeave`): it ends when released.
      if (leaving.fails) return Promise.reject(new Error('Disconnect failed'))
      return leaving.held ? new Promise<void>((resolve) => leaving.waiting.push(resolve)) : Promise.resolve()
    },
  })
}
