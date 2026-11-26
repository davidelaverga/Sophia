import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dayBreaks, goesOn, todayAfter } from './chat-days.ts'

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

const at = (m: number, s = 0) => `2026-11-22T10:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`
const said = (actorId: string, createdAt: string, type: 'entry' | 'withdrawn' = 'entry') => ({
  type,
  actorId,
  createdAt,
})
const none = () => false

describe('a message that goes on the one before (chat-pace.md)', () => {
  it('the same author in the same minute: one name and time for the run', () => {
    const lines = [said('ana', at(1, 5)), said('ana', at(1, 40)), said('ana', at(1, 59)), said('ana', at(2, 1))]
    assert.deepEqual(goesOn(lines, [null, null, null, null], none), [false, true, true, false])
  })

  it('another author, a day line, a withdrawn place or a line kept apart start again', () => {
    const lines = [said('ana', at(1)), said('luis', at(1)), said('luis', at(1)), said('luis', at(1), 'withdrawn')]
    assert.deepEqual(goesOn(lines, [null, null, 'Today', null], none), [false, false, false, false])
    const two = [said('ana', at(1)), said('ana', at(1))]
    assert.deepEqual(
      goesOn(two, [null, null], (i) => i === 1),
      [false, false],
    )
  })

  it('a time that isn’t one never groups', () => {
    assert.deepEqual(goesOn([said('ana', 'soon'), said('ana', 'soon')], [null, null], none), [false, false])
  })
})
