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
  personId,
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
 * Connecting waits while held (`window.fixture.holdConnect`), as LiveKit's connect takes its seconds: the connection is
 * made (`connect` recorded) and handed over once let go.
 */
export const connecting: { held: boolean; waiting: (() => void)[] } = { held: false, waiting: [] }

/** A connection, handed over now or once connecting is let go. */
function handedOver(connection: RoomConnection): Promise<RoomConnection> {
  if (!connecting.held) return Promise.resolve(connection)
  return new Promise((hand) => connecting.waiting.push(() => hand(connection)))
}

/**
 * Turning the microphone off waits while held (`window.fixture.holdMute`), as LiveKit's mute does while a republish
 * settles; a change asked after it waits its turn, as LiveKit's mute lock makes it.
 */
export const disabling: { held: boolean; waiting: (() => void)[] } = { held: false, waiting: [] }
let micTurn: Promise<void> | null = null

/** A microphone change in that order: a held turn-off waits for its release, and what comes after waits for it. */
function inTurn(apply: () => void, held: boolean): Promise<void> {
  const mine = (micTurn ?? Promise.resolve())
    .then(() => (held ? new Promise<void>((resolve) => disabling.waiting.push(resolve)) : undefined))
    .then(apply)
  micTurn = mine
  void mine.then(() => {
    if (micTurn === mine) micTurn = null
  })
  return mine
}

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

/**
 * `refuse=camera`: the browser refuses the camera, as a blocked permission does; `refuse=switch`, a device switch;
 * `refuse=connect`, LiveKit's connect, as a network that can't reach the room does (stale-part-call.md).
 */
const refused = new URLSearchParams(window.location.search).get('refuse')
/** `backgrounds=unsupported`: the device can't draw a camera background (call-backgrounds.md). */
const noBackgrounds = new URLSearchParams(window.location.search).get('backgrounds') === 'unsupported'

/** Whether the device can draw a camera background, as livekit-room.ts asks. */
export const backgroundsSupported = (): boolean => !noBackgrounds

/** `devices=blocked`: the browser refuses access, so no device can be listed (call-devices.md). */
const devicesBlocked = new URLSearchParams(window.location.search).get('devices') === 'blocked'

/**
 * `part=gone`: LiveKit's part of the Studio is gone from the host, as after a deploy (stale-part-call.md). As the build's
 * preload helper does, Vite says so on the page (`vite:preloadError`, as fixtures/new-version.tsx's word) and the
 * import rejects with the browser's own TypeError.
 */
const partGone = new URLSearchParams(window.location.search).get('part') === 'gone'
function gone(): Promise<never> {
  window.dispatchEvent(new Event('vite:preloadError'))
  return Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
}

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
  if (partGone) return gone()
  return devicesBlocked ? Promise.reject(blocked()) : Promise.resolve(DEVICES[kind])
}

/** A device switch, as the connection records it; `refuse=switch` refuses it, as a device in use does. */
function switchDevice(kind: DeviceKind, id: string): Promise<void> {
  asked.push(`device:${kind}:${id}`)
  return refused === 'switch' ? Promise.reject(blocked()) : Promise.resolve()
}

/** Allow audio, as the connection records it: every voice reaches this browser from now on (fake-people.ts). */
function startAudio(): Promise<void> {
  asked.push('audio:start')
  allowSound()
  return Promise.resolve()
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
  linkDown = false // a new connection starts with its link up
  joined.devices = chosenDevices()
  joined.background = chosenBackground()
  callbacks = cb
}

/** The call's link is lost for a while, or back, as LiveKit's Reconnecting and Reconnected events say it. */
export function linkLost(lost: boolean): void {
  linkDown = lost
  callbacks?.onStatus(lost ? 'reconnecting' : 'live')
}

/**
 * Whether the link is down (`linkLost`). The microphone the connection keeps for a dropped call (`micWas`) is then left
 * as it was, the strictest a room module could be: a change made while LiveKit reconnects may not be in it, so the
 * checks hold the room controller to what this person chose since (call-rejoin.md, the review's P1).
 */
let linkDown = false

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

/**
 * The call ends without this person leaving: lost by default, as LiveKit reports a connection gone. `selfLeft`: LiveKit
 * left the room itself (CLIENT_INITIATED), as it does when the page is hidden for good or frozen.
 */
export function dropCall(why: CallEnd = 'dropped', selfLeft = false): void {
  linkDown = false // the link is gone with the call: the next connection's is its own
  ended?.(why, selfLeft)
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

let hostMute: () => void = () => undefined
/**
 * An admin mutes this viewer from the room's server (host-controls.md): the microphone goes off as LiveKit reports it,
 * and this device's own choice (mic-preference.ts) is left as it was.
 */
export function muteByHost(): void {
  hostMute()
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

/** The viewer's identity in the call. */
const VIEWER_ID = '00000000-0000-4000-8000-0000000000a1'

/** How loud each voice is now, by identity (`window.fixture.voiceLevel`): 0 until a check says otherwise. */
const levels = new Map<string, number>()

/** A voice's level from now on: `sophia`, the viewer (0) or the `n`th other person. */
export function setVoiceLevel(who: 'sophia' | number, level: number): void {
  levels.set(who === 'sophia' ? 'sophia' : who === 0 ? VIEWER_ID : personId(who), level)
}

/** The levels as the room's connection reads them (voice-levels.ts in the Studio). */
const voices = {
  voiceLevel: (identity: string) => levels.get(identity) ?? 0,
  sophiaLevel: () => levels.get('sophia') ?? 0,
}

/** The viewer as LiveKit lists the local participant, devices off until the call turns them on. */
const viewer = (): RoomParticipant => ({
  identity: VIEWER_ID,
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
/** Others' cameras come to this page, or not (incoming-video.md): as the connection records it. */
let incoming = true
const theirs = () => feeds().filter((f) => incoming || f.source !== 'camera')

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
    if (name === 'microphone' && (micTurn !== null || (!on && disabling.held)))
      return inTurn(apply, !on && disabling.held)
    apply()
    return Promise.resolve()
  }
}

/** What reaches this viewer while the connection is open: speech heard on a muted microphone, an admin's mute. */
function fromTheServer(me: RoomParticipant, cb: RoomCallbacks, open: () => boolean, changed: () => void): void {
  mutedSpeech = () => {
    if (open() && !me.micOn) cb.onSpeakingMuted?.()
  }
  hostMute = () => {
    if (!open()) return
    me.micOn = false
    changed()
  }
}

/** The microphone as last seen with the link up (see `linkDown`), told on each change, an admin's mute included. */
function keptMic(me: RoomParticipant, cb: RoomCallbacks) {
  let on = me.micOn
  return {
    changed: () => {
      if (!linkDown) on = me.micOn
      cb.onChange()
    },
    micWas: () => on,
  }
}

export function connectRoom(_serverUrl: string, _token: string, cb: RoomCallbacks): Promise<RoomConnection> {
  if (partGone) return gone()
  if (refused === 'connect') return Promise.reject(new Error('could not establish signal connection'))
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
  const mic = keptMic(me, cb)
  fromTheServer(me, cb, () => open, mic.changed)
  ended = (why, selfLeft) => {
    if (!open) return
    open = false
    cb.onEnded(why, selfLeft)
  }
  const device = deviceSwitch(me, mic.changed)
  return handedOver({
    sendChat,
    setTextMode: (on) => {
      asked.push(`text:${on ? 'on' : 'off'}`)
      textOnly = on
    },
    textMode: () => textOnly,
    micWas: mic.micWas,
    participants: () => [{ ...me, speaking: viewerSpeaks() }, ...others()],
    sophia: sophiaSignal,
    audioBlocked: soundBlocked,
    ...voices,
    startAudio,
    feeds: () => (me.cameraOn ? [ownFeed(me.identity), ...theirs()] : theirs()),
    setMicrophone: device('microphone', 'micOn'),
    setCamera: device('camera', 'cameraOn'),
    setScreenShare: device('screen', 'screenOn'),
    switchDevice,
    setBackground,
    sendReaction,
    setIncomingVideo: (on) => {
      asked.push(`incoming:${on ? 'on' : 'off'}`)
      incoming = on
      cb.onChange()
    },
    setFollowing: sayFollowing,
    setVolume: (identity, level) => {
      asked.push(`volume:${identity}:${String(level)}`)
    },
    leave: () => {
      asked.push('leave')
      // LiveKit says the room disconnected when this page leaves it too (CLIENT_INITIATED): the room controller decides
      // whether that end is still its call's.
      if (open) cb.onEnded('dropped', true)
      open = false
      // A slow disconnect (`window.fixture.holdLeave`): it ends when released.
      if (leaving.fails) return Promise.reject(new Error('Disconnect failed'))
      return leaving.held ? new Promise<void>((resolve) => leaving.waiting.push(resolve)) : Promise.resolve()
    },
  })
}
