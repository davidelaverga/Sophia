import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { floorView, orderParticipants, type RoomParticipant } from './room-view.ts'

const person = (identity: string, name: string, local = false): RoomParticipant => ({
  identity,
  name,
  speaking: false,
  micOn: true,
  local,
})
const luis = person('a', 'luis@sophia.test', true)
const davide = person('b', 'davide@sophia.test')

describe('floor view', () => {
  it('offers a free floor to whoever is in the room', () => {
    assert.deepEqual(floorView(null, [luis, davide]), { holder: null, mine: false, canTake: true, passTargets: [] })
    assert.equal(floorView(null, []).canTake, false) // not in the room: nothing to take
  })

  it('lets the holder pass it to the others, and only the holder', () => {
    const mine = floorView('a', [luis, davide])
    assert.deepEqual([mine.mine, mine.passTargets], [true, [davide]])
    const theirs = floorView('b', [luis, davide])
    assert.deepEqual(
      [theirs.mine, theirs.canTake, theirs.passTargets, theirs.holder],
      [false, false, [], { identity: 'b', name: 'davide@sophia.test', present: true }],
    )
  })

  it('names a holder who left the room honestly, and offers to take it back', () => {
    const absent = floorView('b', [luis])
    assert.deepEqual(absent.holder, { identity: 'b', name: 'someone who isn’t in the room', present: false })
    assert.equal(absent.canTake, true)
  })

  it('lists yourself first, then the others by name', () => {
    const zed = person('c', 'zed@sophia.test')
    assert.deepEqual(
      orderParticipants([zed, davide, luis]).map((p) => p.identity),
      ['a', 'b', 'c'],
    )
  })
})
