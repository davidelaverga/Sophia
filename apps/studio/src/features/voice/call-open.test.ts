import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RoomCallbacks, RoomConnection } from './livekit-room.ts'
import { micToStart, openRoom, scopeOf, type ConnectRoom } from './call-open.ts'

const TOKEN = { roomId: 'room-1', serverUrl: 'wss://livekit.test', token: 'x.e30.y', expiresAt: '2026-10-20T00:00:00Z' }

/** A token whose payload names `sub`, as LiveKit's do. */
const tokenFor = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=+$/, '')}.s`

/** The room controller's callbacks, recording each end it hears. */
function callbacks() {
  const ends: string[] = []
  const cb = {
    onChange: () => undefined,
    onStatus: () => undefined,
    onEnded: (why: string, selfLeft?: boolean) => ends.push(`${why}${selfLeft ? ' self' : ''}`),
  } as unknown as RoomCallbacks
  return { cb, ends }
}

/** LiveKit, in the check's hands: each connect records its callbacks, and a leave says the room disconnected. */
function liveKit() {
  const made: { cb: RoomCallbacks; left: number }[] = []
  const connect: ConnectRoom = (_url, _token, cb) => {
    const one = { cb, left: 0 }
    made.push(one)
    const connection = {
      leave: () => {
        one.left += 1
        cb.onEnded('dropped', true) // LiveKit's Disconnected, CLIENT_INITIATED
        return Promise.resolve()
      },
    } as unknown as RoomConnection
    return Promise.resolve(connection)
  }
  return { made, load: () => Promise.resolve(connect) }
}

const settle = () => new Promise<void>((done) => setTimeout(done, 0))

describe('how a join opens its connection (call-open.ts)', () => {
  it('a join still wanted gets its connection, and its ends reach the room', async () => {
    const lk = liveKit()
    const { cb, ends } = callbacks()
    await openRoom(
      () => Promise.resolve(TOKEN),
      lk.load,
      () => undefined,
      cb,
      { current: () => true, still: undefined },
    )
    assert.equal(lk.made.length, 1)
    lk.made[0]?.cb.onEnded('dropped')
    assert.deepEqual(ends, ['dropped'])
  })

  it('a try no longer wanted once connected is left quietly: the end its leave reports never reaches the room', async () => {
    const lk = liveKit()
    const { cb, ends } = callbacks()
    let asked = 0
    const still = () => (asked += 1) === 1 // wanted before LiveKit, no longer once connected
    await assert.rejects(
      openRoom(
        () => Promise.resolve(TOKEN),
        lk.load,
        () => undefined,
        cb,
        { current: () => true, still },
      ),
      /no longer wanted/,
    )
    await settle()
    assert.equal(lk.made[0]?.left, 1, 'left at once')
    assert.deepEqual(ends, [], 'no end of the call’s')
  })

  it('a join overtaken, or a try too late, before LiveKit asks LiveKit for nothing', async () => {
    const lk = liveKit()
    const { cb } = callbacks()
    const issue = () => Promise.resolve(TOKEN)
    await assert.rejects(openRoom(issue, lk.load, () => undefined, cb, { current: () => false, still: undefined }))
    await assert.rejects(openRoom(issue, lk.load, () => undefined, cb, { current: () => true, still: () => false }))
    assert.equal(lk.made.length, 0)
  })

  it('names the call for the other tabs: the room and the token’s subject, the room alone without one', async () => {
    assert.equal(scopeOf({ ...TOKEN, token: tokenFor('actor-7') }), 'room-1:actor-7')
    assert.equal(scopeOf({ ...TOKEN, token: 'not a token' }), 'room-1')
    const named: string[] = []
    const lk = liveKit()
    const { cb } = callbacks()
    const issue = () => Promise.resolve({ ...TOKEN, token: tokenFor('actor-7') })
    await openRoom(issue, lk.load, (s) => named.push(s), cb, { current: () => true, still: undefined })
    assert.deepEqual(named, ['room-1:actor-7'])
  })
})

describe('the microphone a join starts with (fourth review)', () => {
  it('a carried microphone is never on unless this device’s choice is on as the join begins', () => {
    assert.equal(
      micToStart(
        true,
        () => true,
        () => false,
      )(),
      false,
      '«off» chosen since',
    )
    assert.equal(
      micToStart(
        true,
        () => false,
        () => true,
      )(),
      true,
    )
    assert.equal(
      micToStart(
        false,
        () => true,
        () => true,
      )(),
      false,
    )
  })

  it('reads the choice as the join begins, not when it was carried', () => {
    let choice = true
    const start = micToStart(
      true,
      () => true,
      () => choice,
    )
    choice = false
    assert.equal(start(), false)
  })

  it('with none carried, the join’s own default', () => {
    assert.equal(
      micToStart(
        undefined,
        () => true,
        () => false,
      )(),
      true,
    )
    assert.equal(
      micToStart(
        undefined,
        () => false,
        () => true,
      )(),
      false,
    )
  })
})
