import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { visionOn } from './vision.ts'

describe('the vision flag (docs/plans/prod-honesty.md)', () => {
  it('is on where the build sets it', () => {
    assert.equal(visionOn('1', ''), true)
    assert.equal(visionOn('1', '?demo=1'), true)
  })
  it('is off where the build does not set it, whatever the address says', () => {
    assert.equal(visionOn(undefined, ''), false)
    assert.equal(visionOn('0', ''), false)
    assert.equal(visionOn(undefined, '?vision=on'), false)
  })
  it('turns off for one page with `vision=off`, so a fixture page shows what production offers', () => {
    assert.equal(visionOn('1', '?vision=off'), false)
    assert.equal(visionOn('1', '?demo=1&vision=off&place=work'), false)
    assert.equal(visionOn('1', '?vision=offline'), true)
  })
})
