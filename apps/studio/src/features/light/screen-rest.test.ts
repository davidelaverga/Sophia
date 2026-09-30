import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { defaultTarget } from './engine.ts'
import { highRest, restsHigh, sameRest, wordsTop } from './screen-rest.ts'

describe('where the light rests on a screen without a room', () => {
  it('keeps the usual rest while the words fit under it', () => {
    // 1440x900: the words start at 531, so the first-time home (301 px) ends at 832
    assert.equal(wordsTop(defaultTarget(1440, 900)), 531)
    assert.equal(restsHigh(1440, 900, 301), false)
    // With 16 px of air left the words still fit; with 15 they do not
    assert.equal(restsHigh(1440, 900, 353), false)
    assert.equal(restsHigh(1440, 900, 354), true)
  })

  it('rests high when the words would run past the bottom', () => {
    // The same window and a home that lists one project: 375 px of words would end at 906
    assert.equal(restsHigh(1440, 900, 375), true)
    // A short laptop: the first-time home would end 14 px from the bottom, less than the air it needs
    assert.equal(restsHigh(1366, 768, 301), true)
  })

  it('rests high in a box held upright, whatever the words', () => {
    assert.equal(restsHigh(390, 844, 0), true)
    assert.equal(restsHigh(600, 899, 0), false)
  })

  it('starts the words sooner from the high rest, and caps the light as the usual rest does', () => {
    const high = highRest(1440, 900)
    assert.deepEqual(high, { x: 720, y: 234, radius: 270 })
    assert.equal(wordsTop(high), 369)
    // A home that lists five projects (523 px of words) fits under it at 900 px tall; under the usual rest it
    // would end at 1054
    assert.ok(wordsTop(high) + 523 <= 900)
    assert.ok(wordsTop(defaultTarget(1440, 900)) + 523 > 900)
    assert.equal(highRest(2560, 1440).radius, 320)
  })

  it('tells two rests apart by their numbers', () => {
    assert.equal(sameRest(null, null), true)
    assert.equal(sameRest(highRest(1440, 900), highRest(1440, 900)), true)
    assert.equal(sameRest(highRest(1440, 900), null), false)
    assert.equal(sameRest(highRest(1440, 900), highRest(1440, 901)), false)
  })
})
