import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { startChat, type ChatStartPorts } from './chat-start.ts'

/**
 * A room whose join gets in or not; it records the text mode and what was asked. `endsTextMode`: text mode ends while
 * the join settles (a voice join's microphone came on and couldn't go off, or the pill went back to voice).
 */
function room(joins: boolean, textMode = false, endsTextMode = false) {
  const seen = { textMode, joins: [] as boolean[], asked: 0 }
  const ports: ChatStartPorts = {
    textMode,
    setTextMode: (on) => {
      seen.textMode = on
      return Promise.resolve()
    },
    textModeNow: () => seen.textMode,
    join: ({ textOnly }) => {
      seen.joins.push(textOnly)
      if (endsTextMode) seen.textMode = false
      return Promise.resolve(joins)
    },
    askSophia: () => {
      seen.asked += 1
      return Promise.resolve()
    },
  }
  return { seen, ports }
}

describe('Chat with Sophia', () => {
  it('joins in text and asks Sophia in', async () => {
    const { seen, ports } = room(true)
    assert.equal(await startChat(ports), true)
    assert.deepEqual(seen, { textMode: true, joins: [true], asked: 1 })
  })

  it('puts text mode back when the join doesn’t get in, so the next join is by voice', async () => {
    const { seen, ports } = room(false)
    assert.equal(await startChat(ports), false)
    assert.deepEqual(seen, { textMode: false, joins: [true], asked: 0 })
  })

  it('keeps text mode a dropped call left on: rejoining doesn’t turn on a microphone that was off', async () => {
    const { seen, ports } = room(false, true)
    assert.equal(await startChat(ports), false)
    assert.equal(seen.textMode, true)
  })

  it('keeps voice when the pill went back to it while the join failed', async () => {
    const { seen, ports } = room(false, true, true)
    assert.equal(await startChat(ports), false)
    assert.equal(seen.textMode, false)
  })

  it('stops before joining when the microphone can’t be turned off', async () => {
    const { seen, ports } = room(true)
    const failing = { ...ports, setTextMode: () => Promise.reject(new Error('mic still on')) }
    await assert.rejects(startChat(failing), /mic still on/)
    assert.deepEqual([seen.joins, seen.asked], [[], 0])
  })

  it('doesn’t ask Sophia in when text mode ended while the join settled', async () => {
    const { seen, ports } = room(true, false, true)
    assert.equal(await startChat(ports), false)
    assert.deepEqual(seen, { textMode: false, joins: [true], asked: 0 })
  })
})
