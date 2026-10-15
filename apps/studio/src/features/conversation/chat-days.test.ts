import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dayBreaks, todayAfter } from './chat-days.ts'

const local = (day: number, hour: number) => new Date(2026, 9, day, hour, 5).toISOString()
const NOW = new Date(2026, 9, 15, 18, 0).getTime()

describe('the day lines in the room’s chat (chat-times.md)', () => {
  it('opens a line at each day’s first message, in the viewer’s zone, and none for the rest', () => {
    const times = [local(8, 9), local(14, 9), local(14, 23), local(15, 0), local(15, 17)]
    assert.deepEqual(dayBreaks(times, NOW), ['Oct 8', 'Yesterday', null, 'Today', null])
  })

  it('a weekday within the week; a time that isn’t one opens nothing', () => {
    assert.deepEqual(dayBreaks([local(12, 10), 'not a time', local(12, 11)], NOW), ['Monday', null, null])
  })

  it('says Today above the turns with Sophia when the discussion before them ends on another day', () => {
    assert.equal(todayAfter(local(14, 23), NOW), true)
    assert.equal(todayAfter(local(15, 9), NOW), false)
    assert.equal(todayAfter(undefined, NOW), false)
  })
})
