import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  floorView,
  orderParticipants,
  presenceSlots,
  roomLine,
  shortName,
  stageMode,
  type RoomParticipant,
} from './room-view.ts'

const person = (identity: string, name: string, local = false): RoomParticipant => ({
  identity,
  name,
  speaking: false,
  micOn: true,
  cameraOn: false,
  screenOn: false,
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

describe('room stage', () => {
  it('shortens emails to a first name', () => {
    assert.deepEqual(
      ['luis.eduardo@x.com', 'davide@sophia.test', 'Ana', 'someone who isn’t in the room'].map(shortName),
      ['Luis', 'Davide', 'Ana', 'Someone'],
    )
  })

  it('lets a shared screen take the stage, then cameras, then the light', () => {
    assert.equal(stageMode([]), 'light')
    assert.equal(stageMode([{ source: 'camera' }]), 'gallery')
    assert.equal(stageMode([{ source: 'camera' }, { source: 'screen' }]), 'present')
  })

  it('seats people on alternate sides, centered on the light', () => {
    assert.deepEqual(presenceSlots(1), [{ side: 'left', row: 0 }])
    assert.deepEqual(presenceSlots(2), [
      { side: 'left', row: 0 },
      { side: 'right', row: 0 },
    ])
    assert.deepEqual(
      presenceSlots(3).map((s) => `${s.side}${s.row}`),
      ['left-0.5', 'right0', 'left0.5'],
    )
  })

  it('says only what is true about the room', () => {
    const free = floorView(null, [luis, davide])
    assert.deepEqual(roomLine('idle', free, 0), {
      text: 'The room is ready',
      note: 'Sophia’s voice arrives with S1-05. Today the room carries yours.',
    })
    assert.equal(roomLine('live', free, 0).text, 'The floor is open')
    assert.equal(roomLine('live', floorView('a', [luis, davide]), 0).text, 'You have the floor')
    assert.equal(roomLine('live', floorView('b', [luis, davide]), 0).text, 'Davide has the floor')
    assert.equal(roomLine('live', floorView('b', [luis]), 0).text, 'Someone has the floor but isn’t here')
    assert.equal(roomLine('live', free, 2).note, 'Working on 2 goals in the background')
    assert.equal(roomLine('idle', free, 1).note, 'Working on 1 goal in the background')
  })
})
