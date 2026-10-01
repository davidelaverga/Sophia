import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lookupAll } from './presence.ts'

describe('looking up who is in many rooms', () => {
  it('asks at most `limit` at a time, and answers in order', async () => {
    let now = 0
    let most = 0
    const lookup = async (room: number) => {
      now += 1
      most = Math.max(most, now)
      await new Promise((resolve) => setTimeout(resolve, 5))
      now -= 1
      return `room ${String(room)}`
    }
    const rooms = Array.from({ length: 20 }, (_, i) => i)
    const found = await lookupAll(rooms, 4, 10_000, lookup)
    assert.equal(most, 4)
    assert.deepEqual(
      found,
      rooms.map((r) => `room ${String(r)}`),
    )
  })

  it('asks nothing more once its time is up: the rest are unknown (null)', async () => {
    let clock = 0
    const asked: number[] = []
    const lookup = (room: number) => {
      asked.push(room)
      clock += 1000 // each answer takes a second
      return Promise.resolve(`room ${String(room)}`)
    }
    const found = await lookupAll([0, 1, 2, 3, 4], 1, 2500, lookup, () => clock)
    assert.deepEqual(asked, [0, 1, 2])
    assert.deepEqual(found, ['room 0', 'room 1', 'room 2', null, null])
  })
})
