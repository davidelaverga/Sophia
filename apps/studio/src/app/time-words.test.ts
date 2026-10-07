import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  about,
  ago,
  clock,
  dayInSentence,
  dayLabel,
  dayOf,
  inTime,
  lasted,
  roughly,
  sameDay,
  when,
} from './time-words.ts'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const S = 1000
const MIN = 60 * S
const H = 60 * MIN
const DAY = 24 * H
const before = (ms: number) => new Date(NOW - ms).toISOString()
const after = (ms: number) => new Date(NOW + ms).toISOString()

describe('ago', () => {
  it('in minutes, hours, then days, rounded down: never more time than has passed', () => {
    const words = [0, 59 * S, MIN, 90 * S, 59 * MIN + 59 * S, H, 23 * H + 59 * MIN, DAY, 2 * DAY + 23 * H].map((ms) =>
      ago(before(ms), NOW),
    )
    assert.deepEqual(words, [
      'just now',
      'just now',
      '1 min ago',
      '1 min ago',
      '59 min ago',
      '1 h ago',
      '23 h ago',
      '1 day ago',
      '2 days ago',
    ])
  })

  it('to the second for live readings: just now under a second, then seconds under a minute', () => {
    const words = [500, S, 59 * S, MIN].map((ms) => ago(before(ms), NOW, { seconds: true }))
    assert.deepEqual(words, ['just now', '1 s ago', '59 s ago', '1 min ago'])
  })

  it('a time a little ahead (another clock) is just now, never a negative', () => {
    assert.equal(ago(after(5 * S), NOW), 'just now')
  })
})

describe('lasted', () => {
  it('under a minute, minutes, hours and minutes, then days', () => {
    const words = [30 * S, MIN, 38 * MIN, H, H + 12 * MIN, 3 * H, 23 * H + 59 * MIN, DAY, 2 * DAY + 5 * H].map(lasted)
    assert.deepEqual(words, [
      'under a minute',
      '1 min',
      '38 min',
      '1 h',
      '1 h 12 min',
      '3 h',
      '23 h 59 min',
      '1 day',
      '2 days',
    ])
  })
})

describe('roughly', () => {
  it('its largest unit, rounded down: never more than has passed', () => {
    assert.deepEqual([30 * S, 90 * S, 3 * H + 50 * MIN, DAY + 23 * H].map(roughly), [
      'under a minute',
      '1 min',
      '3 h',
      '1 day',
    ])
  })
})

describe('about', () => {
  it('to the nearest, at least a minute; in hours up to two days, where a reset in 36 h matters to the hour', () => {
    assert.deepEqual(
      [10 * S, 20 * MIN, 59 * MIN + 40 * S, 3 * H, 23 * H + 40 * MIN, 36 * H, 47 * H + 40 * MIN].map(about),
      ['1 min', '20 min', '1 h', '3 h', '24 h', '36 h', '2 days'],
    )
  })
})

describe('inTime', () => {
  it('in a moment, then minutes, hours and days, to the nearest: an estimate', () => {
    const words = [30 * S, 90 * S, 12 * MIN, 59 * MIN, 3 * H + 20 * MIN, 36 * H, 2 * DAY + 2 * H].map((ms) =>
      inTime(after(ms), NOW),
    )
    assert.deepEqual(words, ['in a moment', 'in 2 min', 'in 12 min', 'in 59 min', 'in 3 h', 'in 36 h', 'in 2 days'])
  })

  it('a time already past is in a moment, never a negative', () => {
    assert.equal(inTime(before(5 * MIN), NOW), 'in a moment')
  })
})

// Dates in the viewer's own zone: built from local parts, so the checks hold in any zone they run in.
const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)
const TODAY = local(2026, 10, 7, 12).getTime()

describe('dayOf · clock · when', () => {
  it('the date, the year only when it isn’t this one; a 24-hour clock', () => {
    assert.equal(dayOf(local(2026, 10, 6), TODAY), 'Oct 6')
    assert.equal(dayOf(local(2025, 12, 31), TODAY), 'Dec 31, 2025')
    assert.equal(clock(local(2026, 10, 6, 9, 5)), '09:05')
    assert.equal(clock(local(2026, 10, 6, 21, 40)), '21:40')
    assert.equal(when(local(2026, 10, 6, 9, 12), TODAY), 'Oct 6, 09:12')
    assert.equal(when(local(2025, 3, 2, 0, 0), TODAY), 'Mar 2, 2025, 00:00')
  })

  it('takes a timestamp as the API sends it', () => {
    assert.equal(dayOf(local(2026, 10, 6).toISOString(), TODAY), 'Oct 6')
  })
})

describe('dayLabel', () => {
  it('today, yesterday, tomorrow, a weekday within the week either way, then the date', () => {
    const words = [
      local(2026, 10, 7, 0, 1),
      local(2026, 10, 6, 23, 59),
      local(2026, 10, 8, 0, 1),
      local(2026, 10, 2),
      local(2026, 10, 12),
      local(2026, 9, 30),
      local(2026, 10, 14),
      local(2025, 10, 7),
    ].map((at) => dayLabel(at, TODAY))
    assert.deepEqual(words, ['Today', 'Yesterday', 'Tomorrow', 'Friday', 'Monday', 'Sep 30', 'Oct 14', 'Oct 7, 2025'])
  })

  it('within six days either way a weekday; seven, the date', () => {
    assert.deepEqual(
      [local(2026, 10, 1), local(2026, 10, 13), local(2026, 9, 30), local(2026, 10, 14)].map((at) =>
        dayLabel(at, TODAY),
      ),
      ['Thursday', 'Tuesday', 'Sep 30', 'Oct 14'],
    )
  })

  it('for what has happened, a time a little past now is today, never tomorrow', () => {
    const late = local(2026, 10, 7, 23, 59)
    const ahead = new Date(late.getTime() + 2 * MIN)
    assert.equal(dayLabel(ahead, late.getTime()), 'Tomorrow')
    assert.equal(dayLabel(ahead, late.getTime(), { past: true }), 'Today')
    assert.equal(dayInSentence(ahead, late.getTime(), { past: true }), 'today')
  })

  it('a time that isn’t one says nothing, rather than breaking the page', () => {
    assert.deepEqual(
      [dayOf('not a time', TODAY), clock('not a time'), when('not a time', TODAY), dayLabel('not a time', TODAY)],
      ['', '', '', ''],
    )
  })

  it('same day, in the viewer’s zone', () => {
    assert.equal(sameDay(local(2026, 10, 7, 0, 1), local(2026, 10, 7, 23, 59)), true)
    assert.equal(sameDay(local(2026, 10, 7, 23, 59), local(2026, 10, 8, 0, 1)), false)
  })

  it('inside a sentence, only today, yesterday and tomorrow drop their capital', () => {
    assert.deepEqual(
      [local(2026, 10, 7), local(2026, 10, 6), local(2026, 10, 8), local(2026, 10, 2)].map((at) =>
        dayInSentence(at, TODAY),
      ),
      ['today', 'yesterday', 'tomorrow', 'Friday'],
    )
  })
})
