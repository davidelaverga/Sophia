import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Goal, NativeTask } from '@sophia/contracts'
import {
  floorView,
  orderParticipants,
  presenceSlots,
  roomLine,
  runningWork,
  shortName,
  stageMode,
  standingOf,
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
  standing: 'editor',
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

  it('names a holder who left the room honestly, and offers it back only to an admin', () => {
    const absent = floorView('b', [luis])
    assert.deepEqual(absent.holder, { identity: 'b', name: 'someone who isn’t in the room', present: false })
    assert.equal(absent.canTake, false) // an editor would be refused by the server
    assert.equal(floorView('b', [{ ...luis, standing: 'admin' }]).canTake, true)
  })

  // Changed by amendment A06 (S1-05A, for Luis's review): viewers hold the floor and talk with Sophia; guests never do.
  it('never offers the floor to a guest, and never lets one take it; viewers may hold it (amendment A06)', () => {
    const ana = { ...person('g', 'Ana'), standing: 'guest' as const }
    const vera = { ...person('v', 'vera@sophia.test'), standing: 'viewer' as const }
    assert.deepEqual(floorView('a', [luis, davide, ana, vera]).passTargets, [davide, vera])
    assert.equal(floorView(null, [{ ...luis, standing: 'guest' }]).canTake, false)
    assert.equal(floorView(null, [{ ...luis, standing: 'viewer' }]).canTake, true)
  })

  it('reads only the standing the API signed into the token', () => {
    assert.deepEqual(['{"guest":true}', '{"role":"admin"}', '{"role":"owner"}', 'nope', undefined].map(standingOf), [
      'guest',
      'admin',
      'unknown',
      'unknown',
      'unknown',
    ])
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

  // Changed by amendment A06 (S1-05A): Sophia's voice exists now; the idle note says how she joins, and work
  // counts tasks as well as goals.
  it('says only what is true about the room', () => {
    const free = floorView(null, [luis, davide])
    assert.deepEqual(roomLine('idle', free, 0), {
      text: 'The room is ready',
      note: 'Sophia joins the conversation when someone asks her in.',
    })
    assert.equal(roomLine('live', free, 0).text, 'The floor is open')
    assert.equal(roomLine('live', floorView('a', [luis, davide]), 0).text, 'You have the floor')
    assert.equal(roomLine('live', floorView('b', [luis, davide]), 0).text, 'Davide has the floor')
    assert.equal(roomLine('live', floorView('b', [luis]), 0).text, 'Someone has the floor but isn’t here')
    assert.equal(roomLine('live', free, 2).note, 'Working on 2 tasks in the background')
    assert.equal(roomLine('idle', free, 1).note, 'Working on 1 task in the background')
  })

  it('while Sophia is in the conversation, her line is what the bridge observes', () => {
    const free = floorView(null, [luis, davide])
    const sophia = { inConversation: true, label: 'Sophia is listening to Luis', note: null }
    assert.deepEqual(roomLine('live', free, 0, sophia), {
      text: 'Sophia is listening to Luis',
      note: 'The floor is open',
    })
    assert.equal(roomLine('live', free, 1, sophia).note, 'Working on 1 task in the background')
    assert.equal(roomLine('live', free, 0, { ...sophia, inConversation: false }).text, 'The floor is open')
  })
})

const goal = (id: string, status: Goal['status']): Goal => ({
  id,
  projectId: 'p',
  title: 'Draft a brief',
  revision: 1,
  authorityEpoch: 1,
  status,
  outcome: '',
  criteria: [],
  stateRevision: 1,
})
const task = (goalId: string, phase: NativeTask['phase']): NativeTask => ({
  id: `task-${goalId}`,
  kind: 'draft_brief',
  goalId,
  attemptId: 'a',
  commandId: 'c',
  actorId: 'u',
  state: 'running',
  phase,
  createdAt: '2026-09-25T00:00:00Z',
  contextSourceId: 's',
  inputSourceIds: [],
  resultSourceId: null,
  reason: null,
})

describe('work in progress', () => {
  it('counts a brief once, although it is both a goal and a task', () => {
    assert.equal(runningWork({ goals: [goal('g1', 'running')], work: [task('g1', 'running')] }), 1)
    assert.equal(roomLine('live', floorView(null, []), 1).note, 'Working on 1 task in the background')
  })

  it('counts a queued brief before its goal runs, and separate goals separately', () => {
    assert.equal(runningWork({ goals: [goal('g1', 'ready')], work: [task('g1', 'queued')] }), 1)
    assert.equal(
      runningWork({ goals: [goal('g1', 'running'), goal('g2', 'checking')], work: [task('g1', 'running')] }),
      2,
    )
  })

  it('does not count finished or held work', () => {
    assert.equal(
      runningWork({ goals: [goal('g1', 'held')], work: [task('g1', 'held'), task('g2', 'result_ready')] }),
      0,
    )
  })
})
