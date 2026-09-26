// The light and Sophia's line follow what is observed (S1-05A §6.5, case A15), never the room merely being live.
import type { SophiaPresence } from '@sophia/contracts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type SophiaContext, type SophiaSignal, sophiaView } from './sophia-view.ts'

const LUIS = '11111111-1111-4111-8111-111111111111'

const presence = (over: Partial<SophiaPresence> = {}): SophiaPresence => ({
  exchangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  exchange: 'open',
  pauseReason: null,
  voice: 'ready',
  inputActorId: LUIS,
  inputEpoch: 1,
  playbackEpoch: 1,
  observationEpoch: 1,
  allowVision: true,
  looking: null,
  reason: null,
  reportedAt: '2026-09-25T12:00:00Z',
  ...over,
})

const ctx = (over: Partial<SophiaContext> = {}): SophiaContext => ({
  inCall: true,
  audioBlocked: false,
  holderName: 'Luis',
  holderIsMe: false,
  myMicOn: true,
  working: false,
  nameOf: () => 'Luis',
  ...over,
})

const signal = (over: Partial<SophiaSignal> = {}): SophiaSignal => ({
  input: 'admitted',
  output: 'idle',
  audible: false,
  ...over,
})

describe('Sophia in the room', () => {
  it('with no exchange she is not in the conversation, however live the room is', () => {
    const v = sophiaView(presence({ exchange: 'none', voice: 'not_connected' }), null, ctx())
    assert.deepEqual([v.inConversation, v.light], [false, 'rest'])
    assert.equal(sophiaView(presence({ exchange: 'none' }), null, ctx({ working: true })).light, 'work')
    assert.equal(sophiaView(undefined, null, ctx()).inConversation, false)
  })

  it('listens only when the bridge says the holder’s audio is admitted', () => {
    assert.deepEqual(
      [sophiaView(presence(), signal(), ctx()).light, sophiaView(presence(), signal(), ctx()).label],
      ['listen', 'Sophia is listening to Luis'],
    )
    const closed = sophiaView(presence(), signal({ input: 'closed' }), ctx())
    assert.equal(closed.light, 'rest')
    assert.equal(
      sophiaView(presence(), null, ctx()).label,
      'Sophia is joining…',
      'her participant is not in the room here',
    )
    assert.equal(
      sophiaView(presence(), signal(), ctx({ holderIsMe: true, myMicOn: false })).note,
      'Your microphone is off',
    )
  })

  it('a connected room with the voice not ready is not a listening Sophia', () => {
    for (const voice of ['connecting', 'recovering', 'unavailable', 'not_connected'] as const) {
      const v = sophiaView(presence({ voice }), signal(), ctx())
      assert.notEqual(v.light, 'listen', voice)
      assert.notEqual(v.light, 'speak', voice)
    }
    assert.equal(sophiaView(presence({ voice: 'unavailable', reason: 'No key' }), signal(), ctx()).note, 'No key')
  })

  it('speaks only when her sound actually reaches this browser', () => {
    const audible = sophiaView(presence(), signal({ output: 'playing', audible: true }), ctx())
    assert.deepEqual([audible.light, audible.label, audible.speaking], ['speak', 'Sophia is speaking', true])
    const notHere = sophiaView(presence(), signal({ output: 'playing', audible: false }), ctx())
    assert.deepEqual([notHere.light, notHere.label], ['think', 'Sophia is answering…'])
    const blocked = sophiaView(presence(), signal({ output: 'playing', audible: true }), ctx({ audioBlocked: true }))
    assert.deepEqual([blocked.light === 'speak', blocked.needsAudio], [false, true])
    assert.equal(sophiaView(presence(), signal({ output: 'responding' }), ctx()).light, 'think')
  })

  it('says why she is paused, and never listens while paused', () => {
    const guest = sophiaView(presence({ exchange: 'paused', pauseReason: 'guest' }), signal(), ctx())
    assert.deepEqual([guest.light, guest.label], ['rest', 'Sophia is paused while a guest is here'])
    const left = sophiaView(presence({ exchange: 'paused', pauseReason: 'holder_left' }), signal(), ctx())
    assert.equal(left.label, 'Sophia paused: Luis was not in the room')
    assert.equal(sophiaView(presence(), signal({ input: 'paused' }), ctx()).light, 'rest', 'the bridge paused locally')
  })

  it('outside the call, she is in the conversation but this person cannot hear her', () => {
    const v = sophiaView(presence(), signal({ output: 'playing', audible: true }), ctx({ inCall: false }))
    assert.deepEqual([v.light, v.label], ['rest', 'Sophia is in the conversation'])
  })

  it('shows what she is looking at, wherever the person is', () => {
    const v = sophiaView(
      presence({ looking: { participantIdentity: LUIS, source: 'screen' } }),
      signal(),
      ctx({ inCall: false }),
    )
    assert.equal(v.looking, 'Sophia sees Luis’s screen')
    assert.equal(sophiaView(presence(), signal(), ctx()).looking, null)
    const mine = sophiaView(
      presence({ looking: { participantIdentity: LUIS, source: 'camera' } }),
      signal(),
      ctx({ nameOf: () => 'you' }),
    )
    assert.equal(mine.looking, 'Sophia sees your camera')
  })

  it('a handoff settles before the new holder is heard', () => {
    assert.deepEqual(
      [
        sophiaView(presence(), signal({ input: 'settling' }), ctx()).light,
        sophiaView(presence(), signal({ input: 'settling' }), ctx()).label,
      ],
      ['think', 'Handing over to Luis…'],
    )
  })
})
