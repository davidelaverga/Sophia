import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { clockFor } from './use-now.ts'

describe('clockFor', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 }))
  afterEach(() => mock.timers.reset())

  it('one clock a pace, whoever reads it: it moves for all at once', (t) => {
    const clock = clockFor(30_000)
    assert.equal(clockFor(30_000), clock)
    const heard: string[] = []
    t.after(clock.subscribe(() => heard.push('a')))
    t.after(clock.subscribe(() => heard.push('b')))
    mock.timers.tick(30_000)
    assert.deepEqual(heard, ['a', 'b'])
    assert.equal(clock.read(), 1_030_000)
  })

  it('runs only while someone reads it, and starts from the time it is read again', (t) => {
    const clock = clockFor(15_000)
    const heard: number[] = []
    const stop = clock.subscribe(() => heard.push(clock.read()))
    mock.timers.tick(15_000)
    stop()
    mock.timers.tick(60_000)
    assert.deepEqual(heard, [1_015_000])
    t.after(clock.subscribe(() => heard.push(clock.read())))
    assert.equal(clock.read(), 1_075_000)
    // Stopped for good: read again, it moves once a tick, not twice.
    mock.timers.tick(15_000)
    assert.deepEqual(heard, [1_015_000, 1_090_000])
  })

  it('idle for a pace or more, it is read afresh, before anyone listens again', () => {
    const clock = clockFor(45_000)
    const first = clock.read()
    mock.timers.tick(10_000)
    assert.equal(clock.read(), first) // the same within a pace: two reads in a row agree
    mock.timers.tick(50_000)
    assert.equal(clock.read(), first + 60_000)
  })

  it('another pace is another clock', (t) => {
    const fast = clockFor(15_000)
    const slow = clockFor(60_000)
    const heard: string[] = []
    t.after(fast.subscribe(() => heard.push('fast')))
    t.after(slow.subscribe(() => heard.push('slow')))
    mock.timers.tick(60_000)
    assert.deepEqual(heard, ['fast', 'fast', 'fast', 'fast', 'slow'])
  })
})
