import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fitScale, MAX_FIT, zoomStep } from './pdf-zoom.ts'

describe('the PDF viewer’s zoom', () => {
  it('steps through 25–400 %, from wherever fit-width left it, and stops at the ends', () => {
    assert.equal(zoomStep(1, true), 1.25)
    assert.equal(zoomStep(1, false), 0.75)
    assert.equal(zoomStep(1.12, true), 1.25, 'from between two steps, up to the next')
    assert.equal(zoomStep(1.12, false), 1, 'and down to the one below')
    assert.equal(zoomStep(4, true), 4)
    assert.equal(zoomStep(0.25, false), 0.25)
  })

  it('fits the widest page to the width, never below 25 % nor above 150 %', () => {
    const a4 = 595.28
    assert.equal(Math.round(fitScale(661, a4) * 100), 106, 'the side pane')
    assert.equal(fitScale(1384, a4), MAX_FIT, 'the full page stops at a reading measure')
    assert.equal(fitScale(100, a4), 0.25, 'a sliver of width')
  })
})
