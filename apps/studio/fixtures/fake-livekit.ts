// LiveKit's place on the fixture page: the fixtures' Vite config resolves the room controller's
// `import('./livekit-room.ts')` (useProjectRoom) to this module, so the real controller runs over a connection
// that reaches no server. It records what it is asked, in order, and can refuse a device or drop the call, as
// LiveKit would report them. What Sophia sends goes through the Studio's own listener (sophia-channel.ts), as bytes
// from her participant on the reply topic. Who else is in the room, what Sophia's participant says and the video
// feeds come from fake-people.ts. Nothing else in the Studio is replaced.
import { RoomEvent, type Room } from 'livekit-client'
import { CHAT_REPLY_TOPIC, encodeChatPacket, type ChatPacket } from '@sophia/contracts/room-chat'
import type { CallEnd } from '../src/features/voice/call-end.ts'
import type { RoomCallbacks, RoomConnection } from '../src/features/voice/livekit-room.ts'
import type { RoomParticipant } from '../src/features/voice/room-view.ts'
import { listenToSophia } from '../src/features/voice/sophia-channel.ts'
import {
  allowSound,
  feeds,
  onPeopleChange,
  others,
  setSophia,
  sophiaSignal,
  soundBlocked,
  viewerSpeaks,
} from './fake-people.ts'

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

/** Sophia's participant leaves the room, as when her bridge lost its link or restarted. */
export function sophiaLeaves(): void {
  setSophia(null)
  emit(RoomEvent.ParticipantDisconnected, SOPHIA)
}

const blocked = () => new DOMException('Permission denied', 'NotAllowedError')

/** The viewer as LiveKit lists the local participant, devices off until the call turns them on. */
const viewer = (): RoomParticipant => ({
  identity: '00000000-0000-4000-8000-0000000000a1',
  name: 'Fixture viewer',
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

export function connectRoom(_serverUrl: string, _token: string, cb: RoomCallbacks): Promise<RoomConnection> {
  asked.push('connect')
  said = null // a new connection has said nothing yet, as following-signal.ts starts each one
  const me = viewer()
  let textOnly = false
  let open = true
  listeners = new Map()
  const room = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
    },
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fake of the one method the listener uses
  listenToSophia(room as unknown as Pick<Room, 'on'>, cb)
  // Nothing more is heard from a room this connection left or lost, as LiveKit emits nothing after a disconnect.
  onPeopleChange(() => {
    if (open) cb.onChange()
  })
  ended = (why) => {
    if (!open) return
    open = false
    cb.onEnded(why)
  }
  const device =
    (name: 'microphone' | 'camera' | 'screen', key: 'micOn' | 'cameraOn' | 'screenOn') => (on: boolean) => {
      asked.push(`${name}:${on ? 'on' : 'off'}`)
      if (on && refused === name) return Promise.reject(blocked())
      me[key] = on
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
      // A slow disconnect (`window.fixture.holdLeave`): it ends when released.
      if (leaving.fails) return Promise.reject(new Error('Disconnect failed'))
      return leaving.held ? new Promise<void>((resolve) => leaving.waiting.push(resolve)) : Promise.resolve()
    },
  })
}
