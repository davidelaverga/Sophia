import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { afterGap, closesGap, gapAfterPage } from './segment-view.ts'

const m = (n: number) => ({
  id: `m${String(n).padStart(3, '0')}`,
  createdAt: `2026-10-01T00:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000Z`,
})
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => m(from + i))

describe('a page a search read, apart from the window (A38)', () => {
  it('has a gap after its newest message, unless the next message is shown or the page reaches the window', () => {
    const window = range(211, 260)
    assert.equal(gapAfterPage(range(51, 100), window, m(101).id), m(100).id)
    assert.equal(gapAfterPage(range(161, 210), window, m(211).id), null, 'the next message is shown')
    assert.equal(gapAfterPage(range(170, 215), window, m(216).id), null, 'overlapping')
    assert.equal(gapAfterPage([], window, m(1).id), null)
  })
  it('fills from the message just after the gap, until a page meets the found page', () => {
    const shown = [...range(51, 100), ...range(211, 260)]
    assert.deepEqual(afterGap(shown, m(100).id), m(211))
    assert.equal(afterGap(shown, m(260).id), undefined)
    assert.equal(closesGap(range(161, 210), m(100), false), false, 'still newer than the found page')
    assert.equal(closesGap(range(100, 149), m(100), false), true, 'met')
    assert.equal(closesGap(range(90, 120), m(100), false), true, 'reached past it')
    assert.equal(closesGap([], m(100), true), true, 'the chat’s start')
  })
})
