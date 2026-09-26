// The pure exchange model: source evidence for S1-05A cases A09–A12 (no provider, no room).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type Assignment, ExchangeState, SETTLE_MS } from './exchange-state.ts'

const LUIS = '11111111-1111-4111-8111-111111111111'
const DAVIDE = '22222222-2222-4222-8222-222222222222'

const base = (over: Partial<Assignment> = {}): Assignment => ({
  exchangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  state: 'open',
  pauseReason: null,
  inputEpoch: 1,
  inputActorId: LUIS,
  playbackEpoch: 1,
  observationEpoch: 1,
  allowVision: true,
  looking: null,
  roomRevision: 1,
  ...over,
})

function ready(over: Partial<Assignment> = {}): ExchangeState {
  const s = new ExchangeState(base(over))
  s.provider = 'ready'
  s.setPresent([LUIS, DAVIDE], false)
  return s
}

describe('exchange state: who Google hears', () => {
  it('a joined room is not a heard room: input opens only with a ready provider and the holder present', () => {
    const s = new ExchangeState(base())
    s.setPresent([LUIS], false)
    assert.equal(s.input(0), 'closed', 'provider still connecting')
    s.provider = 'ready'
    assert.equal(s.input(0), 'admitted')
    s.setPresent([DAVIDE], false)
    assert.equal(s.input(0), 'closed', 'holder not in the room')
    assert.equal(new ExchangeState(base({ inputActorId: null })).input(0), 'closed', 'nobody holds the floor')
  })

  it('forwards only the holder’s audio, never another member’s', () => {
    const s = ready()
    assert.equal(s.mayForwardAudio(LUIS, 0), true)
    assert.equal(s.mayForwardAudio(DAVIDE, 0), false)
  })

  it('a guest (or unsigned standing) in the room pauses input, output and frames locally', () => {
    const s = ready({ looking: { participantIdentity: LUIS, source: 'screen' } })
    s.setPresent([LUIS, DAVIDE], true)
    assert.equal(s.input(0), 'paused')
    assert.equal(s.mayForwardAudio(LUIS, 0), false)
    assert.equal(s.mayPlay(s.currentGeneration()), false)
    assert.equal(s.mayForwardFrame(LUIS, 'screen', 1), false)
  })

  it('an API pause closes input and output', () => {
    const s = ready()
    s.update(base({ state: 'paused', pauseReason: 'holder_left' }), 0)
    assert.equal(s.input(0), 'paused')
    assert.equal(s.mayPlay(s.currentGeneration()), false)
  })
})

describe('exchange state: floor handoff (case A10)', () => {
  it('settles the old holder’s turn before the new holder is heard, and never re-attributes it', () => {
    const s = ready()
    s.forwarded()
    assert.deepEqual(s.attribution(), { inputEpoch: 1, actorId: LUIS })
    const change = s.update(base({ inputEpoch: 2, inputActorId: DAVIDE }), 1000)
    assert.equal(change.handoff, true)
    assert.equal(s.input(1000), 'settling')
    assert.equal(s.mayForwardAudio(DAVIDE, 1000), false, 'the new holder waits for the settle')
    assert.equal(s.mayForwardAudio(LUIS, 1000), false, 'the old holder is not heard either')
    assert.deepEqual(s.attribution(), { inputEpoch: 1, actorId: LUIS }, 'a late tool call keeps its original speaker')
    s.turnEnded()
    assert.equal(s.mayForwardAudio(DAVIDE, 1001), true)
    assert.equal(s.attribution(), null, 'nothing is attributed to the new holder until they are heard')
    s.forwarded()
    assert.deepEqual(s.attribution(), { inputEpoch: 2, actorId: DAVIDE })
  })

  it('a settle that times out cancels the old turn and admits the new holder', () => {
    const s = ready()
    s.update(base({ inputEpoch: 2, inputActorId: DAVIDE }), 1000)
    assert.equal(s.input(1000 + SETTLE_MS - 1), 'settling')
    assert.equal(s.input(1000 + SETTLE_MS), 'admitted')
    assert.equal(s.mayForwardAudio(DAVIDE, 1000 + SETTLE_MS), true)
  })

  it('epochs only move forward: an older assignment cannot reopen an older floor', () => {
    const s = ready({ inputEpoch: 3, playbackEpoch: 4, observationEpoch: 5 })
    s.update(base({ inputEpoch: 2, playbackEpoch: 1, observationEpoch: 1 }), 0)
    assert.equal(s.assignment.inputEpoch, 3)
    assert.equal(s.assignment.playbackEpoch, 4)
    assert.equal(s.assignment.observationEpoch, 5)
  })

  it('refuses an assignment for another exchange', () => {
    assert.throws(() => ready().update(base({ exchangeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }), 0))
  })

  it('a turn that ended takes its speaker with it; a lost connection does not', () => {
    const s = ready()
    s.forwarded()
    s.turnEnded()
    assert.equal(s.attribution(), null, 'a call after the turn ended answers no one’s audio')
    s.forwarded()
    s.connectionLost()
    assert.deepEqual(
      s.attribution(),
      { inputEpoch: 1, actorId: LUIS },
      'a resumed connection may repeat the turn’s call',
    )
  })

  it('a system turn (a result notice) is unattributed until the holder is heard again', () => {
    const s = ready()
    s.forwarded()
    s.systemTurn()
    assert.equal(s.attribution(), null)
    s.forwarded()
    assert.deepEqual(s.attribution(), { inputEpoch: 1, actorId: LUIS })
  })
})

describe('exchange state: Stop Speaking and Show Sophia this', () => {
  it('Stop Speaking moves the generation: older output is never played', () => {
    const s = ready()
    const before = s.currentGeneration()
    const change = s.update(base({ playbackEpoch: 2 }), 0)
    assert.equal(change.stopSpeaking, true)
    assert.equal(s.mayPlay(before), false)
    assert.equal(s.mayPlay(s.currentGeneration()), true)
  })

  it('only the selected source of the current observation epoch is sent, and only with vision allowed', () => {
    const s = ready({ looking: { participantIdentity: LUIS, source: 'screen' } })
    assert.equal(s.mayForwardFrame(LUIS, 'screen', 1), true)
    assert.equal(s.mayForwardFrame(LUIS, 'camera', 1), false)
    assert.equal(s.mayForwardFrame(DAVIDE, 'screen', 1), false)
    const change = s.update(base({ looking: null, observationEpoch: 2 }), 0)
    assert.equal(change.lookChanged, true)
    assert.equal(s.mayForwardFrame(LUIS, 'screen', 1), false, 'Stop Looking fences the old epoch')
    const off = ready({ allowVision: false, looking: { participantIdentity: LUIS, source: 'screen' } })
    assert.equal(off.mayForwardFrame(LUIS, 'screen', 1), false)
  })
})
