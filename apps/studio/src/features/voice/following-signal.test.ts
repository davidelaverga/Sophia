import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RoomEvent, type Participant, type Room } from 'livekit-client'
import { decodeFollowing, encodeFollowing, FOLLOWING_TOPIC, followingSignal } from './following-signal.ts'

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
  const sent: { to: string[]; following: string | null | undefined }[] = []
  const remote = new Map(present.map((p) => [p.identity, p]))
  const room = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
    },
    remoteParticipants: remote,
    localParticipant: {
      publishData: (data: Uint8Array, opts: { destinationIdentities: string[]; topic: string }) => {
        assert.equal(opts.topic, FOLLOWING_TOPIC)
        sent.push({ to: opts.destinationIdentities, following: decodeFollowing(data) })
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
