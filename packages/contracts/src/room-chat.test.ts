import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { encodeChatPacket, parseChatPacket, type ChatInput } from './room-chat.ts'
const input: ChatInput = {
  kind: 'input',
  id: '11111111-1111-4111-8111-111111111111',
  exchangeId: '22222222-2222-4222-8222-222222222222',
  inputEpoch: 1,
  text: 'Synthetic question',
}
describe('typed transport boundaries', () => {
  it('admits bounded typed data without accepting caller-supplied authority', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...input, actorId: 'someone else', role: 'admin' }))
    assert.deepEqual(parseChatPacket(bytes), input)
  })
  it('rejects malformed UTF-8, invalid epochs, empty and oversized input', () => {
    assert.equal(parseChatPacket(new Uint8Array([255])), null)
    for (const field of [
      { inputEpoch: -1 },
      { inputEpoch: 1.5 },
      { text: ' ' },
      { text: 'x'.repeat(2001) },
      { exchangeId: 'not-an-exchange' },
    ]) {
      assert.equal(parseChatPacket(encodeChatPacket({ ...input, ...field })), null)
    }
    assert.equal(parseChatPacket(new Uint8Array(12001)), null)
  })
})
