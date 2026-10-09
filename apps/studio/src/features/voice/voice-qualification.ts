// The Studio's page receipts for the voice qualification episode (docs/plans/voice-qualification-g7.md, "Studio
// receipts"; amendment A15). Only when the room token names a grant, which the API does for the grant's principal
// alone while it is active, this page tells itself, as `window` CustomEvents, when its own microphone is published and
// unpublished and how Sophia's voice plays here. A receipt holds ids, an enumerated word and times: no text, no audio,
// no other participant. Nothing is stored, sent or logged. Without a grant, nothing is listened to and nothing is
// emitted. Loaded with the room's connection (livekit-room.ts), never before a call.
import { RoomEvent, Track, type Room } from 'livekit-client'
import type { RoomQualification } from '@sophia/contracts'

export const RECEIPT_EVENT = 'sophia:voice-qualification'
export const RECEIPT_SCHEMA = 'sophia.studio.voice_qualification.v1'
/** Sophia's voice, as the room marks its element (livekit-room.ts): the only element whose playback is observed. */
export const SOPHIA_AUDIO = 'audio[data-sophia-room-audio="sophia"]'
/** The moments of Sophia's playback a receipt names. */
export const PLAYBACK = ['play', 'playing', 'pause', 'waiting', 'ended', 'emptied'] as const

export type Receipt =
  | { event: 'mic_published'; trackSid: string; trackId: string }
  | { event: 'mic_unpublished'; trackSid: string }
  | { event: 'sophia_playback'; phase: (typeof PLAYBACK)[number]; trackSid: string; mediaTimeMs: number }

/** What the page hears, in this order: the schema, the grant, when, then the receipt itself. */
export type ReceiptDetail = {
  schema: typeof RECEIPT_SCHEMA
  grantId: string
  runBindingSha256: string
  atMs: number
} & Receipt

/** Where receipts go and the clock that stamps them: this page's window, unless a test says otherwise. */
export interface ReceiptPage {
  dispatch: (event: Event) => void
  now: () => number
}

const THIS_PAGE: ReceiptPage = {
  // A listener that throws is reported by the browser and never reaches the call.
  dispatch: (event) => void window.dispatchEvent(event),
  now: () => Date.now(),
}

/** The element a receipt reads: whether it is Sophia's voice, its playback events, and where its media is. */
export type Playback = Pick<HTMLMediaElement, 'matches' | 'addEventListener' | 'currentTime'>

/** Each receipt to the page, under the grant: its two names only, whatever else a grant may carry. */
const receiptsUnder = (grant: RoomQualification, page: ReceiptPage) => (receipt: Receipt) => {
  const detail: ReceiptDetail = {
    schema: RECEIPT_SCHEMA,
    grantId: grant.grantId,
    runBindingSha256: grant.runBindingSha256,
    atMs: page.now(),
    ...receipt,
  }
  page.dispatch(new CustomEvent(RECEIPT_EVENT, { detail: Object.freeze(detail) }))
}

/** The element's playback for as long as it lives, when it is Sophia's voice; any other element is left alone. */
export function observePlayback(el: Playback, trackSid: string, emit: (receipt: Receipt) => void): void {
  if (!el.matches(SOPHIA_AUDIO)) return
  for (const phase of PLAYBACK) {
    el.addEventListener(phase, () =>
      emit({ event: 'sophia_playback', phase, trackSid, mediaTimeMs: Math.round(el.currentTime * 1000) }),
    )
  }
}

/**
 * A call's receipts under a grant, from its room's own events: the local microphone published and unpublished (no other
 * source), and Sophia's playback once her element is attached. Registered after the room's audio (remoteAudio in
 * livekit-room.ts): a room calls its listeners in the order they were added, so a subscribed track's element is
 * attached and marked by the time this reads it. Without a grant, no listener is added.
 */
export function watchQualification(
  room: Pick<Room, 'on'>,
  qualification: RoomQualification | undefined,
  page: ReceiptPage = THIS_PAGE,
): void {
  if (!qualification) return
  const emit = receiptsUnder(qualification, page)
  room.on(RoomEvent.LocalTrackPublished, (pub) => {
    if (pub.source !== Track.Source.Microphone || !pub.track) return
    emit({ event: 'mic_published', trackSid: pub.trackSid, trackId: pub.track.mediaStreamTrack.id })
  })
  room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
    if (pub.source === Track.Source.Microphone) emit({ event: 'mic_unpublished', trackSid: pub.trackSid })
  })
  room.on(RoomEvent.TrackSubscribed, (track, pub) => {
    for (const el of track.attachedElements) observePlayback(el, pub.trackSid, emit)
  })
}
