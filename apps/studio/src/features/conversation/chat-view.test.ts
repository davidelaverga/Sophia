import assert from 'node:assert/strict'
import { it } from 'node:test'
import type { SophiaPresence } from '@sophia/contracts'
import {
  chatEntry,
  chatLine,
  footError,
  reachesSophia,
  receiveChat,
  waitsOnRoom,
  type ChatMoment,
  type ChatTurn,
} from './chat-view.ts'
const turn: ChatTurn = {
  id: 'a',
  exchangeId: 'e',
  text: 'Synthetic question',
  reply: '',
  sequence: -1,
  state: 'sending',
  reason: null,
}
it('a duplicate packet or another exchange cannot duplicate a visible reply', () => {
  const accepted = receiveChat([turn], { id: 'a', exchangeId: 'e', kind: 'accepted', sequence: 0, text: '' })
  const packet = { id: 'a', exchangeId: 'e', kind: 'delta' as const, sequence: 1, text: 'Synthetic reply' }
  const received = receiveChat(accepted, packet)
  assert.deepEqual(receiveChat(received, packet), received)
  assert.deepEqual(receiveChat(received, { ...packet, exchangeId: 'another', sequence: 2 }), received)
})
it('a refused reply cannot be revived by late output', () => {
  const refused = receiveChat([turn], {
    id: 'a',
    exchangeId: 'e',
    kind: 'refused',
    sequence: 1,
    text: 'Conversation paused.',
  })
  assert.deepEqual(
    receiveChat(refused, { id: 'a', exchangeId: 'e', kind: 'delta', sequence: 2, text: 'Late content' }),
    refused,
  )
})

const sophia = (over: Partial<SophiaPresence> = {}): SophiaPresence => ({
  exchangeId: 'e',
  exchange: 'open',
  pauseReason: null,
  voice: 'ready',
  inputActorId: 'me',
  inputEpoch: 1,
  playbackEpoch: null,
  observationEpoch: null,
  allowVision: false,
  looking: null,
  reason: null,
  reportedAt: null,
  ...over,
})
const typing: ChatMoment = { starting: false, live: true, mine: true, textMode: true }

it('the chat offers one way in until there is a conversation to type into, then only the bar', () => {
  assert.equal(chatEntry(false, undefined), 'start')
  assert.equal(chatEntry(true, sophia({ exchange: 'none' })), 'start')
  // Someone else opened the exchange and this person is not in the room: still the way in, which joins them
  assert.equal(chatEntry(false, sophia()), 'start')
  assert.equal(chatEntry(true, sophia()), 'bar')
  // A paused conversation is still one: the bar stays and its line says why it waits
  assert.equal(chatEntry(true, sophia({ exchange: 'paused', pauseReason: 'holder_left' })), 'bar')
})

it('the line above the bar says why Send waits, one reason at a time', () => {
  assert.equal(chatLine(sophia(), { ...typing, starting: true }), 'Connecting to Sophia…')
  assert.equal(
    chatLine(sophia({ exchange: 'paused', pauseReason: 'guest' }), typing),
    'Sophia is paused while a guest is here.',
  )
  assert.equal(
    chatLine(sophia({ exchange: 'paused', pauseReason: 'holder_left' }), typing),
    'Sophia is paused. Resume in the room.',
  )
  assert.equal(chatLine(sophia(), { ...typing, live: false }), 'Reconnecting to the room…')
  assert.equal(chatLine(sophia({ voice: 'unavailable' }), typing), 'Sophia is unavailable right now.')
  assert.equal(chatLine(sophia({ voice: 'recovering' }), typing), 'Reconnecting to Sophia…')
  assert.equal(chatLine(sophia({ voice: 'connecting' }), typing), 'Sophia is joining…')
  assert.equal(chatLine(sophia({ voice: 'not_connected' }), typing), 'Sophia is joining…')
  assert.equal(chatLine(sophia(), { ...typing, mine: false }), 'Take the floor to message Sophia.')
})

it('once Send can work the line only names text mode, and says nothing in voice mode', () => {
  assert.equal(chatLine(sophia(), typing), 'Typing to Sophia')
  assert.equal(chatLine(sophia(), { ...typing, textMode: false }), null)
})

it('says why the call ended before an older chat error, and drops the chat’s errors out of the call', () => {
  const ended = 'You were disconnected from the room.'
  const sendFailed = 'Delivery unconfirmed. Nothing is resent automatically.'
  assert.deepEqual(footError(ended, false, sendFailed, null), { text: ended, live: false }, 'the dock announces it')
  assert.equal(footError(null, false, sendFailed, 'start failed'), null, 'left on purpose: nothing old stays')
  assert.deepEqual(footError(null, true, sendFailed, 'start failed'), { text: sendFailed, live: true })
  assert.deepEqual(footError(null, true, null, 'start failed'), { text: 'start failed', live: true })
})

it('knows when the line waits on the room’s dock (taking the floor, Resume), so the room can be shown', () => {
  assert.equal(waitsOnRoom(sophia(), { ...typing, mine: false }), true, 'Take the floor to message Sophia.')
  assert.equal(waitsOnRoom(sophia({ exchange: 'paused', pauseReason: 'holder_left' }), typing), true, 'Resume')
  assert.equal(
    waitsOnRoom(sophia({ exchange: 'paused', pauseReason: 'guest' }), typing),
    false,
    'a guest: nothing to press',
  )
  assert.equal(waitsOnRoom(sophia(), typing), false, 'typing reaches her')
  assert.equal(waitsOnRoom(sophia(), { ...typing, mine: false, live: false }), false, 'reconnecting')
  assert.equal(waitsOnRoom(sophia({ voice: 'connecting' }), { ...typing, mine: false }), false, 'she is joining')
  assert.equal(waitsOnRoom(sophia(), { ...typing, mine: false, starting: true }), false)
})

it('typed words reach Sophia only with her exchange open and her voice ready', () => {
  assert.equal(reachesSophia(sophia()), true)
  assert.equal(reachesSophia(undefined), false)
  assert.equal(reachesSophia(sophia({ exchange: 'none' })), false)
  assert.equal(reachesSophia(sophia({ exchange: 'paused', pauseReason: 'guest' })), false)
  assert.equal(reachesSophia(sophia({ voice: 'unavailable' })), false)
  assert.equal(reachesSophia(sophia({ voice: 'connecting' })), false)
})
