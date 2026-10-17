// LiveKit's place on the fixture page: the fixtures' Vite config resolves the room controller's
// `import('./livekit-room.ts')` (useProjectRoom) to this module, so the real controller runs over a connection
// that reaches no server. It records what it is asked, in order, and can refuse a device or drop the call, as
// LiveKit would report them. What Sophia sends goes through the Studio's own listener (sophia-channel.ts), as bytes
// from her participant on the reply topic. Who else is in the room, what Sophia's participant says and the video
// feeds come from fake-people.ts. Nothing else in the Studio is replaced.
import { RoomEvent, type Room } from 'livekit-client'
import { CHAT_REPLY_TOPIC, encodeChatPacket, type ChatPacket } from '@sophia/contracts/room-chat'
import type { CallEnd } from '../src/features/voice/call-end.ts'
import { chosenBackground, type BackgroundId } from '../src/features/voice/background-preference.ts'
import { chosenDevices, type DeviceKind, type MediaDevice } from '../src/features/voice/device-preference.ts'
import type { RoomCallbacks, RoomConnection } from '../src/features/voice/livekit-room.ts'
import type { RoomParticipant } from '../src/features/voice/room-view.ts'
import { listenToReactions } from '../src/features/voice/reaction-channel.ts'
import { REACTION_TOPIC } from '../src/features/voice/reactions.ts'
import { listenToSophia } from '../src/features/voice/sophia-channel.ts'
import {
  allowSound,
  feeds,
  ownFeed,
  onPeopleChange,
  others,
  setSophia,
  sophiaSignal,
  soundBlocked,
  viewerSpeaks,
} from './fake-people.ts'
import { VIEWER_NAME } from './demo.ts'

/** What the room's connection was asked, in order: `connect`, `microphone:on`, `text:off`, `leave`… */
export const asked: string[] = []

/** Leaving waits while held, as a real disconnect can (room-recap checks). */
export const leaving: { held: boolean; fails: boolean; waiting: (() => void)[] } = {
  held: false,
  fails: false,
  waiting: [],
}

/** Turning the microphone on waits while held, as a browser still asking for it does (push-to-talk checks). */
export const enabling: { held: boolean; waiting: (() => void)[] } = { held: false, waiting: [] }

/**
 * A microphone on its way while held arrives when released (`window.fixture.holdMicrophone`), whatever came meanwhile:
 * LiveKit still publishes a late enable after a turn-off stopped waiting for it.
 */
const arrival = (apply: () => void) =>
  new Promise<void>((resolve) =>
    enabling.waiting.push(() => {
      apply()
      resolve()
    }),
  )

/** `refuse=camera`: the browser refuses the camera, as a blocked permission does; `refuse=switch`, a device switch. */
const refused = new URLSearchParams(window.location.search).get('refuse')
/** `backgrounds=unsupported`: the device can't draw a camera background (call-backgrounds.md). */
const noBackgrounds = new URLSearchParams(window.location.search).get('backgrounds') === 'unsupported'

/** Whether the device can draw a camera background, as livekit-room.ts asks. */
export const backgroundsSupported = (): boolean => !noBackgrounds

/** `devices=blocked`: the browser refuses access, so no device can be listed (call-devices.md). */
const devicesBlocked = new URLSearchParams(window.location.search).get('devices') === 'blocked'

/** Two of each kind, the browser's default first where it has one, as Chrome lists them. */
const DEVICES: Record<DeviceKind, MediaDevice[]> = {
  audioinput: [
    { id: 'default', label: 'Default — MacBook Microphone' },
    { id: 'usb-mic', label: 'USB headset' },
  ],
  audiooutput: [
    { id: 'default', label: 'Default — MacBook Speakers' },
    { id: 'usb-out', label: 'USB headset' },
  ],
  videoinput: [
    { id: 'cam-built-in', label: 'FaceTime HD Camera' },
    { id: 'cam-desk', label: 'Desk camera' },
  ],
}

/** The devices of a kind, as LiveKit lists them; refused, as a blocked permission rejects. */
export function listDevices(kind: DeviceKind): Promise<MediaDevice[]> {
  return devicesBlocked ? Promise.reject(blocked()) : Promise.resolve(DEVICES[kind])
}

/** A device switch, as the connection records it; `refuse=switch` refuses it, as a device in use does. */
function switchDevice(kind: DeviceKind, id: string): Promise<void> {
  asked.push(`device:${kind}:${id}`)
  return refused === 'switch' ? Promise.reject(blocked()) : Promise.resolve()
}

/** A typed line to Sophia, as the connection records it. */
function sendChat(): Promise<void> {
  asked.push('chat')
  return Promise.resolve()
}

/** A camera background, as the connection records it; `refuse=background` refuses it, as a device without WebGL. */
function setBackground(id: BackgroundId): Promise<void> {
  asked.push(`background:${id}`)
  return refused === 'background' ? Promise.reject(new Error('No WebGL')) : Promise.resolve()
}

/** The devices the last call opened with, as LiveKit was given them (`window.fixture.devicesOnJoin`). */
export const joined: { devices: Partial<Record<DeviceKind, string>> | null; background: BackgroundId | null } = {
  devices: null,
  background: null,
}

/** The open connection's callbacks, for what the page makes LiveKit say to the call (`linkLost`). */
let callbacks: RoomCallbacks | null = null

/** A connection made: recorded, with the devices it opens with (roomOptions in livekit-room.ts reads the same). */
function connected(cb: RoomCallbacks): void {
  asked.push('connect')
  joined.devices = chosenDevices()
  joined.background = chosenBackground()
  callbacks = cb
}

/** The call's link is lost for a while, or back, as LiveKit's Reconnecting and Reconnected events say it. */
export function linkLost(lost: boolean): void {
  callbacks?.onStatus(lost ? 'reconnecting' : 'live')
}

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

/**
 * Someone in the room reacts (`window.fixture.reactFrom`): the bytes their browser would publish on the reaction topic,
 * whatever emoji the check gives, so the Studio's own listener decides what shows (reaction-channel.ts).
 */
export function reactFrom(name: string, emoji: string): void {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: 'reaction', emoji }))
  emit(RoomEvent.DataReceived, bytes, { identity: `person-${name}`, name, metadata: '{}' }, undefined, REACTION_TOPIC)
}

/** A reaction sent, as the connection records it. */
function sendReaction(emoji: string): Promise<void> {
  asked.push(`reaction:${emoji}`)
  return Promise.resolve()
}

/** Sophia's participant leaves the room, as when her bridge lost its link or restarted. */
/** Speech heard on this person's muted microphone (muted-speech.md): the room says it, while the microphone is off. */
let mutedSpeech: () => void = () => undefined
export function speakWhileMuted(): void {
  mutedSpeech()
}

export function sophiaLeaves(): void {
  setSophia(null)
  emit(RoomEvent.ParticipantDisconnected, SOPHIA)
}

const blocked = () => new DOMException('Permission denied', 'NotAllowedError')

/** The standing the API signed into this viewer's token: a member's, unless the page says (the guest's, join.tsx). */
let signed: RoomParticipant['standing'] = 'admin'

/** The viewer's token is signed with this standing from the next connection on, as the API signs a guest's. */
export function signViewerAs(standing: RoomParticipant['standing']): void {
  signed = standing
}

/** The viewer as LiveKit lists the local participant, devices off until the call turns them on. */
const viewer = (): RoomParticipant => ({
  identity: '00000000-0000-4000-8000-0000000000a1',
  name: VIEWER_NAME,
  speaking: false,
  micOn: false,
  cameraOn: false,
  screenOn: false,
  local: true,
  standing: signed,
})

/** What the page said it follows, last (following-signal.ts sends only a change). */
let said: string | null = null

/** What the page says it follows, as the room's connection records it: only a change is sent. */
function sayFollowing(versionId: string | null): Promise<void> {
  if (versionId !== said) asked.push(`following:${versionId ?? ''}`)
  said = versionId
  return Promise.resolve()
}

/** LiveKit's room as far as the listeners use it: `on` keeps what they listen for, for the page to emit. */
function fakeRoom(): Pick<Room, 'on'> {
  listeners = new Map()
  const room = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
    },
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fake of the one method the listeners use
  return room as unknown as Pick<Room, 'on'>
}

/**
 * The viewer's devices, switched as LiveKit does: what is asked is recorded, a refused one rejects, and a microphone
 * held on its way (`window.fixture.holdMicrophone`) arrives when released.
 */
function deviceSwitch(me: RoomParticipant, changed: () => void) {
  return (name: 'microphone' | 'camera' | 'screen', key: 'micOn' | 'cameraOn' | 'screenOn') => (on: boolean) => {
    asked.push(`${name}:${on ? 'on' : 'off'}`)
    if (on && refused === name) return Promise.reject(blocked())
    const apply = () => {
      me[key] = on
      changed()
    }
    if (on && name === 'microphone' && enabling.held) return arrival(apply)
    apply()
    return Promise.resolve()
  }
}

export function connectRoom(_serverUrl: string, _token: string, cb: RoomCallbacks): Promise<RoomConnection> {
  connected(cb)
  said = null // a new connection has said nothing yet, as following-signal.ts starts each one
  const me = viewer()
  let textOnly = false
  let open = true
  const room = fakeRoom()
  listenToSophia(room, cb)
  listenToReactions(room, (heard) => cb.onReaction?.(heard))
  // Nothing more is heard from a room this connection left or lost, as LiveKit emits nothing after a disconnect.
  onPeopleChange(() => {
    if (open) cb.onChange()
  })
  mutedSpeech = () => {
    if (open && !me.micOn) cb.onSpeakingMuted?.()
  }
  ended = (why) => {
    if (!open) return
    open = false
    cb.onEnded(why)
  }
  const device = deviceSwitch(me, () => cb.onChange())
  return Promise.resolve({
    sendChat,
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
    feeds: () => (me.cameraOn ? [ownFeed(me.identity), ...feeds()] : feeds()),
    setMicrophone: device('microphone', 'micOn'),
    setCamera: device('camera', 'cameraOn'),
    setScreenShare: device('screen', 'screenOn'),
    switchDevice,
    setBackground,
    sendReaction,
    setFollowing: sayFollowing,
    setVolume: (identity, level) => {
      asked.push(`volume:${identity}:${String(level)}`)
    },
    leave: () => {
      asked.push('leave')
      open = false
      // A slow disconnect (`window.fixture.holdLeave`): it ends when released.
      if (leaving.fails) return Promise.reject(new Error('Disconnect failed'))
      return leaving.held ? new Promise<void>((resolve) => leaving.waiting.push(resolve)) : Promise.resolve()
    },
  })
}
