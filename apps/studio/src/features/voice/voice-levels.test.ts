import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RoomEvent, type Room } from 'livekit-client'
import { voiceLevels, type Tapper } from './voice-levels.ts'

/** A microphone track as far as a tap reads it: how loud it is now. */
const track = (level: number) => ({ level }) as unknown as MediaStreamTrack & { level: number }

/** A participant whose microphone publication holds `mic` (none: no microphone published). */
function person(identity: string, mic: MediaStreamTrack | null, metadata = JSON.stringify({ role: 'editor' })) {
  const p = {
    identity,
    metadata,
    mic,
    getTrackPublication: () => (p.mic ? { track: { mediaStreamTrack: p.mic } } : undefined),
  }
  return p
}

/** A tap maker that counts what it makes and what it is told: one context per call, a tap per track. */
function counting() {
  const made = { contexts: 0, taps: 0, stops: 0, resumes: 0, closes: 0 }
  const make = (): Tapper => {
    made.contexts++
    return {
      tap: (t) => {
        made.taps++
        return { level: () => (t as MediaStreamTrack & { level: number }).level, stop: () => void made.stops++ }
      },
      resume: () => void made.resumes++,
      close: () => void made.closes++,
    }
  }
  return { made, make }
}

/** A room that keeps its listeners, to play it as LiveKit would. */
function fakeRoom(me: ReturnType<typeof person>, others: ReturnType<typeof person>[]) {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const room = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
    },
    localParticipant: me,
    remoteParticipants: new Map(others.map((p) => [p.identity, p])),
  }
  const emit = (event: string, ...args: unknown[]) => {
    for (const fn of listeners.get(event) ?? []) fn(...args)
  }
  return { room: room as unknown as Room, emit, remote: room.remoteParticipants }
}

const SOPHIA = JSON.stringify({ sophia: true })

describe('voices’ levels in the call (docs/plans/voice-amplitude.md)', () => {
  it('reads 0 for someone unknown or with no microphone, and opens nothing for them', () => {
    const { made, make } = counting()
    const { room } = fakeRoom(person('me', null), [person('ana', null)])
    const levels = voiceLevels(room, make)
    assert.equal(levels.voiceLevel('nobody'), 0)
    assert.equal(levels.voiceLevel('ana'), 0)
    assert.equal(levels.voiceLevel('me'), 0)
    assert.equal(made.contexts, 0)
  })

  it('opens one context for the call and one tap per track, kept across reads', () => {
    const { made, make } = counting()
    const { room } = fakeRoom(person('me', track(0.2)), [person('ana', track(0.6))])
    const levels = voiceLevels(room, make)
    assert.equal(levels.voiceLevel('ana'), 0.6)
    assert.equal(levels.voiceLevel('me'), 0.2)
    assert.equal(levels.voiceLevel('ana'), 0.6)
    assert.deepEqual([made.contexts, made.taps], [1, 2])
  })

  it('a track changed under someone stops its old tap and opens one on the new track', () => {
    const { made, make } = counting()
    const ana = person('ana', track(0.6))
    const { room } = fakeRoom(person('me', null), [ana])
    const levels = voiceLevels(room, make)
    levels.voiceLevel('ana')
    ana.mic = track(0.3)
    assert.equal(levels.voiceLevel('ana'), 0.3)
    assert.deepEqual([made.taps, made.stops], [2, 1])
  })

  it('reads Sophia by her standing: a participant only named «sophia» reads 0, and is no person either', () => {
    const real = counting()
    const her = fakeRoom(person('me', null), [person('sophia', track(0.9), SOPHIA)])
    const levels = voiceLevels(her.room, real.make)
    assert.equal(levels.sophiaLevel(), 0.9)
    assert.equal(levels.voiceLevel('sophia'), 0)
    const named = counting()
    const impostor = fakeRoom(person('me', null), [person('sophia', track(0.9), '{}')])
    assert.equal(voiceLevels(impostor.room, named.make).sophiaLevel(), 0)
  })

  it('resumes its context when the browser allows sound, and lets go of someone who left', () => {
    const { made, make } = counting()
    const { room, emit, remote } = fakeRoom(person('me', null), [person('ana', track(0.6))])
    const levels = voiceLevels(room, make)
    levels.voiceLevel('ana')
    emit(RoomEvent.AudioPlaybackStatusChanged, true)
    assert.equal(made.resumes, 1)
    const ana = remote.get('ana')
    remote.delete('ana')
    emit(RoomEvent.ParticipantDisconnected, ana)
    assert.equal(made.stops, 1)
    assert.equal(levels.voiceLevel('ana'), 0)
  })

  it('ends with the call: every tap stopped, the context closed once, and nothing opened after', () => {
    const { made, make } = counting()
    const { room, emit } = fakeRoom(person('me', track(0.2)), [person('ana', track(0.6))])
    const levels = voiceLevels(room, make)
    levels.voiceLevel('ana')
    levels.voiceLevel('me')
    emit(RoomEvent.Disconnected)
    emit(RoomEvent.Disconnected)
    assert.deepEqual([made.stops, made.closes], [2, 1])
    assert.equal(levels.voiceLevel('ana'), 0)
    assert.deepEqual([made.contexts, made.taps], [1, 2])
  })

  it('never throws: a context or a tap that fails reads 0', () => {
    const { room } = fakeRoom(person('me', null), [person('ana', track(0.6))])
    const refused = voiceLevels(room, () => {
      throw new Error('NotAllowedError')
    })
    assert.equal(refused.voiceLevel('ana'), 0)
    const broken = voiceLevels(room, () => ({
      tap: () => {
        throw new Error('NotSupportedError')
      },
      resume: () => undefined,
      close: () => undefined,
    }))
    assert.equal(broken.voiceLevel('ana'), 0)
  })
})
