// invoke / mic → RoomAudio (frontend bindings): one LiveKit room connection, outside React. The room is
// transport only: joining, muting, sharing a camera or a screen, or leaving never touches project work
// (architecture 06 §2). Video is attached by the Studio's tiles through `feeds()`.
//
// Sophia (the media bridge, identity `sophia`, standing signed by the API) is not one of the people: she is
// read separately through `sophia()`, from the attributes the bridge sets and from whether her sound actually
// reaches this browser (S1-05A §6.5).
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type Participant,
  type RemoteTrack,
  type TrackPublication,
} from 'livekit-client'
import { standingOf, type RoomParticipant } from './room-view.ts'
import type { SophiaSignal } from './sophia-view.ts'

export type RoomStatus = 'live' | 'reconnecting' | 'ended'

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
  leave: () => Promise<void>
}

export interface RoomCallbacks {
  /** Someone joined, left, spoke, muted or shared video: re-read `participants()` and `feeds()`. */
  onChange: () => void
  onStatus: (status: RoomStatus) => void
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
})

/** The bridge: the identity no person can be issued, with the standing only the API signs (amendment A06). */
function isSophia(p: Participant): boolean {
  if (p.identity !== 'sophia') return false
  try {
    const value: unknown = JSON.parse(p.metadata ?? 'null')
    return typeof value === 'object' && value !== null && 'sophia' in value && value.sophia === true
  } catch {
    return false
  }
}

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
function remoteAudio(room: Room): void {
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return
    const el = track.attach()
    el.dataset.sophiaRoomAudio = ''
    document.body.append(el)
  })
  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) for (const el of track.detach()) el.remove()
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

export async function connectRoom(serverUrl: string, token: string, cb: RoomCallbacks): Promise<RoomConnection> {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    // 720p cameras and simulcast keep a small room light on bandwidth; tiles receive only what they show.
    videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
    publishDefaults: { simulcast: true },
  })
  for (const event of CHANGES) room.on(event, cb.onChange)
  room.on(RoomEvent.Reconnecting, () => cb.onStatus('reconnecting'))
  room.on(RoomEvent.Reconnected, () => cb.onStatus('live'))
  room.on(RoomEvent.Disconnected, () => {
    for (const el of document.querySelectorAll('[data-sophia-room-audio]')) el.remove()
    cb.onStatus('ended')
  })
  remoteAudio(room)
  await room.connect(serverUrl, token)
  const feedsOf = videoFeeds()
  const after = async (change: Promise<unknown>) => {
    await change
    cb.onChange()
  }
  const people = () => [...room.remoteParticipants.values()].filter((p) => !isSophia(p))
  return {
    participants: () => [toView(room.localParticipant, true), ...people().map((p) => toView(p, false))],
    sophia: () => sophiaSignal([...room.remoteParticipants.values()].find(isSophia)),
    audioBlocked: () => !room.canPlaybackAudio,
    startAudio: () => after(room.startAudio()),
    feeds: () => [...feedsOf(room.localParticipant, true), ...people().flatMap((p) => feedsOf(p, false))],
    setMicrophone: (on) => after(room.localParticipant.setMicrophoneEnabled(on)),
    setCamera: (on) => after(room.localParticipant.setCameraEnabled(on)),
    // The browser asks which screen, window or tab; its own "Stop sharing" ends the share too.
    setScreenShare: (on) =>
      after(room.localParticipant.setScreenShareEnabled(on, { audio: true, selfBrowserSurface: 'exclude' })),
    leave: () => room.disconnect(),
  }
}
