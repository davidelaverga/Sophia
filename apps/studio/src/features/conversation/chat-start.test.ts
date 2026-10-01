import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { startChat, type ChatStartPorts } from './chat-start.ts'

/** A room whose join gets in or not; it records the text mode and what was asked. */
function room(joins: boolean, textMode = false) {
  const seen = { textMode, joins: [] as boolean[], asked: 0 }
  const ports: ChatStartPorts = {
    textMode,
    setTextMode: (on) => {
      seen.textMode = on
      return Promise.resolve()
    },
    join: ({ textOnly }) => {
      seen.joins.push(textOnly)
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

  it('stops before joining when the microphone can’t be turned off', async () => {
    const { seen, ports } = room(true)
    const failing = { ...ports, setTextMode: () => Promise.reject(new Error('mic still on')) }
    await assert.rejects(startChat(failing), /mic still on/)
    assert.deepEqual([seen.joins, seen.asked], [[], 0])
  })
})
