import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RoomEvent, Track, type Room } from 'livekit-client'
import type { RoomQualification } from '@sophia/contracts'
import {
  observePlayback,
  PLAYBACK,
  RECEIPT_EVENT,
  RECEIPT_SCHEMA,
  watchQualification,
  type Playback,
  type ReceiptDetail,
  type ReceiptPage,
} from './voice-qualification.ts'

const GRANT: RoomQualification = {
  grantId: '0e000000-0000-4000-8000-000000000001',
  runBindingSha256: 'ab'.repeat(32),
}
const SOPHIA = { identity: 'sophia', metadata: JSON.stringify({ sophia: true }) }
const MEMBER = { identity: '11111111-1111-4111-8111-111111111111', metadata: '{}' }

/** A room that only keeps its listeners, to call them as LiveKit would. */
function fakeRoom() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const room = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
    },
  }
  const emit = (event: string, ...args: unknown[]) => {
    for (const fn of listeners.get(event) ?? []) fn(...args)
  }
  return { room: room as unknown as Pick<Room, 'on'>, listeners, emit }
}

/** A media element as the room attaches one: its tag, whose voice it is marked as, the events listened to, its clock. */
class Media extends EventTarget {
  readonly tag: string
  readonly mark: string | null
  readonly listened: string[] = []
  currentTime = 0
  constructor(tag: string, mark: string | null) {
    super()
    this.tag = tag
    this.mark = mark
  }
  /** The one selector shape the receipts use: `tag[data-sophia-room-audio="mark"]`. */
  matches(selector: string): boolean {
    const m = /^(\w+)\[data-sophia-room-audio="(\w+)"\]$/.exec(selector)
    return m !== null && m[1] === this.tag && m[2] === this.mark
  }
  override addEventListener(...args: Parameters<EventTarget['addEventListener']>): void {
    this.listened.push(args[0])
    super.addEventListener(...args)
  }
}

/** The page's receipts, as a listener on its window would hear them, on a clock that moves by one each time. */
function page() {
  const heard: Event[] = []
  let clock = 1_000
  const target: ReceiptPage = { dispatch: (e) => heard.push(e), now: () => (clock += 1) }
  const details = () => heard.map((e) => (e as CustomEvent<ReceiptDetail>).detail)
  return { target, heard, details }
}

const pub = (source: Track.Source, trackSid: string, trackId?: string) => ({
  source,
  trackSid,
  track: trackId === undefined ? undefined : { mediaStreamTrack: { id: trackId } },
})

/** A track subscribed, its elements attached: as the room's TrackSubscribed hands them over. */
const subscribed = (els: Media[], trackSid: string, who: object) => [
  { kind: 'audio', attachedElements: els },
  { trackSid },
  who,
]

describe('the Studio’s voice qualification receipts (A15)', () => {
  it('without a grant, no listener is added and nothing is emitted', () => {
    const { room, listeners, emit } = fakeRoom()
    const seen = page()
    watchQualification(room, undefined, seen.target)
    assert.equal(listeners.size, 0)
    const voice = new Media('audio', 'sophia')
    emit(RoomEvent.LocalTrackPublished, pub(Track.Source.Microphone, 'TR_mic', 'mic-track'))
    emit(RoomEvent.TrackSubscribed, ...subscribed([voice], 'TR_sophia', SOPHIA))
    for (const phase of PLAYBACK) voice.dispatchEvent(new Event(phase))
    emit(RoomEvent.LocalTrackUnpublished, pub(Track.Source.Microphone, 'TR_mic', 'mic-track'))
    assert.deepEqual(voice.listened, [])
    assert.deepEqual(seen.heard, [])
  })

  it('under a grant, it listens to the room for the microphone and subscribed tracks, nothing else', () => {
    const { room, listeners } = fakeRoom()
    watchQualification(room, GRANT, page().target)
    assert.deepEqual(
      [...listeners.keys()].toSorted(),
      [RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.TrackSubscribed].toSorted(),
    )
  })

  it('mic_published: exactly the schema, the grant, the time, the event, the track and its MediaStreamTrack id', () => {
    const { room, emit } = fakeRoom()
    const seen = page()
    watchQualification(room, GRANT, seen.target)
    emit(RoomEvent.LocalTrackPublished, pub(Track.Source.Camera, 'TR_cam', 'cam-track'))
    emit(RoomEvent.LocalTrackPublished, pub(Track.Source.ScreenShareAudio, 'TR_screen_audio', 'screen-audio-track'))
    emit(RoomEvent.LocalTrackPublished, pub(Track.Source.Microphone, 'TR_pending')) // no track yet: no id to name
    emit(RoomEvent.LocalTrackPublished, pub(Track.Source.Microphone, 'TR_mic', 'mic-track'))
    const [detail, ...more] = seen.details()
    assert.deepEqual(more, [])
    assert.deepEqual(Object.keys(detail ?? {}), [
      'schema',
      'grantId',
      'runBindingSha256',
      'atMs',
      'event',
      'trackSid',
      'trackId',
    ])
    assert.deepEqual(detail, {
      schema: RECEIPT_SCHEMA,
      grantId: GRANT.grantId,
      runBindingSha256: GRANT.runBindingSha256,
      atMs: 1_001,
      event: 'mic_published',
      trackSid: 'TR_mic',
      trackId: 'mic-track',
    })
  })

  it('mic_unpublished: exactly the schema, the grant, the time, the event and the track; the microphone only', () => {
    const { room, emit } = fakeRoom()
    const seen = page()
    watchQualification(room, GRANT, seen.target)
    emit(RoomEvent.LocalTrackUnpublished, pub(Track.Source.ScreenShare, 'TR_screen', 'screen-track'))
    emit(RoomEvent.LocalTrackUnpublished, pub(Track.Source.Microphone, 'TR_mic', 'mic-track'))
    const [detail, ...more] = seen.details()
    assert.deepEqual(more, [])
    assert.deepEqual(Object.keys(detail ?? {}), ['schema', 'grantId', 'runBindingSha256', 'atMs', 'event', 'trackSid'])
    assert.deepEqual(detail, {
      schema: RECEIPT_SCHEMA,
      grantId: GRANT.grantId,
      runBindingSha256: GRANT.runBindingSha256,
      atMs: 1_001,
      event: 'mic_unpublished',
      trackSid: 'TR_mic',
    })
  })

  it('sophia_playback: each of the six moments on Sophia’s element, with its track and media time; no other', () => {
    const { room, emit } = fakeRoom()
    const seen = page()
    watchQualification(room, GRANT, seen.target)
    const voice = new Media('audio', 'sophia')
    const member = new Media('audio', 'member')
    const unmarked = new Media('audio', null)
    const video = new Media('video', 'sophia') // marked hers, but not her voice's element
    emit(RoomEvent.TrackSubscribed, ...subscribed([voice, video], 'TR_sophia', SOPHIA))
    emit(RoomEvent.TrackSubscribed, ...subscribed([member, unmarked], 'TR_member', MEMBER))
    assert.deepEqual(voice.listened, [...PLAYBACK])
    for (const other of [member, unmarked, video]) assert.deepEqual(other.listened, [], other.mark ?? 'unmarked')

    voice.currentTime = 0.0416 // 41.6 ms: whole milliseconds
    for (const el of [voice, member, unmarked, video]) {
      for (const phase of [...PLAYBACK, 'timeupdate', 'volumechange']) el.dispatchEvent(new Event(phase))
    }
    const details = seen.details()
    assert.deepEqual(
      details.map((d) => Object.keys(d)),
      PLAYBACK.map(() => [
        'schema',
        'grantId',
        'runBindingSha256',
        'atMs',
        'event',
        'phase',
        'trackSid',
        'mediaTimeMs',
      ]),
    )
    assert.deepEqual(
      details,
      PLAYBACK.map((phase, i) => ({
        schema: RECEIPT_SCHEMA,
        grantId: GRANT.grantId,
        runBindingSha256: GRANT.runBindingSha256,
        atMs: 1_001 + i,
        event: 'sophia_playback',
        phase,
        trackSid: 'TR_sophia',
        mediaTimeMs: 42,
      })),
    )
  })

  it('an element that is not Sophia’s voice gets no listener at all', () => {
    const emitted: unknown[] = []
    for (const el of [new Media('audio', 'member'), new Media('audio', null), new Media('video', 'sophia')]) {
      observePlayback(el as unknown as Playback, 'TR_x', (r) => emitted.push(r))
      for (const phase of PLAYBACK) el.dispatchEvent(new Event(phase))
      assert.deepEqual(el.listened, [])
    }
    assert.deepEqual(emitted, [])
  })

  it('goes to the page as a frozen sophia:voice-qualification CustomEvent naming only the grant’s two fields', () => {
    const { room, emit } = fakeRoom()
    const seen = page()
    const wider = { ...GRANT, principalActorId: MEMBER.identity, note: 'never on a receipt' }
    watchQualification(room, wider, seen.target)
    emit(RoomEvent.LocalTrackUnpublished, pub(Track.Source.Microphone, 'TR_mic', 'mic-track'))
    const [event] = seen.heard
    assert.ok(event instanceof CustomEvent)
    assert.equal(event.type, RECEIPT_EVENT)
    assert.equal(event.bubbles, false)
    const detail: unknown = event.detail
    assert.ok(Object.isFrozen(detail))
    assert.deepEqual(Object.keys(detail as object), [
      'schema',
      'grantId',
      'runBindingSha256',
      'atMs',
      'event',
      'trackSid',
    ])
  })
})
