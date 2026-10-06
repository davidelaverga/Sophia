import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RoomEvent, type Participant, type Room } from 'livekit-client'
import {
  decodeFollowing,
  decodePacket,
  encodeAsk,
  encodeFollowing,
  FOLLOWING_TOPIC,
  followingSignal,
} from './following-signal.ts'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('what a member says they follow', () => {
  it('carries a version, or nothing, both ways', () => {
    assert.equal(decodeFollowing(encodeFollowing('v1')), 'v1')
    assert.equal(decodeFollowing(encodeFollowing(null)), null)
  })

  it('reads anything else as no packet of its own, never as a version', () => {
    assert.equal(decodeFollowing(bytes('not json')), undefined)
    assert.equal(decodeFollowing(bytes('{}')), undefined)
    assert.equal(decodeFollowing(bytes('{"following":7}')), undefined)
    assert.equal(decodeFollowing(bytes('{"following":""}')), undefined)
    assert.equal(decodeFollowing(bytes('null')), undefined)
  })
})

const person = (identity: string, metadata: string) => ({ identity, metadata }) as Participant
const ANA = person('ana', JSON.stringify({ role: 'editor' }))
const BEN = person('ben', JSON.stringify({ role: 'viewer' }))
const GUEST = person('gus', JSON.stringify({ guest: true }))
const SOPHIA = person('sophia', JSON.stringify({ sophia: true }))
/** Someone the API signed no standing for: not a member either. */
const NOBODY = person('nob', '{}')

/** A room that keeps its listeners and what was sent, to play it as LiveKit would. */
function fakeRoom(present: Participant[]) {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const sent: { to: string[]; following?: string | null | undefined; ask?: true }[] = []
  const remote = new Map(present.map((p) => [p.identity, p]))
  const room = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
    },
    remoteParticipants: remote,
    localParticipant: {
      publishData: (data: Uint8Array, opts: { destinationIdentities: string[]; topic: string }) => {
        assert.equal(opts.topic, FOLLOWING_TOPIC)
        const packet = decodePacket(data)
        sent.push(
          packet && 'ask' in packet
            ? { to: opts.destinationIdentities, ask: true }
            : { to: opts.destinationIdentities, following: decodeFollowing(data) },
        )
        return Promise.resolve()
      },
    },
  }
  const emit = (event: string, ...args: unknown[]) => {
    for (const fn of listeners.get(event) ?? []) fn(...args)
  }
  return { room: room as unknown as Room, emit, sent, remote }
}

describe('saying it to the room', () => {
  it('goes to the members only, and only when it changes', () => {
    const { room, sent } = fakeRoom([ANA, GUEST, SOPHIA, BEN, NOBODY])
    const signal = followingSignal(room, () => undefined)
    signal.set(null) // nothing yet: nothing to say
    signal.set('v1')
    signal.set('v1')
    signal.set(null)
    assert.deepEqual(sent, [
      { to: ['ana', 'ben'], following: 'v1' },
      { to: ['ana', 'ben'], following: null },
    ])
  })

  it('tells whoever joins what this person follows, never a guest', () => {
    const { room, emit, sent } = fakeRoom([])
    const signal = followingSignal(room, () => undefined)
    signal.set('v1')
    emit(RoomEvent.ParticipantConnected, GUEST)
    emit(RoomEvent.ParticipantConnected, ANA)
    assert.deepEqual(sent, [{ to: ['ana'], following: 'v1' }])
  })
})

describe('hearing it from the room', () => {
  it('keeps each member’s word by who sent it, forgets whoever leaves, and ignores guests', () => {
    const { room, emit } = fakeRoom([ANA, GUEST])
    let changes = 0
    const signal = followingSignal(room, () => (changes += 1))
    emit(RoomEvent.DataReceived, encodeFollowing('v1'), ANA, undefined, FOLLOWING_TOPIC)
    emit(RoomEvent.DataReceived, encodeFollowing('v1'), GUEST, undefined, FOLLOWING_TOPIC)
    emit(RoomEvent.DataReceived, encodeFollowing('v1'), BEN, undefined, 'another.topic')
    assert.equal(signal.of('ana'), 'v1')
    assert.equal(signal.of('gus'), null)
    assert.equal(signal.of('ben'), null)
    assert.equal(changes, 1)
    emit(RoomEvent.ParticipantDisconnected, ANA)
    assert.equal(signal.of('ana'), null)
  })
})

describe('after a drop', () => {
  it('asks the members what they follow, forgets what it heard until they answer, and says its own, nothing too', () => {
    const { room, emit, sent } = fakeRoom([ANA, BEN, GUEST])
    const signal = followingSignal(room, () => undefined, { resync: true })
    signal.set('v1')
    signal.set(null)
    emit(RoomEvent.DataReceived, encodeFollowing('v2'), ANA, undefined, FOLLOWING_TOPIC)
    sent.length = 0
    emit(RoomEvent.Reconnected)
    assert.equal(signal.of('ana'), null)
    assert.deepEqual(sent, [
      { to: ['ana', 'ben'], following: null },
      { to: ['ana', 'ben'], ask: true },
    ])
    emit(RoomEvent.DataReceived, encodeFollowing('v2'), ANA, undefined, FOLLOWING_TOPIC)
    assert.equal(signal.of('ana'), 'v2')
  })

  it('answers a member’s ask to that member only, nothing included; a guest’s ask, never', () => {
    const { room, emit, sent } = fakeRoom([ANA, BEN, GUEST])
    followingSignal(room, () => undefined, { resync: true })
    emit(RoomEvent.DataReceived, encodeAsk(), ANA, undefined, FOLLOWING_TOPIC)
    emit(RoomEvent.DataReceived, encodeAsk(), GUEST, undefined, FOLLOWING_TOPIC)
    assert.deepEqual(sent, [{ to: ['ana'], following: null }])
  })

  it('reads an ask as no following, and a following as no ask', () => {
    assert.equal(decodeFollowing(encodeAsk()), undefined)
    assert.deepEqual(decodePacket(encodeAsk()), { ask: true })
    assert.deepEqual(decodePacket(encodeFollowing('v1')), { following: 'v1' })
    assert.equal(decodePacket(bytes('{}')), undefined)
  })
})

describe('without the vision flag', () => {
  it('a drop says nothing and asks nothing, and an ask goes unanswered', () => {
    const { room, emit, sent } = fakeRoom([ANA, BEN])
    followingSignal(room, () => undefined)
    emit(RoomEvent.Reconnected)
    emit(RoomEvent.DataReceived, encodeAsk(), ANA, undefined, FOLLOWING_TOPIC)
    assert.deepEqual(sent, [])
  })
})
