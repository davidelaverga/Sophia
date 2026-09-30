import assert from 'node:assert/strict'
import { it } from 'node:test'
import { receiveChat, type ChatTurn } from './chat-view.ts'
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
