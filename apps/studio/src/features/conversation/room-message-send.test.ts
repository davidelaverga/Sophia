import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { afterSend } from './useRoomMessage.ts'

describe('what follows a send to the room (chat-pace.md)', () => {
  it('recorded: a row it came from goes', () => {
    assert.deepEqual(afterSend(true, false, false, true), { goes: 'recorded', letGoRow: true })
  })

  it('refused: back to an empty bar, else a row of its own; its words are never lost', () => {
    assert.deepEqual(afterSend(false, true, true, false), { goes: 'bar', letGoRow: true })
    assert.deepEqual(afterSend(false, true, false, false), { goes: 'row', letGoRow: false })
    // A row's own Try again refused, the bar busy: the row stays as it was.
    assert.deepEqual(afterSend(false, true, false, true), { goes: 'nowhere', letGoRow: false })
  })

  it('no reply: nothing moves yet; its row offers it again under its key', () => {
    assert.deepEqual(afterSend(false, false, true, false), { goes: 'nowhere', letGoRow: false })
  })
})
