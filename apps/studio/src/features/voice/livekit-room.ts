// invoke / mic → RoomAudio (frontend bindings): one LiveKit room connection, outside React. The room is
// transport only: joining, muting, sharing a camera or a screen, or leaving never touches project work
// (architecture 06 §2). Video is attached by the Studio's tiles through `feeds()`.
//
// Sophia (the media bridge, identity `sophia`, standing signed by the API) is not one of the people: she is
// read separately through `sophia()`, from the attributes the bridge sets and from whether her sound actually
// reaches this browser (S1-05A §6.5).
import {
  ConnectionState,
  DisconnectReason,
  LocalVideoTrack,
  Room,
  createLocalVideoTrack,
  RoomEvent,
  Track,
  VideoPresets,
  setLogLevel,
  type RoomOptions,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
} from 'livekit-client'
import {
  CHAT_INPUT_TOPIC,
  encodeChatPacket,
  type ChatCaption,
  type ChatInput,
  type ChatNotice,
  type ChatReply,
} from '@sophia/contracts/room-chat'
import type { CallEnd } from './call-end.ts'
import type { BackgroundProcessorWrapper } from '@livekit/track-processors'
import { chosenBackground, type BackgroundId } from './background-preference.ts'
import { backgroundPicture } from './background-pictures.ts'
import { cameraBackground } from './camera-background.ts'
import { deviceChange } from './device-change.ts'
import { hearWhileMuted, mutedWatch } from './muted-speech.ts'
import { chosenDevices, deviceName, type DeviceKind, type MediaDevice } from './device-preference.ts'
import { followingSignal } from './following-signal.ts'
import { VISION } from '../../app/vision.ts'
import { standingOf, type RoomParticipant } from './room-view.ts'
import { MEDIAPIPE_BASE, SEGMENTER_FILE } from './mediapipe-path.ts'
import { peopleVolume, type Level, type PeopleVolume } from './people-volume.ts'
import { listenToReactions, type Heard } from './reaction-channel.ts'
import { encodeReaction, REACTION_TOPIC, type ReactionEmoji } from './reactions.ts'
import { isSophia, listenToSophia } from './sophia-channel.ts'
import type { SophiaSignal } from './sophia-view.ts'

// LiveKit logs every connection step at info level. A deployed Studio keeps warnings and errors in the
// console; local development keeps the full trace.
if (!import.meta.env.DEV) setLogLevel('warn')

export type RoomStatus = 'live' | 'reconnecting'

/** LiveKit's reason for a disconnect, as the ending a person can act on; any other is a lost connection. */
const ENDS: Partial<Record<DisconnectReason, CallEnd>> = {
  [DisconnectReason.DUPLICATE_IDENTITY]: 'elsewhere',
  [DisconnectReason.PARTICIPANT_REMOVED]: 'removed',
  [DisconnectReason.ROOM_DELETED]: 'closed',
  [DisconnectReason.ROOM_CLOSED]: 'closed',
}

/** One video a tile can show: someone's camera or shared screen. */
export interface VideoFeed {
  /** Stable per person and source, for React keys. */
  key: string
  identity: string
  source: 'camera' | 'screen'
  local: boolean
  attach: (el: HTMLVideoElement) => void
  detach: (el: HTMLVideoElement) => void
}

export interface RoomConnection {
  sendChat: (packet: ChatInput) => Promise<void>
  setTextMode: (on: boolean) => void
  /** Sophia is read, not heard: the call is in text mode now. */
  textMode: () => boolean
  participants: () => RoomParticipant[]
  /** The `sophia` participant as observed here, or null when she is not in the room. */
  sophia: () => SophiaSignal | null
  /** The browser blocked audio until the person interacts (autoplay). */
  audioBlocked: () => boolean
  startAudio: () => Promise<void>
  feeds: () => VideoFeed[]
  setMicrophone: (on: boolean) => Promise<void>
  setCamera: (on: boolean) => Promise<void>
  setScreenShare: (on: boolean) => Promise<void>
  /** Draw a background behind this person on camera, now or when it next turns on (call-backgrounds.md). */
  setBackground: (id: BackgroundId) => Promise<void>
  /** Switch the call's microphone, speaker or camera to a listed device (call-devices.md). */
  switchDevice: (kind: DeviceKind, id: string) => Promise<void>
  /** What this person follows, said to the members in the call (following-signal.ts); sent only when it changes. */
  setFollowing: (versionId: string | null) => Promise<void>
  /** A reaction to everyone in the call, on its own topic (call-reactions.md). */
  sendReaction: (emoji: ReactionEmoji) => Promise<void>
  /** How loud a person is in this browser alone, their voice and their screen's sound (people-volume.md). */
  setVolume: (identity: string, level: Level) => void
  /** Others' cameras come to this browser, or not (incoming-video.md); a screen shared always comes. */
  setIncomingVideo: (on: boolean) => void
  leave: () => Promise<void>
}

export interface RoomCallbacks {
  onChat?: (packet: ChatReply) => void
  /** A finished result's card, for every member present, whether they hear Sophia or read her (S6, CX-0022). */
  onNotice?: (packet: ChatNotice) => void
  /** A live caption of what is said aloud, for every member present (CX-0023). */
  onCaption?: (packet: ChatCaption) => void
  /** Captions under way may never get their end here: Sophia left or joined again, or this connection is reconnecting. */
  onCaptionsLost?: () => void
  /** Someone in the room reacted (call-reactions.md). */
  onReaction?: (heard: Heard) => void
  /** Speech heard on this person's microphone while it is off (muted-speech.md). */
  onSpeakingMuted?: () => void
  /** Someone joined, left, spoke, muted or shared video: re-read `participants()` and `feeds()`. */
  onChange: () => void
  onStatus: (status: RoomStatus) => void
  /** The call is over, and why (call-end.ts). Leaving on purpose ends it too; the caller knows it asked. */
  onEnded: (why: CallEnd) => void
}

const toView = (p: Participant, local: boolean): RoomParticipant => ({
  identity: p.identity,
  name: p.name || p.identity.slice(0, 8),
  speaking: p.isSpeaking,
  micOn: p.isMicrophoneEnabled,
  cameraOn: p.isCameraEnabled,
  screenOn: p.isScreenShareEnabled,
  local,
  standing: standingOf(p.metadata),
  ...(p.joinedAt ? { joinedAt: p.joinedAt.getTime() } : {}),
})

function sophiaSignal(p: Participant | undefined): SophiaSignal | null {
  if (!p) return null
  const track = p.getTrackPublication(Track.Source.Microphone)
  return {
    input: p.attributes['sophia.input'],
    output: p.attributes['sophia.output'],
    audible: !!track?.track && !track.isMuted && p.isSpeaking,
  }
}

type Feeds = (p: Participant, local: boolean) => VideoFeed[]

/**
 * Feeds are cached per track: a tile keeps the same feed object while the track lives, so re-reading
 * the room never detaches and reattaches a playing video.
 */
function videoFeeds(): Feeds {
  const cache = new Map<string, { track: object; feed: VideoFeed }>()
  const feedOf = (p: Participant, pub: TrackPublication | undefined, source: VideoFeed['source'], local: boolean) => {
    const track = pub?.videoTrack
    if (!track || pub.isMuted) return null
    const key = `${p.identity}:${source}`
    const cached = cache.get(key)
    if (cached?.track === track) return cached.feed
    const feed: VideoFeed = {
      key,
      identity: p.identity,
      source,
      local,
      attach: (el) => void track.attach(el),
      detach: (el) => void track.detach(el),
    }
    cache.set(key, { track, feed })
    return feed
  }
  return (p, local) =>
    [
      feedOf(p, p.getTrackPublication(Track.Source.Camera), 'camera', local),
      feedOf(p, p.getTrackPublication(Track.Source.ScreenShare), 'screen', local),
    ].filter((f): f is VideoFeed => f !== null)
}

/**
 * Others' cameras, taken or let go (incoming-video.md): off, this browser unsubscribes from each camera published to it,
 * now and as more are published; a screen shared always comes. On again, it takes them back.
 */
function incomingCameras(room: Room, onChange: () => void): Pick<RoomConnection, 'setIncomingVideo'> {
  let on = true
  const apply = (pub: RemoteTrackPublication) => {
    if (pub.source === Track.Source.Camera && pub.isSubscribed !== on) pub.setSubscribed(on)
  }
  // A camera published while they're off isn't taken; one published while they're on is LiveKit's to take, as ever.
  room.on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication) => {
    if (!on) apply(pub)
  })
  return {
    setIncomingVideo: (next) => {
      on = next
      for (const person of room.remoteParticipants.values())
        for (const pub of person.trackPublications.values()) apply(pub)
      onChange()
    },
  }
}

/** Remote voices (and a shared screen's sound) play through hidden audio elements, removed with the track. */
/**
 * The room's voices, as audio elements this room owns: a room that ends removes its own, never another's (a join that
 * was superseded and left must not silence the call that replaced it).
 */
function remoteAudio(
  room: Room,
  textOnly: () => boolean,
): { audio: Set<HTMLMediaElement>; volume: PeopleVolume<HTMLMediaElement> } {
  const mine = new Set<HTMLMediaElement>()
  const trackOf = new Map<HTMLMediaElement, RemoteTrack>()
  const drop = (el: HTMLMediaElement) => {
    trackOf.get(el)?.detach(el)
    trackOf.delete(el)
    el.remove()
    mine.delete(el)
  }
  // Off lets a member's sound go at once: detached, startAudio can't unmute it before their track stops coming.
  const volume = peopleVolume<HTMLMediaElement>(drop)
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
    if (track.kind !== Track.Kind.Audio) return
    const el = track.attach()
    el.dataset.sophiaRoomAudio = isSophia(participant) ? 'sophia' : 'member'
    el.muted = isSophia(participant) && textOnly()
    document.body.append(el)
    mine.add(el)
    trackOf.set(el, track)
    // A member's sound plays at the level given them here (people-volume.md); Sophia's keeps the call's.
    if (!isSophia(participant)) volume.add(el, participant.identity)
  })
  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return
    for (const el of track.detach()) {
      volume.remove(el)
      drop(el)
    }
  })
  // A sound someone Off publishes (their screen's, or their voice after a rejoin) isn't taken (people-volume.md).
  room.on(RoomEvent.TrackPublished, (publication, participant) => {
    if (!isSophia(participant)) volume.published(publication, participant.identity)
  })
  return { audio: mine, volume }
}

/**
 * A screen share the host stopped (A31, host-more.md) stops here too: the server can only mute it, so this person's
 * share ends, and the browser's capture with it, rather than sending a black screen.
 */
function stopsWhenHostStops(room: Room): void {
  room.on(RoomEvent.TrackMuted, (publication, participant) => {
    if (participant !== room.localParticipant || publication.source !== Track.Source.ScreenShare) return
    void room.localParticipant.setScreenShareEnabled(false).catch(() => undefined)
  })
}

const CHANGES = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.ParticipantAttributesChanged,
  RoomEvent.AudioPlaybackStatusChanged,
] as const

/**
 * Tells Sophia whether this person reads or hears her (SMC-M03 S6): when it changes, and again whenever she joins or
 * the connection comes back, because her bridge keeps it only while both are in the room. Each one is also the hello
 * after which the bridge sends this page the result cards the exchange has shown (CX-0022). Best effort: a signal
 * that is lost leaves this person a listener, who still finds the result on its work card.
 */
function modeSignal(room: Room, textOnly: () => boolean): () => void {
  const send = () => {
    room.localParticipant
      .publishData(encodeChatPacket({ kind: 'mode', textMode: textOnly() }), {
        reliable: true,
        destinationIdentities: ['sophia'],
        topic: CHAT_INPUT_TOPIC,
      })
      .catch(() => undefined)
  }
  room.on(RoomEvent.ParticipantConnected, (p) => {
    if (isSophia(p)) send()
  })
  room.on(RoomEvent.Reconnected, send)
  return send
}

/**
 * The devices of each kind, for a menu (call-devices.md). LiveKit asks for access first where the browser keeps the
 * names back; a refusal rejects, and the menu says how to give it.
 */
export async function listDevices(kind: DeviceKind): Promise<MediaDevice[]> {
  const devices = await Room.getLocalDevices(kind, true)
  return devices.map((d, i) => ({ id: d.deviceId, label: deviceName(kind, d.label, i) }))
}

/** The camera's capture: 720p, from the camera chosen for calls on this device (wanted, not required). */
function cameraCapture() {
  const camera = chosenDevices().videoinput
  return { resolution: VideoPresets.h720.resolution, ...(camera && { deviceId: camera }) }
}

/**
 * The room's options, with the devices chosen for calls on this device (call-devices.md): wanted, not required, so a
 * device unplugged since gives way to another.
 */
function roomOptions(): RoomOptions {
  const chosen = chosenDevices()
  return {
    adaptiveStream: true,
    dynacast: true,
    // 720p cameras and simulcast keep a small room light on bandwidth; tiles receive only what they show.
    videoCaptureDefaults: cameraCapture(),
    ...(chosen.audioinput && { audioCaptureDefaults: { deviceId: chosen.audioinput } }),
    ...(chosen.audiooutput && { audioOutput: { deviceId: chosen.audiooutput } }),
    publishDefaults: { simulcast: true },
  }
}

/** A device switch, as LiveKit answers it: false for one that didn't take, which the person hears of as a refusal. */
const switchTo = (room: Room, kind: DeviceKind, id: string) =>
  room.switchActiveDevice(kind, id).then((took) => {
    if (!took) throw new Error(`The ${kind} didn’t switch`)
  })

/**
 * Whether this device can draw a camera background: what @livekit/track-processors 0.8.1 asks of it (WebGL2, offscreen
 * canvases and video frames, and a way to process a track), asked without loading it.
 */
export function backgroundsSupported(): boolean {
  const transformer =
    typeof OffscreenCanvas !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof createImageBitmap !== 'undefined' &&
    !!document.createElement('canvas').getContext('webgl2')
  const processing =
    ('MediaStreamTrackGenerator' in globalThis && 'MediaStreamTrackProcessor' in globalThis) ||
    'captureStream' in HTMLCanvasElement.prototype
  return transformer && processing
}

/** Where the processor finds MediaPipe: the Studio's own copy (mediapipe-assets.ts), never a third party's. */
const MEDIAPIPE = { tasksVisionFileSet: MEDIAPIPE_BASE, modelAssetPath: `${MEDIAPIPE_BASE}/${SEGMENTER_FILE}` }

/** The camera's background (camera-background.ts), drawn by LiveKit's processor loaded on first use. */
/** How long a camera with a background waits for its processor's first drawn frame before it stays off. */
const FIRST_FRAME_MS = 10_000

/**
 * The camera's background (camera-background.ts), drawn by LiveKit's processor loaded on first use. A camera with one is
 * made unpublished and published once a frame is drawn, so the processor's first raw frame never leaves.
 */
function background(room: Room) {
  const drawn = new WeakMap<object, Set<() => void>>()
  return cameraBackground<BackgroundProcessorWrapper, LocalVideoTrack>({
    camera: () => {
      const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track
      return track instanceof LocalVideoTrack ? track : null
    },
    make: async (effect) => {
      const { BackgroundProcessor } = await import('@livekit/track-processors')
      const waiting = new Set<() => void>()
      const processor = BackgroundProcessor({
        ...effect,
        assetPaths: MEDIAPIPE,
        // Each frame drawn tells whoever waits for one.
        onFrameProcessed: () => {
          for (const told of waiting) told()
          waiting.clear()
        },
      })
      drawn.set(processor, waiting)
      return processor
    },
    chosen: chosenBackground(),
    picture: backgroundPicture,
    create: (processor) => createLocalVideoTrack({ ...cameraCapture(), processor }),
    publish: async (track) => {
      await room.localParticipant.publishTrack(track, { source: Track.Source.Camera, simulcast: true })
    },
    unpublish: async (track) => {
      await room.localParticipant.unpublishTrack(track, true)
    },
    drawnFrame: (processor) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No frame drawn')), FIRST_FRAME_MS)
        drawn.get(processor)?.add(() => {
          clearTimeout(timer)
          resolve()
        })
      }),
  })
}

type DeviceControls = Pick<
  RoomConnection,
  'setMicrophone' | 'setCamera' | 'setBackground' | 'setScreenShare' | 'switchDevice'
>

/**
 * While this person's microphone is off in the call, listen for speech on it, to say «You're muted»
 * (muted-speech.md): on any change of the microphone, a host's mute included, and never once the call is over.
 */
function mutedMicrophone(room: Room, onSpeaking: () => void): () => void {
  const watch = mutedWatch((deviceId) => hearWhileMuted(deviceId, onSpeaking))
  const sync = () =>
    watch.set(
      room.state === ConnectionState.Connected && !room.localParticipant.isMicrophoneEnabled,
      room.getActiveDevice('audioinput'),
    )
  // A switched microphone is a new one to listen on; a call that begins muted listens from the start (Codex on #357).
  for (const event of [
    RoomEvent.TrackMuted,
    RoomEvent.TrackUnmuted,
    RoomEvent.LocalTrackPublished,
    RoomEvent.ActiveDeviceChanged,
    RoomEvent.Reconnected,
  ])
    room.on(event, sync)
  room.on(RoomEvent.Disconnected, watch.end)
  sync()
  return sync
}

/** This person's devices in the call, each as LiveKit leaves it, not as its answer says (deviceChange). */
function deviceControls(
  room: Room,
  after: (change: Promise<unknown>) => Promise<void>,
  micChanged: () => void,
): DeviceControls {
  const me = room.localParticipant
  const drawn = background(room)
  return {
    setMicrophone: (on) =>
      after(deviceChange(me.setMicrophoneEnabled(on), () => me.isMicrophoneEnabled === on)).finally(micChanged),
    // The chosen background goes with the capture, so the room never sees what is behind (camera-background.ts).
    // With a background, the camera is made, drawn and only then published (camera-background.ts).
    // The camera's own on and off take their turns with background choices, so neither races the other (Codex on #342).
    setCamera: (on) => {
      const plain = () => deviceChange(me.setCameraEnabled(on), () => me.isCameraEnabled === on)
      return after(on ? drawn.turnOn(plain) : drawn.turnOff(plain))
    },
    setBackground: (id) => after(drawn.set(id)),
    // The browser asks which screen, window or tab; its own "Stop sharing" ends the share too.
    setScreenShare: (on) =>
      after(
        deviceChange(
          me.setScreenShareEnabled(on, { audio: true, selfBrowserSurface: 'exclude' }),
          () => me.isScreenShareEnabled === on,
        ),
      ),
    switchDevice: (kind, id) => after(switchTo(room, kind, id)),
  }
}

export async function connectRoom(serverUrl: string, token: string, cb: RoomCallbacks): Promise<RoomConnection> {
  const room = new Room(roomOptions())
  for (const event of CHANGES) room.on(event, cb.onChange)
  room.on(RoomEvent.Reconnecting, () => cb.onStatus('reconnecting'))
  room.on(RoomEvent.Reconnected, () => cb.onStatus('live'))
  let textOnly = false
  const { audio, volume } = remoteAudio(room, () => textOnly)
  stopsWhenHostStops(room)
  room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
    for (const el of audio) el.remove()
    audio.clear()
    cb.onEnded((reason !== undefined && ENDS[reason]) || 'dropped')
  })
  listenToSophia(room, cb)
  listenToReactions(room, (heard) => cb.onReaction?.(heard))
  const signalMode = modeSignal(room, () => textOnly)
  const following = followingSignal(room, cb.onChange, { resync: VISION })
  await room.connect(serverUrl, token)
  const feedsOf = videoFeeds()
  const after = async (change: Promise<unknown>) => {
    await change
    cb.onChange()
  }
  const people = () => [...room.remoteParticipants.values()].filter((p) => !isSophia(p))
  const other = (p: Participant) => ({ ...toView(p, false), following: following.of(p.identity) })
  return {
    sendChat: (packet) =>
      room.localParticipant.publishData(encodeChatPacket(packet), {
        reliable: true,
        destinationIdentities: ['sophia'],
        topic: CHAT_INPUT_TOPIC,
      }),
    setTextMode: (on) => {
      textOnly = on
      for (const el of audio) if (el.dataset.sophiaRoomAudio === 'sophia') el.muted = on
      signalMode()
    },
    textMode: () => textOnly,
    participants: () => [toView(room.localParticipant, true), ...people().map(other)],
    sophia: () => sophiaSignal([...room.remoteParticipants.values()].find(isSophia)),
    audioBlocked: () => !room.canPlaybackAudio,
    startAudio: () => after(room.startAudio()),
    feeds: () => [...feedsOf(room.localParticipant, true), ...people().flatMap((p) => feedsOf(p, false))],
    ...deviceControls(
      room,
      after,
      mutedMicrophone(room, () => cb.onSpeakingMuted?.()),
    ),
    setFollowing: (versionId) => Promise.resolve(following.set(versionId)),
    sendReaction: (emoji) =>
      room.localParticipant.publishData(encodeReaction(emoji), { reliable: true, topic: REACTION_TOPIC }),
    setVolume: (identity, level) =>
      volume.set(identity, level, room.remoteParticipants.get(identity)?.trackPublications.values() ?? []),
    ...incomingCameras(room, cb.onChange),
    leave: () => room.disconnect(),
  }
}
