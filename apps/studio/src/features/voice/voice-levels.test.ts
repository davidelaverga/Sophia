import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RoomEvent, type Room } from 'livekit-client'
import { connectWithLevels, voiceLevels, type Tapper } from './voice-levels.ts'

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

/**
 * Safari's rule, as a tap maker plays it: a context made or resumed outside a press stays suspended and reads 0; one
 * made or resumed within a press runs. `press` runs what a press would.
 */
function safari() {
  let pressing = false
  const press = (act: () => void) => {
    pressing = true
    act()
    pressing = false
  }
  const make = (): Tapper => {
    let running = pressing
    return {
      tap: (t) => ({
        level: () => (running ? (t as MediaStreamTrack & { level: number }).level : 0),
        stop: () => undefined,
      }),
      resume: () => {
        if (pressing) running = true
      },
      close: () => undefined,
    }
  }
  return { press, make }
}

describe('in Safari the levels’ context is made or woken within a press (orb-follow-ups.md)', () => {
  it('made within the press that let the room’s sound play, it reads a voice first heard after it', () => {
    const { press, make } = safari()
    const { room } = fakeRoom(person('me', null), [person('ana', track(0.6))])
    const levels = voiceLevels(room, make)
    press(() => levels.wake())
    assert.equal(levels.voiceLevel('ana'), 0.6)
  })

  it('made outside a press, by a voice read before Allow audio, it is woken within Allow audio’s press', () => {
    const { press, make } = safari()
    const { room } = fakeRoom(person('me', null), [person('ana', track(0.6))])
    const levels = voiceLevels(room, make)
    assert.equal(levels.voiceLevel('ana'), 0)
    press(() => levels.wake())
    assert.equal(levels.voiceLevel('ana'), 0.6)
  })

  it('a room that never connects lets the context made for it go, once, and makes no other', () => {
    const { made, make } = counting()
    const { room, emit } = fakeRoom(person('me', null), [person('ana', track(0.6))])
    const levels = voiceLevels(room, make)
    levels.wake()
    levels.end()
    emit(RoomEvent.Disconnected)
    levels.wake()
    assert.deepEqual([made.contexts, made.closes], [1, 1])
  })

  it('after the call nothing wakes a context into being', () => {
    const { made, make } = counting()
    const { room, emit } = fakeRoom(person('me', null), [person('ana', track(0.6))])
    const levels = voiceLevels(room, make)
    emit(RoomEvent.Disconnected)
    levels.wake()
    emit(RoomEvent.AudioPlaybackStatusChanged, true)
    assert.equal(made.contexts, 0)
  })
})

/**
 * A room that also connects (`connect`, resolved unless told otherwise) and starts its sound as LiveKit 2.22.3 does: it
 * says the sound is allowed only after an await (Room.startAudio), never within the press that asked for it.
 */
function connecting(others: ReturnType<typeof person>[], connect = () => Promise.resolve()) {
  const played = fakeRoom(person('me', null), others)
  const startAudio = async () => {
    await Promise.resolve()
    played.emit(RoomEvent.AudioPlaybackStatusChanged, true)
  }
  return { ...played, room: Object.assign(played.room, { connect, startAudio }) }
}

const SERVER = 'wss://room.example.test'
const TOKEN = 'token'

describe('the room connects with its levels woken where LiveKit’s sound is (connectWithLevels, orb-follow-ups.md)', () => {
  it('connected within a press, the levels’ context is made in it, before the connect awaits', async () => {
    const { press, make } = safari()
    const { room } = connecting([person('ana', track(0.6))])
    let joined: ReturnType<typeof connectWithLevels> | undefined
    press(() => {
      joined = connectWithLevels(room, SERVER, TOKEN, make)
    })
    const { levels } = await joined!
    assert.equal(levels.voiceLevel('ana'), 0.6)
  })

  it('Allow audio’s press wakes the levels in it: LiveKit says the sound is allowed only after an await', async () => {
    const { press, make } = safari()
    const { room } = connecting([person('ana', track(0.6))])
    const sound = await connectWithLevels(room, SERVER, TOKEN, make)
    assert.equal(sound.levels.voiceLevel('ana'), 0, 'made outside a press, the context waits')
    let started: Promise<void> | undefined
    press(() => {
      started = sound.startAudio()
    })
    await started
    assert.equal(sound.levels.voiceLevel('ana'), 0.6)
  })

  it('a connect refused before it starts lets the context made for it go, once, and is said as it came', async () => {
    const { made, make } = counting()
    const refused = new Error('LiveKit doesn’t seem to be supported on this browser.')
    const { room, emit } = connecting([person('ana', track(0.6))], () => Promise.reject(refused))
    await assert.rejects(connectWithLevels(room, SERVER, TOKEN, make), refused)
    // LiveKit says no Disconnected for it: the context is let go with the refusal itself.
    assert.deepEqual([made.contexts, made.closes], [1, 1])
    emit(RoomEvent.Disconnected)
    assert.equal(made.closes, 1, 'let go once')
  })
})
