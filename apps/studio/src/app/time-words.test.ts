import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { about, ago, inTime, lasted, roughly } from './time-words.ts'

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
