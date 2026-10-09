// invoke / mic → RoomAudio (frontend bindings): one LiveKit room connection, outside React. The room is
// transport only: joining, muting, sharing a camera or a screen, or leaving never touches project work
// (architecture 06 §2). Video is attached by the Studio's tiles through `feeds()`.
//
// Sophia (the media bridge, identity `sophia`, standing signed by the API) is not one of the people: she is
// read separately through `sophia()`, from the attributes the bridge sets and from whether her sound actually
// reaches this browser (S1-05A §6.5).
//
// Under a voice qualification grant, which the room token names to its principal alone (A15), the page also tells
// itself its own microphone and Sophia's playback (voice-qualification.ts); without one, nothing of it is attached.
import {
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  setLogLevel,
  type Participant,
  type RemoteTrack,
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
import type { RoomToken } from '@sophia/contracts'
import type { CallEnd } from './call-end.ts'
import { deviceChange } from './device-change.ts'
import { followingSignal } from './following-signal.ts'
import { VISION } from '../../app/vision.ts'
import { standingOf, type RoomParticipant } from './room-view.ts'
import { isSophia, listenToSophia } from './sophia-channel.ts'
import type { SophiaSignal } from './sophia-view.ts'
import { watchQualification } from './voice-qualification.ts'

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
  /** What this person follows, said to the members in the call (following-signal.ts); sent only when it changes. */
  setFollowing: (versionId: string | null) => Promise<void>
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

/** Remote voices (and a shared screen's sound) play through hidden audio elements, removed with the track. */
/**
 * The room's voices, as audio elements this room owns: a room that ends removes its own, never another's (a join that
 * was superseded and left must not silence the call that replaced it).
 */
function remoteAudio(room: Room, textOnly: () => boolean): Set<HTMLMediaElement> {
  const mine = new Set<HTMLMediaElement>()
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
    if (track.kind !== Track.Kind.Audio) return
    const el = track.attach()
    el.dataset.sophiaRoomAudio = isSophia(participant) ? 'sophia' : 'member'
    el.muted = isSophia(participant) && textOnly()
    document.body.append(el)
    mine.add(el)
  })
  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return
    for (const el of track.detach()) {
      el.remove()
      mine.delete(el)
    }
  })
  return mine
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

/** A call's room: 720p cameras and simulcast keep a small room light on bandwidth; tiles receive only what they show. */
const newRoom = () =>
  new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
    publishDefaults: { simulcast: true },
  })

/** The call the token opens, as the API issued it: its server, its token and, for a grant's principal, the grant. */
export async function connectRoom(issued: RoomToken, cb: RoomCallbacks): Promise<RoomConnection> {
  const room = newRoom()
  for (const event of CHANGES) room.on(event, cb.onChange)
  room.on(RoomEvent.Reconnecting, () => cb.onStatus('reconnecting'))
  room.on(RoomEvent.Reconnected, () => cb.onStatus('live'))
  let textOnly = false
  const audio = remoteAudio(room, () => textOnly)
  // After the room's audio: Sophia's element is attached and marked when a receipt looks for it.
  watchQualification(room, issued.qualification)
  room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
    for (const el of audio) el.remove()
    audio.clear()
    cb.onEnded((reason !== undefined && ENDS[reason]) || 'dropped')
  })
  listenToSophia(room, cb)
  const signalMode = modeSignal(room, () => textOnly)
  const following = followingSignal(room, cb.onChange, { resync: VISION })
  await room.connect(issued.serverUrl, issued.token)
  const feedsOf = videoFeeds()
  const after = async (change: Promise<unknown>) => {
    await change
    cb.onChange()
  }
  const people = () => [...room.remoteParticipants.values()].filter((p) => !isSophia(p))
  const other = (p: Participant) => ({ ...toView(p, false), following: following.of(p.identity) })
  const me = room.localParticipant
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
    // Each device as LiveKit leaves it, not as its answer says (deviceChange).
    setMicrophone: (on) => after(deviceChange(me.setMicrophoneEnabled(on), () => me.isMicrophoneEnabled === on)),
    setCamera: (on) => after(deviceChange(me.setCameraEnabled(on), () => me.isCameraEnabled === on)),
    // The browser asks which screen, window or tab; its own "Stop sharing" ends the share too.
    setScreenShare: (on) =>
      after(
        deviceChange(
          me.setScreenShareEnabled(on, { audio: true, selfBrowserSurface: 'exclude' }),
          () => me.isScreenShareEnabled === on,
        ),
      ),
    setFollowing: (versionId) => Promise.resolve(following.set(versionId)),
    leave: () => room.disconnect(),
  }
}
